// Generador del guardián de riesgo para MetaTrader 5 (VictorGuard.mq5).
// NO decide entradas: el usuario decide; el guardián impone las reglas que
// el propio usuario definió en VICTOR. Se descarga como archivo .mq5 y se
// compila en MetaEditor (F7). Probar siempre primero en demo.
// Texto del archivo en ASCII (sin acentos) para que MetaEditor no lo corrompa.

export type ParametrosGuardian = {
  simbolo: string;
  riesgoPct: number;
  distanciaPips: number; // distancia del stop en pips
  tamanoPip: number; // tamano de 1 pip en precio (ej. 0.1 oro, 0.0001 EURUSD, 1 NAS100)
  relacionTP: number;
  maxPerdedoresDia: number;
  perdidaMaxDiaUSD: number;
  equityMinimoUSD: number;
  maxAbiertos: number;
  maxTradesDia: number; // 0 = sin limite
  esperaTrasPerdidaMin: number; // 0 = sin espera
  bloquearSLTP: boolean;
  bloquearCierreManual: boolean;
};

const n = (v: number, d = 2) => {
  const x = Number.isFinite(v) ? v : 0;
  return String(Number(x.toFixed(d)));
};
const b = (v: boolean) => (v ? "true" : "false");
const sym = (s: string) => s.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) || "XAUUSD";

