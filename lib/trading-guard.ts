// Generador del guardián de riesgo para MetaTrader 5 (VictorGuard.mq5).
// NO decide entradas: el usuario decide; el guardián impone las reglas que
// el propio usuario definió en VICTOR. Se descarga como archivo .mq5 y se
// compila en MetaEditor (F7). Probar siempre primero en demo.
// Texto del archivo en ASCII (sin acentos) para que MetaEditor no lo corrompa.

export type ModoStop = "pips" | "porcentaje" | "atr";
export type TemporalidadATR = "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export type ParametrosGuardian = {
  simbolos: string; // "*" = todos los activos; o lista separada por comas (EURUSD, NAS100, BTCUSD, #AAPL)
  modoStop: ModoStop; // pips (un simbolo), % del precio, o ATR (sirve para cualquier activo)
  stopPct: number; // % del precio (modo porcentaje; tambien respaldo)
  atrMult: number; // stop = ATR x este numero (modo atr)
  atrTF: TemporalidadATR;
  bloqueados?: string; // simbolos prohibidos separados por coma (se cierran al abrir)
  riesgoPct: number;
  riesgoUSD?: number; // $ fijos por trade (perdida maxima del dia / trades del dia). 0 = usar riesgoPct
  distanciaPips: number; // distancia del stop en pips
  tamanoPip: number; // tamano de 1 pip en precio (ej. 0.1 oro, 0.0001 EURUSD, 1 NAS100)
  simboloPips?: string; // activo al que aplican SLPips/PipSize (los demas: forex con sus pips; el resto ATR)
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
// Lista de simbolos: "*" (o vacio) = todos. Solo caracteres validos en nombres de MT5.
const syms = (s: string) => {
  const t = s.toUpperCase().replace(/[^A-Z0-9._,#*-]/g, "").slice(0, 300);
  return !t || t.includes("*") ? "*" : t.split(",").filter(Boolean).join(",");
};
const MODO_MQ5: Record<ModoStop, string> = { pips: "SL_PIPS", porcentaje: "SL_PERCENT", atr: "SL_ATR" };
const TF_MQ5: Record<TemporalidadATR, string> = { M5: "PERIOD_M5", M15: "PERIOD_M15", M30: "PERIOD_M30", H1: "PERIOD_H1", H4: "PERIOD_H4", D1: "PERIOD_D1" };

export function generarGuardianMQ5(p: ParametrosGuardian): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return String.raw`//+------------------------------------------------------------------+
//|  VictorGuard.mq5 - Guardian de riesgo (generado por VICTOR CFO)   |
//|  Generado: ${fecha}                                               |
//|  Sirve para cualquier activo de tu broker: forex, oro, indices,   |
//|  acciones, futuros y cripto (lista o * = todos).                  |
//|  Ponlo en UN SOLO grafico: vigila todas las posiciones de la      |
//|  cuenta. Cambia el simbolo del grafico y los botones lo siguen.   |
//|  Tu decides las entradas (o activas AutoEntry: retroceso a la     |
//|  media en tendencia). El guardian impone TUS reglas:              |
//|   - calcula el lote segun tu riesgo                               |
//|   - pone SL (obligatorio) y TP a todo trade                       |
//|   - SL solo se mueve a tu favor; TP libre (modo flexible)         |
//|   - limite de trades abiertos, perdedores y perdida del dia       |
//|   - espera obligatoria tras una perdida                           |
//|  Todos los valores se pueden cambiar en MT5 > pestana Entradas.   |
//|  Probar SIEMPRE en demo primero. No es asesoria financiera.       |
//+------------------------------------------------------------------+
#property strict
#property version   "3.00"
#include <Trade\Trade.mqh>

CTrade trade;

enum ENUM_SL_MODE { SL_PIPS = 0, SL_PERCENT = 1, SL_ATR = 2 };

input string AllowedSymbols     = "${syms(p.simbolos)}"; // simbolos permitidos separados por coma, o * = todos (forex, indices, acciones, futuros, cripto)
input string BlockedSymbols     = "${syms(p.bloqueados ?? "").replace("*", "")}"; // simbolos PROHIBIDOS separados por coma: si los abres, se cierran
input double RiskMoney          = ${n(p.riesgoUSD ?? 0)};      // $ fijos a arriesgar por trade, en cualquier activo (0 = usar RiskPercent)
input double RiskPercent        = ${n(p.riesgoPct)};      // % del balance a arriesgar por trade (si RiskMoney = 0)
input ENUM_SL_MODE SLMode       = ${MODO_MQ5[p.modoStop] ?? "SL_ATR"}; // como se calcula el stop: pips, % del precio o ATR
input double SLPips             = ${n(p.distanciaPips, 2)};      // modo pips: distancia del SL en pips
input double PipSize            = ${n(p.tamanoPip, 5)};      // modo pips: tamano de 1 pip de PipSymbol (oro 0.1, EURUSD 0.0001, NAS100 1)
input string PipSymbol          = "${(syms(p.simboloPips ?? "") === "*" ? "XAUUSD" : syms(p.simboloPips ?? "").split(",")[0])}"; // modo pips: activo al que aplican esos pips. Forex usa sus pips; los demas, el ATR
input double SLPercent          = ${n(p.stopPct, 3)};      // modo %: stop a este % del precio (tambien es el respaldo si falta el ATR)
input double ATRMult            = ${n(p.atrMult, 2)};      // modo ATR: stop = ATR x este numero
input ENUM_TIMEFRAMES ATRTF     = ${TF_MQ5[p.atrTF] ?? "PERIOD_H1"}; // modo ATR: temporalidad del ATR
input int    ATRPeriod          = 14;       // modo ATR: periodo del ATR
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

// --- Entrada automatica: retroceso a la media en tendencia (APAGADA por defecto) ---
// Vende cuando la media baja y el precio retrocede hacia arriba y la toca; compra al reves.
// Una entrada por vela. SL/TP/lote/limites vienen de las reglas de arriba.
input bool   AutoEntry          = false;    // true = el guardian entra solo con esta regla
input int    MaPeriod           = 50;       // periodo de la media movil
input ENUM_MA_METHOD MaMethod   = MODE_EMA; // tipo de media (EMA, SMA...)
input ENUM_TIMEFRAMES MaTF      = PERIOD_M15; // temporalidad de la media y de la tendencia
input int    SlopeBars          = 10;       // velas para medir la pendiente de la media
input double MinSlopeUSD        = 1.0;      // pendiente minima (en precio) en esas velas: filtra rangos

string P = "VG_";
int      hMA = INVALID_HANDLE;
datetime lastAutoBar = 0;

//------------------------------------------------------------------
// Simbolos permitidos
bool   g_all = true;
string g_syms[];
string g_block[];

string Up(string s) { string u = s; StringTrimLeft(u); StringTrimRight(u); StringToUpper(u); return u; }

void ParseSymbols()
{
   ArrayResize(g_syms, 0);
   string s = Up(AllowedSymbols);
   g_all = (s == "" || StringFind(s, "*") >= 0);
   if(g_all) return;
   string parts[];
   int k = StringSplit(s, ',', parts);
   for(int i = 0; i < k; i++)
   {
      string x = Up(parts[i]);
      if(x == "") continue;
      int n = ArraySize(g_syms);
      ArrayResize(g_syms, n + 1);
      g_syms[n] = x;
   }
   if(ArraySize(g_syms) == 0) g_all = true;
}

void ParseBlocked()
{
   ArrayResize(g_block, 0);
   string parts[];
   int k = StringSplit(Up(BlockedSymbols), ',', parts);
   for(int i = 0; i < k; i++)
   {
      string x = Up(parts[i]);
      if(x == "") continue;
      int n = ArraySize(g_block);
      ArrayResize(g_block, n + 1);
      g_block[n] = x;
   }
}

// acepta sufijos del broker: "XAUUSD" permite "XAUUSD.r" o "XAUUSDm"
bool SymbolAllowed(string s)
{
   string u = Up(s);
   for(int b = 0; b < ArraySize(g_block); b++)
      if(u == g_block[b] || StringFind(u, g_block[b]) == 0) return false;   // prohibido
   if(g_all) return true;
   for(int i = 0; i < ArraySize(g_syms); i++)
      if(u == g_syms[i] || StringFind(u, g_syms[i]) == 0) return true;
   return false;
}

// activo al que aplican los pips configurados (nunca el simbolo del grafico por accidente)
bool IsMain(string s)
{
   string u = Up(s);
   string m = Up(PipSymbol);
   if(m == "") return false;
   return (u == m || StringFind(u, m) == 0);
}

//------------------------------------------------------------------
// Distancia del stop (en precio) para cada simbolo
string g_atrSym[];
int    g_atrH[];

int AtrHandle(string s)
{
   for(int i = 0; i < ArraySize(g_atrSym); i++) if(g_atrSym[i] == s) return g_atrH[i];
   SymbolSelect(s, true);
   int h = iATR(s, ATRTF, ATRPeriod);
   int n = ArraySize(g_atrSym);
   ArrayResize(g_atrSym, n + 1); ArrayResize(g_atrH, n + 1);
   g_atrSym[n] = s; g_atrH[n] = h;
   return h;
}

double AtrDist(string s)
{
   int h = AtrHandle(s);
   double b[];
   if(h != INVALID_HANDLE && CopyBuffer(h, 0, 1, 1, b) == 1 && b[0] > 0) return b[0] * ATRMult;
   return 0;
}

double RawSLDist(string s)
{
   double price = SymbolInfoDouble(s, SYMBOL_BID);
   if(SLMode == SL_PERCENT) return price * SLPercent / 100.0;
   if(SLMode == SL_PIPS)
   {
      if(IsMain(s)) return SLPips * PipSize;
      int dg = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
      string base = SymbolInfoString(s, SYMBOL_CURRENCY_BASE), prof = SymbolInfoString(s, SYMBOL_CURRENCY_PROFIT);
      bool fx = (dg == 3 || dg == 5) && StringLen(base) == 3 && StringLen(prof) == 3 && base != prof && base != "XAU" && base != "XAG";
      if(fx) return SLPips * SymbolInfoDouble(s, SYMBOL_POINT) * 10;   // forex: sus pips de siempre
   }
   // ATR (modo ATR, o los demas activos en modo pips); si aun no hay datos, % del precio
   double a = AtrDist(s);
   if(a > 0) return a;
   return price * SLPercent / 100.0;
}

// Distancia del stop, nunca mas cerca que 3 spreads ni que el minimo del broker
double SLDist(string s)
{
   double d = RawSLDist(s);
   double pt = SymbolInfoDouble(s, SYMBOL_POINT);
   double spread = SymbolInfoDouble(s, SYMBOL_ASK) - SymbolInfoDouble(s, SYMBOL_BID);
   double lvl = (double)SymbolInfoInteger(s, SYMBOL_TRADE_STOPS_LEVEL) * pt * 1.1;
   double minD = MathMax(spread * 3, lvl);
   if(d < minD) d = minD;
   return d;
}

//------------------------------------------------------------------
// Lo que se puede perder en un trade si toca el stop
double RiskAllowed()
{
   if(RiskMoney > 0) return RiskMoney;
   return AccountInfoDouble(ACCOUNT_BALANCE) * RiskPercent / 100.0;
}

double LossPerLot(string s, double dist)
{
   double ts = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0) tv = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_VALUE);
   if(ts <= 0) return 0;
   return dist / ts * tv;
}

double CalcLot(string s, double dist)
{
   double lpl = LossPerLot(s, dist);
   if(lpl <= 0) return 0;
   double risk = RiskAllowed();
   double step = SymbolInfoDouble(s, SYMBOL_VOLUME_STEP);
   double minL = SymbolInfoDouble(s, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(s, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = minL > 0 ? minL : 0.01;
   double lot  = MathFloor(risk / lpl / step) * step;
   if(lot < minL) lot = minL;
   if(lot > maxL) lot = maxL;
   int vd = (int)MathMax(0, MathCeil(-MathLog10(step) - 1e-9));   // decimales del lote (acciones = 0, forex = 2)
   return NormalizeDouble(lot, vd);
}

// true si hasta el lote minimo excede el riesgo permitido (cuenta muy chica)
bool RiskTooHigh(string s, double lot, double dist)
{
   double risk = RiskAllowed();
   return (lot * LossPerLot(s, dist) > risk * 1.5);
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
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - pl;   // balance con que empezo el dia
   double maxLoss  = (MaxDailyLossUSD > 0) ? MaxDailyLossUSD : startBal * MaxDailyLossPct / 100.0;
   double minEq    = (MinEquityUSD > 0) ? MinEquityUSD : startBal * MinEquityPct / 100.0;
   if(BlockOnManualClose && manual > 0)        { why = "BLOQUEADO: cerraste un trade a mano hoy"; return true; }
   if(losers >= MaxLosersPerDay)               { why = "BLOQUEADO: " + IntegerToString(losers) + " perdedores hoy"; return true; }
   if(total <= -maxLoss)                       { why = "BLOQUEADO: perdida diaria maxima (" + DoubleToString(maxLoss, 2) + ")"; return true; }
   if(AccountInfoDouble(ACCOUNT_EQUITY) <= minEq) { why = "BLOQUEADO: equity minimo. Revisa tu plan."; return true; }
   why = "OK | perdedores hoy: " + IntegerToString(losers) + "/" + IntegerToString(MaxLosersPerDay)
       + " | P/L hoy: " + DoubleToString(total, 2);
   return false;
}

// bloqueo suave: no cierra nada, solo impide ABRIR otro trade ahora
bool CanOpenNew(string s, string &why)
{
   if(IsBlocked(why)) return false;
   int losers, manual, closed; double pl; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);

   // presupuesto de riesgo del dia: lo que pierden los trades abiertos si tocan su SL
   // + el nuevo trade no puede pasar la perdida diaria maxima (con varios trades abiertos).
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - pl;
   double maxLoss  = (MaxDailyLossUSD > 0) ? MaxDailyLossUSD : startBal * MaxDailyLossPct / 100.0;
   double openRisk = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ptk = PositionGetTicket(i);
      if(ptk == 0) continue;
      string psym  = PositionGetString(POSITION_SYMBOL);
      double popen = PositionGetDouble(POSITION_PRICE_OPEN);
      double psl   = PositionGetDouble(POSITION_SL);
      double pvol  = PositionGetDouble(POSITION_VOLUME);
      bool pbuy    = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double d = (psl == 0) ? SLDist(psym) : (pbuy ? popen - psl : psl - popen);
      if(d > 0) openRisk += LossPerLot(psym, d) * pvol;
   }
   double nd = SLDist(s);
   double newRisk = CalcLot(s, nd) * LossPerLot(s, nd);
   // margen de 10% de un trade para deslizamiento (ej. 3 trades de $7 con perdidas de $7.05)
   if(maxLoss > 0 && openRisk + newRisk > maxLoss + pl + RiskAllowed() * 0.10 + 0.01)
   { why = "Riesgo del dia completo (abiertos $" + DoubleToString(openRisk, 2) + " + nuevo $" + DoubleToString(newRisk, 2) + ")"; return false; }

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
// Cierre robusto: 1 intento cada 3 s por ticket, prueba los 3 modos de llenado
// (un modo no aceptado por el broker deja ordenes de cierre atascadas).
datetime lastCloseTry = 0;
ulong    lastCloseTk  = 0;
bool SafeClose(ulong tk)
{
   if(tk == lastCloseTk && TimeCurrent() - lastCloseTry < 3) return false;
   lastCloseTk = tk; lastCloseTry = TimeCurrent();
   ENUM_ORDER_TYPE_FILLING modes[3] = {ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN};
   for(int m = 0; m < 3; m++)
   {
      trade.SetTypeFilling(modes[m]);
      if(trade.PositionClose(tk)) return true;
      uint rc = trade.ResultRetcode();
      if(rc == TRADE_RETCODE_MARKET_CLOSED || rc == TRADE_RETCODE_CONNECTION ||
         rc == TRADE_RETCODE_TRADE_DISABLED) break;
   }
   Print("VictorGuard: no pude cerrar #", tk, " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   return false;
}

//------------------------------------------------------------------
void Guard()
{
   string why;
   bool blocked = IsBlocked(why);
   int kept = 0;

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
      if(blocked || !SymbolAllowed(sym) || kept >= MaxOpenPositions)
      {
         SafeClose(tk);
         continue;
      }
      bool isBuy = (typ == POSITION_TYPE_BUY);
      double dist = SLDist(sym);
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double pt = SymbolInfoDouble(sym, SYMBOL_POINT);

      // lote: se revisa una vez por trade, contra el riesgo real a su stop
      string kok = P + "OK_" + (string)tk;
      if(!GlobalVariableCheck(kok) && dist > 0)
      {
         double lossDist = dist;
         if(sl != 0)
         {
            double d = isBuy ? op - sl : sl - op;
            if(d > 0 && d <= dist * 1.5) lossDist = d;
         }
         // margen de 10% por deslizamiento y redondeo; el lote minimo siempre se permite
         double allowed = RiskAllowed();
         double minL = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
         if(vol > minL + 0.0000001 && vol * LossPerLot(sym, lossDist) > allowed * 1.10)
         {
            Print("VictorGuard: #", tk, " ", sym, " lote ", vol, " pasa tu riesgo. Cerrado.");
            SafeClose(tk);
            continue;
         }
         GlobalVariableSet(kok, 1);
         GlobalVariableSet(P + "RK_" + (string)tk, vol * LossPerLot(sym, lossDist));   // riesgo al abrir, para la bitacora
      }
      kept++;
      if(dist <= 0) continue;

      // SL/TP vigilados: si ya los fijamos antes, se aplica el modo de bloqueo
      string ksl = P + "SL_" + (string)tk, ktp = P + "TP_" + (string)tk;
      if(LockSLTP && GlobalVariableCheck(ksl) && GlobalVariableCheck(ktp))
      {
         double lsl = GlobalVariableGet(ksl), ltp = GlobalVariableGet(ktp);
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
      if(sl == 0 || MathAbs(op - sl) > dist * 1.5)
         newSL = buy ? op - dist : op + dist;
      if(tp == 0 && RewardRatio > 0)
         newTP = buy ? op + dist * RewardRatio : op - dist * RewardRatio;
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
   if(!SymbolAllowed(_Symbol)) { Alert("VictorGuard: ", _Symbol, " esta prohibido o no esta en tus simbolos permitidos"); return; }
   if(!CanOpenNew(_Symbol, why)) { Alert("VictorGuard: ", why); return; }
   if(PositionsTotal() >= MaxOpenPositions) { Alert("VictorGuard: ya tienes el maximo de trades abiertos"); return; }

   double dist = SLDist(_Symbol);
   if(dist <= 0) { Alert("VictorGuard: no pude calcular el stop de ", _Symbol); return; }
   double lot = CalcLot(_Symbol, dist);
   if(lot <= 0 || RiskTooHigh(_Symbol, lot, dist))
   {
      int dg = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      double lim = RiskAllowed();
      Alert("VictorGuard: en ", _Symbol, " el lote minimo (", DoubleToString(lot, 2), ") con stop a ", DoubleToString(dist, dg),
            " arriesga $", DoubleToString(lot * LossPerLot(_Symbol, dist), 2), " y tu limite es $", DoubleToString(lim, 2),
            ". Acerca el stop o sube tu riesgo por trade.");
      return;
   }

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double price = buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = buy ? price - dist : price + dist;
   double tp = (RewardRatio > 0) ? (buy ? price + dist * RewardRatio : price - dist * RewardRatio) : 0;
   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   bool ok = buy ? trade.Buy(lot, _Symbol, 0, sl, tp, "VictorGuard")
                 : trade.Sell(lot, _Symbol, 0, sl, tp, "VictorGuard");
   if(!ok) Alert("VictorGuard: error al abrir (", trade.ResultRetcode(), ")");
}

//------------------------------------------------------------------
// Ordenes pendientes (limit/stop): al ponerlas reciben SL y TP segun tus reglas,
// medidos desde el PRECIO DE LA ORDEN, asi abren ya con SL/TP. Si pones tu propio
// SL/TP y respeta la regla, se respeta. Si el guardian esta bloqueado, se borran.
void GuardOrders()
{
   string why;
   bool blocked = IsBlocked(why);

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      string osym = OrderGetString(ORDER_SYMBOL);
      if(blocked || !SymbolAllowed(osym))
      {
         trade.OrderDelete(tk);
         continue;
      }
      double dist = SLDist(osym);
      if(dist <= 0) continue;
      int digits = (int)SymbolInfoInteger(osym, SYMBOL_DIGITS);

      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      bool buy  = (t == ORDER_TYPE_BUY_LIMIT  || t == ORDER_TYPE_BUY_STOP  || t == ORDER_TYPE_BUY_STOP_LIMIT);
      bool sell = (t == ORDER_TYPE_SELL_LIMIT || t == ORDER_TYPE_SELL_STOP || t == ORDER_TYPE_SELL_STOP_LIMIT);
      if(!buy && !sell) continue;

      double price = OrderGetDouble(ORDER_PRICE_OPEN);
      double sl = OrderGetDouble(ORDER_SL);
      double tp = OrderGetDouble(ORDER_TP);
      double nsl = sl, ntp = tp;
      if(sl == 0 || MathAbs(price - sl) > dist * 1.5)
         nsl = buy ? price - dist : price + dist;
      if(tp == 0 && RewardRatio > 0)
         ntp = buy ? price + dist * RewardRatio : price - dist * RewardRatio;
      nsl = NormalizeDouble(nsl, digits);
      ntp = NormalizeDouble(ntp, digits);

      if(nsl != sl || ntp != tp)
      {
         ENUM_ORDER_TYPE_TIME tt = (ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME);
         datetime exp = (datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
         double stoplimit = OrderGetDouble(ORDER_PRICE_STOPLIMIT);
         if(!trade.OrderModify(tk, price, nsl, ntp, tt, exp, stoplimit))
            Print("VictorGuard: no pude poner SL/TP a la orden #", tk, " ", trade.ResultRetcodeDescription());
      }
   }
}

//------------------------------------------------------------------
// Entrada automatica: tendencia bajista = la media cae y la ultima vela cerrada esta
// bajo la media; el precio retrocede hacia arriba y la TOCA -> VENDE (espejo: compra).
void AutoEntryCheck()
{
   if(!AutoEntry || !SymbolAllowed(_Symbol) || hMA == INVALID_HANDLE) return;
   datetime bar = iTime(_Symbol, MaTF, 0);
   if(bar == lastAutoBar) return;
   if(PositionsTotal() >= MaxOpenPositions) return;
   string why;
   if(!CanOpenNew(_Symbol, why)) return;
   double dist = SLDist(_Symbol);
   if(dist <= 0) return;

   double ma[];
   ArraySetAsSeries(ma, true);
   if(CopyBuffer(hMA, 0, 0, SlopeBars + 2, ma) < SlopeBars + 2) return;
   double ma0 = ma[0];
   double slope = ma[1] - ma[1 + SlopeBars];
   double c1  = iClose(_Symbol, MaTF, 1);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   bool sell = (slope <= -MinSlopeUSD && c1 < ma[1] && bid >= ma0 && bid <= ma0 + dist);
   bool buy  = (slope >=  MinSlopeUSD && c1 > ma[1] && ask <= ma0 && ask >= ma0 - dist);
   if(!sell && !buy) return;

   lastAutoBar = bar;   // una sola entrada por vela
   double lot = CalcLot(_Symbol, dist);
   if(lot <= 0 || RiskTooHigh(_Symbol, lot, dist))
   { Print("VictorGuard AutoEntry: el lote minimo arriesga demasiado para esta cuenta."); return; }
   OpenTrade(buy);
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
      if(!SymbolAllowed(_Symbol)) why = _Symbol + " no esta permitido";
      else if(!CanOpenNew(_Symbol, w2)) why = w2;
   }
   double dist = SLDist(_Symbol);
   double lot = CalcLot(_Symbol, dist);
   double rk  = lot * LossPerLot(_Symbol, dist);
   double lim = RiskAllowed();
   // MT5 corta las etiquetas a 63 letras: estado y riesgo van en lineas separadas
   ObjectSetString(0, P + "ST", OBJPROP_TEXT, StringSubstr(why, 0, 63));
   string lt = _Symbol + " lote " + DoubleToString(lot, 2) + " | stop " + DoubleToString(dist, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS))
             + " | riesgo $" + DoubleToString(rk, 2) + " / $" + DoubleToString(lim, 2);
   ObjectSetString(0, P + "LT", OBJPROP_TEXT, StringSubstr(lt, 0, 63));
   ObjectSetInteger(0, P + "LT", OBJPROP_COLOR, rk > lim * 1.5 ? clrRed : clrSilver);

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
      // riesgo en dinero al abrir (sirve para cualquier activo: acciones, cripto, futuros...)
      double rk = -1;
      if(GlobalVariableCheck(P + "RK_" + (string)pids[j])) rk = GlobalVariableGet(P + "RK_" + (string)pids[j]);
      else if(sl > 0)
      {
         double dd = (side == "buy") ? pOpen - sl : sl - pOpen;
         if(dd > 0) rk = LossPerLot(sym, dd) * vol;
      }
      string it = "{\"ticket\":" + JStr((string)pids[j]) + ",\"symbol\":" + JStr(sym) + ",\"side\":" + JStr(side)
         + ",\"volume\":" + DoubleToString(vol, 2)
         + ",\"open_time\":" + JTime(tOpen) + ",\"open_price\":" + DoubleToString(pOpen, 8)
         + ",\"sl\":" + DoubleToString(sl, 8) + ",\"tp\":" + DoubleToString(tp, 8)
         + ",\"close_time\":" + JTime(tClose) + ",\"close_price\":" + DoubleToString(pClose, 8)
         + ",\"commission\":" + DoubleToString(com, 2) + ",\"swap\":" + DoubleToString(swp, 2)
         + ",\"profit\":" + DoubleToString(prof, 2)
         + (rk >= 0 ? ",\"risk\":" + DoubleToString(rk, 2) : "") + "}";
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
   ParseSymbols();
   ParseBlocked();
   if(SLMode == SL_PIPS && SLPips * PipSize <= 0) { Alert("VictorGuard: SLPips y PipSize deben ser mayores que 0"); return INIT_PARAMETERS_INCORRECT; }
   if(SLMode == SL_ATR && ATRMult <= 0)           { Alert("VictorGuard: ATRMult debe ser mayor que 0"); return INIT_PARAMETERS_INCORRECT; }
   if(SLPercent <= 0)                              { Alert("VictorGuard: SLPercent debe ser mayor que 0"); return INIT_PARAMETERS_INCORRECT; }
   if(SLMode != SL_PERCENT)
   {
      AtrHandle(_Symbol);
      for(int a = 0; a < ArraySize(g_syms); a++) AtrHandle(g_syms[a]);
      for(int c = 0; c < PositionsTotal(); c++) if(PositionGetTicket(c) > 0) AtrHandle(PositionGetString(POSITION_SYMBOL));
   }
   hMA = iMA(_Symbol, MaTF, MaPeriod, 0, MaMethod, PRICE_CLOSE);
   MakeButton(P + "SELL", "VENDER",  10, 30, clrFireBrick);   // mismo orden que MT5: vender a la izquierda
   MakeButton(P + "BUY",  "COMPRAR", 130, 30, clrSeaGreen);
   ObjectCreate(0, P + "ST", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "ST", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "ST", OBJPROP_YDISTANCE, 70);
   ObjectSetInteger(0, P + "ST", OBJPROP_COLOR, clrOrange);
   ObjectSetInteger(0, P + "ST", OBJPROP_FONTSIZE, 10);
   ObjectCreate(0, P + "LT", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "LT", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "LT", OBJPROP_YDISTANCE, 88);
   ObjectSetInteger(0, P + "LT", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "LT", OBJPROP_FONTSIZE, 10);
   ObjectCreate(0, P + "TM", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "TM", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "TM", OBJPROP_YDISTANCE, 108);
   ObjectSetInteger(0, P + "TM", OBJPROP_COLOR, clrDeepSkyBlue);
   ObjectSetInteger(0, P + "TM", OBJPROP_FONTSIZE, 12);
   ObjectCreate(0, P + "SY", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "SY", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "SY", OBJPROP_YDISTANCE, 135);
   ObjectSetInteger(0, P + "SY", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "SY", OBJPROP_FONTSIZE, 9);
   ObjectCreate(0, P + "PL", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, P + "PL", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "PL", OBJPROP_YDISTANCE, 158);
   ObjectSetInteger(0, P + "PL", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "PL", OBJPROP_FONTSIZE, 13);
   EventSetTimer(1);
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(hMA != INVALID_HANDLE) IndicatorRelease(hMA);
   for(int i = 0; i < ArraySize(g_atrH); i++) if(g_atrH[i] != INVALID_HANDLE) IndicatorRelease(g_atrH[i]);
   ArrayResize(g_atrSym, 0); ArrayResize(g_atrH, 0);
   ObjectsDeleteAll(0, P);
}

void OnTimer()  { Guard(); GuardOrders(); UpdatePanel(); SyncTick(); }
void OnTick()   { Guard(); GuardOrders(); AutoEntryCheck(); }

void OnChartEvent(const int id, const long &lp, const double &dp, const string &sp)
{
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sp == P + "BUY")  { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(true); }
   if(sp == P + "SELL") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); OpenTrade(false); }
   if(StringFind(sp, P + "XB") == 0)
   {
      ObjectSetInteger(0, sp, OBJPROP_STATE, false);
      ulong tk = (ulong)StringToInteger(StringSubstr(sp, StringLen(P) + 2));
      // cierre con la X del grafico: NO bloquea el dia (lo hace el EA, no cuenta como cierre manual)
      if(PositionSelectByTicket(tk)) SafeClose(tk);
   }
}
`;
}
