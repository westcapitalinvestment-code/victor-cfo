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
  perdidaMaxDiaPct: number; // % del balance con que empezo el dia
  perdidaMaxDiaUSD: number; // dolares fijos (0 = usar el %)
  equityMinimoPct: number; // % del balance con que empezo el dia
  equityMinimoUSD: number; // dolares fijos (0 = usar el %)
  maxAbiertos: number;
  maxTradesDia: number; // 0 = sin limite
  esperaTrasPerdidaMin: number; // 0 = sin espera
  modoBloqueo: "total" | "flexible" | "ninguno";
  bloquearCierreManual: boolean;
  syncUrl?: string; // direccion de VICTOR para sincronizar (vacio = sin sincronizacion)
  syncToken?: string; // token de la cuenta
};

const n = (v: number, d = 2) => {
  const x = Number.isFinite(v) ? v : 0;
  return String(Number(x.toFixed(d)));
};
const b = (v: boolean) => (v ? "true" : "false");
const q = (s: string) => s.replace(/[^A-Za-z0-9:/._-]/g, "");
const sym = (s: string) => s.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) || "XAUUSD";

export function generarGuardianMQ5(p: ParametrosGuardian): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return String.raw`//+------------------------------------------------------------------+
//|  VictorGuard.mq5 - Guardian de riesgo (generado por VICTOR CFO)   |
//|  Generado: ${fecha}                                               |
//|  NO decide entradas. Tu decides; el guardian impone TUS reglas:  |
//|   - calcula el lote segun tu riesgo                               |
//|   - pone SL (obligatorio) y TP a todo trade                       |
//|   - SL solo se mueve a tu favor; TP libre (modo flexible)         |
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
input double RewardRatio        = ${n(p.relacionTP)};      // TP inicial = SL x este numero (0 = sin TP al abrir, lo pones tu)
input int    MaxLosersPerDay    = ${Math.max(1, Math.round(p.maxPerdedoresDia))};        // perdedores maximos por dia
input double MaxDailyLossPct    = ${n(p.perdidaMaxDiaPct)};      // perdida diaria maxima en % del balance con que empezo el dia
input double MaxDailyLossUSD    = ${n(p.perdidaMaxDiaUSD)};      // o en dolares fijos (0 = usar el %)
input double MinEquityPct       = ${n(p.equityMinimoPct)};     // si el equity baja de este % del balance de inicio del dia: bloqueo total
input double MinEquityUSD       = ${n(p.equityMinimoUSD)};      // o en dolares fijos (0 = usar el %)
input int    MaxOpenPositions   = ${Math.max(1, Math.round(p.maxAbiertos))};        // trades abiertos a la vez
input int    MaxTradesPerDay    = ${Math.max(0, Math.round(p.maxTradesDia))};        // trades maximos por dia (0 = sin limite)
input int    CooldownMin        = ${Math.max(0, Math.round(p.esperaTrasPerdidaMin))};       // minutos de espera tras una perdida (0 = sin espera)
input int    DeviationPts       = 30;       // deslizamiento maximo
input bool   LockSLTP           = ${b(p.modoBloqueo !== "ninguno")};     // true = el guardian vigila el SL/TP
input bool   FlexibleLock       = ${b(p.modoBloqueo === "flexible")};     // true = puedes mover el TP libremente y el SL solo a tu favor (nunca alejarlo ni quitarlo)
input bool   BlockOnManualClose = ${b(p.bloquearCierreManual)};     // true = cerrar un trade a mano bloquea el resto del dia
input string SyncURL            = "${q(p.syncUrl ?? "")}"; // direccion de VICTOR (permitela en Herramientas > Opciones > Asesores Expertos > WebRequest)
input string SyncToken          = "${q(p.syncToken ?? "")}"; // token de tu cuenta de trading. No lo compartas.
input int    SyncDays           = 30;       // dias de historial a revisar al sincronizar

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

// cierre con el boton X del grafico: cuenta como cierre manual del dia
string XFlag() { return P + "XCLOSE_" + TimeToString(TimeCurrent(), TIME_DATE); }
bool XClosedToday() { return GlobalVariableCheck(XFlag()); }

// bloqueo duro: cierra todo y no deja operar
bool IsBlocked(string &why)
{
   int losers, manual, closed; double pl; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);
   double total = pl + FloatingPL();
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - pl;   // balance con que empezo el dia
   double maxLoss  = (MaxDailyLossUSD > 0) ? MaxDailyLossUSD : startBal * MaxDailyLossPct / 100.0;
   double minEq    = (MinEquityUSD > 0) ? MinEquityUSD : startBal * MinEquityPct / 100.0;
   if(BlockOnManualClose && (manual > 0 || XClosedToday()))        { why = "BLOQUEADO: cerraste un trade a mano hoy"; return true; }
   if(losers >= MaxLosersPerDay)               { why = "BLOQUEADO: " + IntegerToString(losers) + " perdedores hoy"; return true; }
   if(total <= -maxLoss)                       { why = "BLOQUEADO: perdida diaria maxima (" + DoubleToString(maxLoss, 2) + ")"; return true; }
   if(AccountInfoDouble(ACCOUNT_EQUITY) <= minEq) { why = "BLOQUEADO: equity minimo. Revisa tu plan."; return true; }
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

      // SL/TP vigilados: si ya los fijamos antes, se aplica el modo de bloqueo
      bool isBuy = (typ == POSITION_TYPE_BUY);
      string ksl = P + "SL_" + (string)tk, ktp = P + "TP_" + (string)tk;
      if(LockSLTP && GlobalVariableCheck(ksl) && GlobalVariableCheck(ktp))
      {
         double lsl = GlobalVariableGet(ksl), ltp = GlobalVariableGet(ktp);
         double pt = SymbolInfoDouble(AllowedSymbol, SYMBOL_POINT);
         if(FlexibleLock)
         {
            // SL: solo puede acercarse a tu favor (protegerte / perseguir el precio). Nunca alejarse ni quitarse.
            bool slOk = (sl != 0) && (isBuy ? (sl >= lsl - pt / 2) : (sl <= lsl + pt / 2));
            if(slOk && MathAbs(sl - lsl) > pt / 2) GlobalVariableSet(ksl, sl);
            // TP: libre (mover o quitar no aumenta tu riesgo)
            if(MathAbs(tp - ltp) > pt / 2) GlobalVariableSet(ktp, tp);
            if(!slOk) trade.PositionModify(tk, lsl, tp);
         }
         else if(MathAbs(sl - lsl) > pt / 2 || MathAbs(tp - ltp) > pt / 2)
            trade.PositionModify(tk, lsl, ltp);
         continue;
      }

      // SL/TP obligatorios y SL no mas lejos de 1.5x lo permitido
      bool buy = isBuy;
      double newSL = sl, newTP = tp;
      if(sl == 0 || MathAbs(op - sl) > SLDistance * 1.5)
         newSL = buy ? op - SLDistance : op + SLDistance;
      if(tp == 0 && RewardRatio > 0)
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
   double tp = (RewardRatio > 0) ? (buy ? price + SLDistance * RewardRatio : price - SLDistance * RewardRatio) : 0;
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


// P/L del dia (cerrado + flotante) en grande, y P/L flotante pegado a cada entrada
string Money(double v) { return (v >= 0 ? "+$" : "-$") + DoubleToString(MathAbs(v), 2); }

void UpdatePL()
{
   int losers, manual; double pl;
   int closed; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);
   double fl = FloatingPL();
   double tot = pl + fl;
   ObjectSetString(0, P + "PL", OBJPROP_TEXT, "P/L hoy: " + Money(tot)
                   + "  (cerrado " + Money(pl) + " | abierto " + Money(fl) + ")");
   ObjectSetInteger(0, P + "PL", OBJPROP_COLOR, tot > 0 ? clrDodgerBlue : (tot < 0 ? clrRed : clrSilver));

   // etiqueta junto a la linea de entrada de cada posicion abierta
   // quita etiquetas/botones de posiciones que ya no existen
   for(int k = ObjectsTotal(0) - 1; k >= 0; k--)
   {
      string on = ObjectName(0, k);
      if(StringFind(on, P + "EP") == 0 || StringFind(on, P + "XB") == 0)
      {
         ulong otk = (ulong)StringToInteger(StringSubstr(on, StringLen(P) + 2));
         if(!PositionSelectByTicket(otk)) ObjectDelete(0, on);
      }
   }
   datetime tx = iTime(_Symbol, _Period, 0) + (datetime)(PeriodSeconds() * 3);
   double step = (ChartGetDouble(0, CHART_PRICE_MAX) - ChartGetDouble(0, CHART_PRICE_MIN)) / 35.0;
   int shown = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double fp = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      string nm = P + "EP" + (string)tk;
      double py = PositionGetDouble(POSITION_PRICE_OPEN) - step * shown;
      shown++;
      if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TEXT, 0, tx, py);
      ObjectSetInteger(0, nm, OBJPROP_TIME, tx);
      ObjectSetDouble(0, nm, OBJPROP_PRICE, py);
      ObjectSetString(0, nm, OBJPROP_TEXT, "<< entrada " + Money(fp));
      ObjectSetInteger(0, nm, OBJPROP_COLOR, fp >= 0 ? clrDodgerBlue : clrRed);
      ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, 11);
      ObjectSetInteger(0, nm, OBJPROP_ANCHOR, ANCHOR_LEFT);

      // boton X para cerrar este trade (sirve en pantalla completa)
      string bn = P + "XB" + (string)tk;
      int bx, by;
      if(ChartTimePriceToXY(0, 0, tx, py, bx, by))
      {
         if(ObjectFind(0, bn) < 0)
         {
            ObjectCreate(0, bn, OBJ_BUTTON, 0, 0, 0);
            ObjectSetInteger(0, bn, OBJPROP_XSIZE, 26);
            ObjectSetInteger(0, bn, OBJPROP_YSIZE, 22);
            ObjectSetString(0, bn, OBJPROP_TEXT, "X");
            ObjectSetInteger(0, bn, OBJPROP_COLOR, clrWhite);
            ObjectSetInteger(0, bn, OBJPROP_BGCOLOR, clrFireBrick);
            ObjectSetInteger(0, bn, OBJPROP_CORNER, CORNER_LEFT_UPPER);
         }
         ObjectSetInteger(0, bn, OBJPROP_XDISTANCE, bx + 150);
         ObjectSetInteger(0, bn, OBJPROP_YDISTANCE, by - 11);
      }
   }
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
   UpdatePL();
}

//------------------------------------------------------------------
// Sincronizacion con VICTOR: envia los trades cerrados y el balance cada ~30 s.
string g_sync = "";
datetime g_lastTry = 0;

string JStr(string s)
{
   StringReplace(s, "\\", "");
   StringReplace(s, "\"", "");
   return "\"" + s + "\"";
}
string JTime(datetime t) { return JStr(TimeToString(t, TIME_DATE | TIME_SECONDS)); }

void SyncTick()
{
   if(SyncToken == "" || SyncURL == "") return;
   if(TimeLocal() - g_lastTry < 30) return;
   g_lastTry = TimeLocal();

   datetime to = TimeCurrent();
   if(!HistorySelect(to - (datetime)SyncDays * 86400, to + 60)) return;
   int n = HistoryDealsTotal();

   // 1) posiciones ya cerradas que todavia no enviamos
   ulong pids[];
   int np = 0;
   for(int i = 0; i < n && np < 100; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      long type  = HistoryDealGetInteger(tk, DEAL_TYPE);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      ulong pid = (ulong)HistoryDealGetInteger(tk, DEAL_POSITION_ID);
      if(GlobalVariableCheck(P + "SENT_" + (string)pid)) continue;
      if(PositionSelectByTicket(pid)) continue;   // sigue abierta
      bool dup = false;
      for(int k = 0; k < np; k++) if(pids[k] == pid) { dup = true; break; }
      if(dup) continue;
      ArrayResize(pids, np + 1);
      pids[np] = pid;
      np++;
   }

   // 2) armar el detalle de cada una
   string items = "";
   ulong sentIds[];
   int ns = 0;
   for(int j = 0; j < np; j++)
   {
      if(!HistorySelectByPosition(pids[j])) continue;
      int m = HistoryDealsTotal();
      datetime tOpen = 0, tClose = 0;
      double pOpen = 0, pClose = 0, vol = 0, sl = 0, tp = 0, com = 0, swp = 0, prof = 0;
      string side = "buy", sym = "";
      for(int d = 0; d < m; d++)
      {
         ulong tk = HistoryDealGetTicket(d);
         long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
         long type  = HistoryDealGetInteger(tk, DEAL_TYPE);
         com  += HistoryDealGetDouble(tk, DEAL_COMMISSION) + HistoryDealGetDouble(tk, DEAL_FEE);
         swp  += HistoryDealGetDouble(tk, DEAL_SWAP);
         prof += HistoryDealGetDouble(tk, DEAL_PROFIT);
         if(entry == DEAL_ENTRY_IN)
         {
            if(tOpen == 0)
            {
               tOpen = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
               pOpen = HistoryDealGetDouble(tk, DEAL_PRICE);
               side  = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
               sym   = HistoryDealGetString(tk, DEAL_SYMBOL);
            }
            vol += HistoryDealGetDouble(tk, DEAL_VOLUME);
         }
         else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
         {
            tClose = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
            pClose = HistoryDealGetDouble(tk, DEAL_PRICE);
            sl = HistoryDealGetDouble(tk, DEAL_SL);
            tp = HistoryDealGetDouble(tk, DEAL_TP);
         }
      }
      if(tOpen == 0 || tClose == 0 || sym == "") continue;
      if(sl == 0 && GlobalVariableCheck(P + "SL_" + (string)pids[j])) sl = GlobalVariableGet(P + "SL_" + (string)pids[j]);
      string it = "{\"ticket\":" + JStr((string)pids[j]) + ",\"symbol\":" + JStr(sym) + ",\"side\":" + JStr(side)
         + ",\"volume\":" + DoubleToString(vol, 2)
         + ",\"open_time\":" + JTime(tOpen) + ",\"open_price\":" + DoubleToString(pOpen, 8)
         + ",\"sl\":" + DoubleToString(sl, 8) + ",\"tp\":" + DoubleToString(tp, 8)
         + ",\"close_time\":" + JTime(tClose) + ",\"close_price\":" + DoubleToString(pClose, 8)
         + ",\"commission\":" + DoubleToString(com, 2) + ",\"swap\":" + DoubleToString(swp, 2)
         + ",\"profit\":" + DoubleToString(prof, 2) + "}";
      items += (items == "" ? "" : ",") + it;
      ArrayResize(sentIds, ns + 1);
      sentIds[ns] = pids[j];
      ns++;
   }

   // 3) enviar (siempre, aunque no haya trades nuevos: asi se actualiza el balance)
   string body = "{\"token\":" + JStr(SyncToken)
      + ",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)
      + ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)
      + ",\"trades\":[" + items + "]}";
   char data[], res[];
   string rh;
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   int code = WebRequest("POST", SyncURL, "Content-Type: application/json\r\n", 8000, data, res, rh);
   if(code == -1)
      g_sync = "Sync: permite " + SyncURL + " en Opciones > Asesores Expertos";
   else if(code == 200)
   {
      for(int q = 0; q < ns; q++) GlobalVariableSet(P + "SENT_" + (string)sentIds[q], 1);
      g_sync = "Sync OK " + TimeToString(TimeLocal(), TIME_MINUTES) + " (" + IntegerToString(ns) + " nuevos)";
   }
   else
      g_sync = "Sync error HTTP " + IntegerToString(code);
   ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
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
   ObjectCreate(0, P + "SY", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "SY", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "SY", OBJPROP_YDISTANCE, 125);
   ObjectSetInteger(0, P + "SY", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "SY", OBJPROP_FONTSIZE, 9);
   ObjectCreate(0, P + "PL", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "PL", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "PL", OBJPROP_YDISTANCE, 150);
   ObjectSetInteger(0, P + "PL", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "PL", OBJPROP_FONTSIZE, 13);
   EventSetTimer(1);
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, P);
}

void OnTimer()  { Guard(); UpdatePanel(); SyncTick(); }
void OnTick()   { Guard(); }

void OnChartEvent(const int id, const long &lp, const double &dp, const string &sp)
{
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sp == P + "BUY")  { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(true); }
   if(sp == P + "SELL") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(false); }
   if(StringFind(sp, P + "XB") == 0)
   {
      ObjectSetInteger(0, sp, OBJPROP_STATE, false);
      ulong tk = (ulong)StringToInteger(StringSubstr(sp, StringLen(P) + 2));
      if(PositionSelectByTicket(tk) && trade.PositionClose(tk))
         if(BlockOnManualClose) GlobalVariableSet(XFlag(), 1);
   }
}
`;
}