export function generarGuardianMQ5(p: ParametrosGuardian): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return String.raw`//+------------------------------------------------------------------+
//|  VictorGuard.mq5 - Guardian de riesgo (generado por VICTOR CFO)   |
//|  Generado: ${fecha}                                               |
//|  NO decide entradas. Tu decides; el guardian impone TUS reglas:  |
//|   - calcula el lote segun tu riesgo                               |
//|   - pone SL y TP a todo trade                                     |
//|   - limite de trades abiertos, perdedores y perdida del dia       |
//|   - espera obligatoria tras una perdida                           |
//|  Todos los valores se pueden cambiar en MT5 > pestana Entradas.   |
//|  Probar SIEMPRE en demo primero. No es asesoria financiera.       |
//+------------------------------------------------------------------+
#property strict
#property version   "2.00"
#include <Trade\Trade.mqh>

CTrade trade;

input string AllowedSymbol      = "${sym(p.simbolo)}"; // unico simbolo permitido
input double RiskPercent        = ${n(p.riesgoPct)};      // % del balance a arriesgar por trade
input double SLPips             = ${n(p.distanciaPips, 2)};      // distancia del SL en pips
input double PipSize            = ${n(p.tamanoPip, 5)};      // tamano de 1 pip en precio (oro 0.1, EURUSD 0.0001, USDJPY 0.01, NAS100/US30 1)
input double RewardRatio        = ${n(p.relacionTP)};      // TP = SL x este numero
input int    MaxLosersPerDay    = ${Math.max(1, Math.round(p.maxPerdedoresDia))};        // perdedores maximos por dia
input double MaxDailyLossUSD    = ${n(p.perdidaMaxDiaUSD)};     // perdida diaria maxima en dolares (incluye flotante)
input double MinEquityUSD       = ${n(p.equityMinimoUSD)};    // si el equity baja de aqui: bloqueo total
input int    MaxOpenPositions   = ${Math.max(1, Math.round(p.maxAbiertos))};        // trades abiertos a la vez
input int    MaxTradesPerDay    = ${Math.max(0, Math.round(p.maxTradesDia))};        // trades maximos por dia (0 = sin limite)
input int    CooldownMin        = ${Math.max(0, Math.round(p.esperaTrasPerdidaMin))};       // minutos de espera tras una perdida (0 = sin espera)
input int    DeviationPts       = 30;       // deslizamiento maximo
input bool   LockSLTP           = ${b(p.bloquearSLTP)};     // true = si mueves o quitas SL/TP, el guardian los restaura
input bool   BlockOnManualClose = ${b(p.bloquearCierreManual)};     // true = cerrar un trade a mano bloquea el resto del dia

string P = "VG_";
double SLDistance = 0;   // = SLPips x PipSize (se calcula al iniciar)

//------------------------------------------------------------------
double LossPerLot(double dist)
{
   double ts = SymbolInfoDouble(AllowedSymbol, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(AllowedSymbol, SYMBOL_TRADE_TICK_VALUE);
   if(ts <= 0) return 0;
   return dist / ts * tv;
}

double CalcLot(double dist)
{
   double lpl = LossPerLot(dist);
   if(lpl <= 0) return 0;
   double risk = AccountInfoDouble(ACCOUNT_BALANCE) * RiskPercent / 100.0;
   double step = SymbolInfoDouble(AllowedSymbol, SYMBOL_VOLUME_STEP);
   double minL = SymbolInfoDouble(AllowedSymbol, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(AllowedSymbol, SYMBOL_VOLUME_MAX);
   double lot  = MathFloor(risk / lpl / step) * step;
   if(lot < minL) lot = minL;
   if(lot > maxL) lot = maxL;
   return NormalizeDouble(lot, 2);
}

// true si hasta el lote minimo excede el riesgo permitido (cuenta muy chica)
bool RiskTooHigh(double lot, double dist)
{
   double risk = AccountInfoDouble(ACCOUNT_BALANCE) * RiskPercent / 100.0;
   return (lot * LossPerLot(dist) > risk * 1.5);
}

//------------------------------------------------------------------
void DayStats(int &losers, double &pl, int &manual, int &closed, datetime &lastLoss)
{
   losers = 0; pl = 0; manual = 0; closed = 0; lastLoss = 0;
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   t.hour = 0; t.min = 0; t.sec = 0;
   datetime start = StructToTime(t);
   if(!HistorySelect(start, TimeCurrent() + 60)) return;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      long type  = HistoryDealGetInteger(tk, DEAL_TYPE);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      double p = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_COMMISSION)
               + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_FEE);
      pl += p;
      closed++;
      if(p < 0)
      {
         losers++;
         datetime dt = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
         if(dt > lastLoss) lastLoss = dt;
      }
      // cierre manual (terminal, celular o web). Los cierres por SL/TP o del EA no cuentan.
      long reason = HistoryDealGetInteger(tk, DEAL_REASON);
      if(reason == DEAL_REASON_CLIENT || reason == DEAL_REASON_MOBILE || reason == DEAL_REASON_WEB) manual++;
   }
}

double FloatingPL()
{
   double f = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      f += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }
   return f;
}

// bloqueo duro: cierra todo y no deja operar
bool IsBlocked(string &why)
{
   int losers, manual, closed; double pl; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);
   double total = pl + FloatingPL();
   if(BlockOnManualClose && manual > 0)        { why = "BLOQUEADO: cerraste un trade a mano hoy"; return true; }
   if(losers >= MaxLosersPerDay)               { why = "BLOQUEADO: " + IntegerToString(losers) + " perdedores hoy"; return true; }
   if(total <= -MaxDailyLossUSD)               { why = "BLOQUEADO: perdida diaria maxima"; return true; }
   if(AccountInfoDouble(ACCOUNT_EQUITY) <= MinEquityUSD) { why = "BLOQUEADO: equity minimo. Revisa tu plan."; return true; }
   why = "OK | perdedores hoy: " + IntegerToString(losers) + "/" + IntegerToString(MaxLosersPerDay)
       + " | P/L hoy: " + DoubleToString(total, 2);
   return false;
}

// bloqueo suave: no cierra nada, solo impide ABRIR otro trade ahora
bool CanOpenNew(string &why)
{
   if(IsBlocked(why)) return false;
   int losers, manual, closed; double pl; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);
   if(MaxTradesPerDay > 0 && closed + PositionsTotal() >= MaxTradesPerDay)
   { why = "Limite de trades del dia (" + IntegerToString(MaxTradesPerDay) + ")"; return false; }
   if(CooldownMin > 0 && lastLoss > 0)
   {
      long left = (long)CooldownMin * 60 - (long)(TimeCurrent() - lastLoss);
      if(left > 0)
      { why = "ESPERA " + IntegerToString((int)(left / 60)) + " min tras la perdida"; return false; }
   }
   return true;
}

//------------------------------------------------------------------
void Guard()
{
   string why;
   bool blocked = IsBlocked(why);
   int kept = 0;
   double maxLot = CalcLot(SLDistance);
   int digits = (int)SymbolInfoInteger(AllowedSymbol, SYMBOL_DIGITS);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      double vol = PositionGetDouble(POSITION_VOLUME);
      long   typ = PositionGetInteger(POSITION_TYPE);
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl  = PositionGetDouble(POSITION_SL);
      double tp  = PositionGetDouble(POSITION_TP);

      // reglas que cierran el trade
      if(blocked || sym != AllowedSymbol || kept >= MaxOpenPositions || vol > maxLot + 0.0000001)
      {
         trade.PositionClose(tk);
         continue;
      }
      kept++;

      // SL/TP bloqueados: si ya los fijamos antes, cualquier cambio se revierte
      string ksl = P + "SL_" + (string)tk, ktp = P + "TP_" + (string)tk;
      if(LockSLTP && GlobalVariableCheck(ksl) && GlobalVariableCheck(ktp))
      {
         double lsl = GlobalVariableGet(ksl), ltp = GlobalVariableGet(ktp);
         double pt = SymbolInfoDouble(AllowedSymbol, SYMBOL_POINT);
         if(MathAbs(sl - lsl) > pt / 2 || MathAbs(tp - ltp) > pt / 2)
            trade.PositionModify(tk, lsl, ltp);
         continue;
      }

      // SL/TP obligatorios y SL no mas lejos de 1.5x lo permitido
      bool buy = (typ == POSITION_TYPE_BUY);
      double newSL = sl, newTP = tp;
      if(sl == 0 || MathAbs(op - sl) > SLDistance * 1.5)
         newSL = buy ? op - SLDistance : op + SLDistance;
      if(tp == 0)
         newTP = buy ? op + SLDistance * RewardRatio : op - SLDistance * RewardRatio;
      newSL = NormalizeDouble(newSL, digits);
      newTP = NormalizeDouble(newTP, digits);
      if(newSL != sl || newTP != tp)
         trade.PositionModify(tk, newSL, newTP);
      if(LockSLTP)
      {
         GlobalVariableSet(ksl, newSL);
         GlobalVariableSet(ktp, newTP);
      }
   }
}

//------------------------------------------------------------------
void OpenTrade(bool buy)
{
   string why;
   if(_Symbol != AllowedSymbol) { Alert("VictorGuard: solo se opera ", AllowedSymbol); return; }
   if(!CanOpenNew(why))         { Alert("VictorGuard: ", why); return; }
   if(PositionsTotal() >= MaxOpenPositions) { Alert("VictorGuard: ya tienes el maximo de trades abiertos"); return; }

   double lot = CalcLot(SLDistance);
   if(lot <= 0 || RiskTooHigh(lot, SLDistance))
   { Alert("VictorGuard: el lote minimo arriesga demasiado para esta cuenta. Baja SLDistance o sube el capital."); return; }

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double price = buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = buy ? price - SLDistance : price + SLDistance;
   double tp = buy ? price + SLDistance * RewardRatio : price - SLDistance * RewardRatio;
   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   bool ok = buy ? trade.Buy(lot, _Symbol, 0, sl, tp, "VictorGuard")
                 : trade.Sell(lot, _Symbol, 0, sl, tp, "VictorGuard");
   if(!ok) Alert("VictorGuard: error al abrir (", trade.ResultRetcode(), ")");
}

//------------------------------------------------------------------
void MakeButton(string name, string text, int x, int y, color bg)
{
   ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, 110);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 32);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
}

void UpdatePanel()
{
   string why;
   if(!IsBlocked(why))
   {
      string w2;
      if(!CanOpenNew(w2)) why = w2;
   }
   double lot = CalcLot(SLDistance);
   string txt = why + " | lote: " + DoubleToString(lot, 2)
              + " | riesgo $" + DoubleToString(lot * LossPerLot(SLDistance), 2);
   ObjectSetString(0, P + "ST", OBJPROP_TEXT, txt);

   // Cuenta regresiva para el cierre de la vela actual
   long left = (long)PeriodSeconds() - (long)(TimeCurrent() - iTime(_Symbol, _Period, 0));
   if(left < 0) left = 0;
   long h = left / 3600, m = (left % 3600) / 60, s = left % 60;
   string tm = (h > 0 ? IntegerToString(h) + ":" : "")
             + StringFormat("%02d:%02d", (int)m, (int)s);
   ObjectSetString(0, P + "TM", OBJPROP_TEXT, "Cierra la vela en " + tm);
}

int OnInit()
{
   trade.SetDeviationInPoints(DeviationPts);
   SLDistance = SLPips * PipSize;
   if(SLDistance <= 0) { Alert("VictorGuard: SLPips y PipSize deben ser mayores que 0"); return INIT_PARAMETERS_INCORRECT; }
   MakeButton(P + "BUY",  "COMPRAR", 10, 30, clrSeaGreen);
   MakeButton(P + "SELL", "VENDER",  130, 30, clrFireBrick);
   ObjectCreate(0, P + "ST", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "ST", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "ST", OBJPROP_YDISTANCE, 70);
   ObjectSetInteger(0, P + "ST", OBJPROP_COLOR, clrOrange);
   ObjectSetInteger(0, P + "ST", OBJPROP_FONTSIZE, 10);
   ObjectCreate(0, P + "TM", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "TM", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "TM", OBJPROP_YDISTANCE, 95);
   ObjectSetInteger(0, P + "TM", OBJPROP_COLOR, clrDeepSkyBlue);
   ObjectSetInteger(0, P + "TM", OBJPROP_FONTSIZE, 12);
   EventSetTimer(1);
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, P);
}

void OnTimer()  { Guard(); UpdatePanel(); }
void OnTick()   { Guard(); }

void OnChartEvent(const int id, const long &lp, const double &dp, const string &sp)
{
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sp == P + "BUY")  { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(true); }
   if(sp == P + "SELL") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(false); }
}
`;
}
