//+------------------------------------------------------------------+
//|  VictorGuard.mq5 - Guardian de riesgo (generado por VICTOR CFO)   |
//|  Generado: 2026-11-23                                               |
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
//|  Horario, dias, pausas y noticias: bloquea abrir fuera de tu plan. |
//|  Tus reglas llegan solas desde VICTOR cada 30 s (cambialas alla). |
//|  Probar SIEMPRE en demo primero. No es asesoria financiera.       |
//+------------------------------------------------------------------+
#property strict
#property version   "4.1"
#include <Trade\Trade.mqh>

CTrade trade;

enum ENUM_SL_MODE { SL_PIPS = 0, SL_PERCENT = 1, SL_ATR = 2 };

input string InAllowedSymbols     = "*"; // simbolos permitidos separados por coma, o * = todos (forex, indices, acciones, futuros, cripto)
input string InBlockedSymbols     = ""; // simbolos PROHIBIDOS separados por coma: si los abres, se cierran
input double InRiskMoney        = 0;      // $ fijos a arriesgar por trade, en cualquier activo (0 = usar RiskPercent)
input double InRiskPercent      = 1;      // % del balance a arriesgar por trade (si RiskMoney = 0)
input ENUM_SL_MODE InSLMode       = SL_ATR; // como se calcula el stop: pips, % del precio o ATR
input double InSLPips             = 60;      // modo pips: distancia del SL en pips
input double InPipSize            = 0.1;      // modo pips: tamano de 1 pip de PipSymbol (oro 0.1, EURUSD 0.0001, NAS100 1)
input string InPipSymbol          = "XAUUSD"; // modo pips: activo al que aplican esos pips. Forex usa sus pips; los demas, el ATR
input double InSLPercent          = 0.5;      // modo %: stop a este % del precio (tambien es el respaldo si falta el ATR)
input double InATRMult            = 1.5;      // modo ATR: stop = ATR x este numero
input ENUM_TIMEFRAMES InATRTF     = PERIOD_M15; // modo ATR: temporalidad del ATR
input int    ATRPeriod          = 14;       // modo ATR: periodo del ATR
input double InRewardRatio        = 2;      // TP inicial = SL x este numero (0 = sin TP al abrir, lo pones tu)
input int InMaxLosersPerDay  = 3;        // perdedores maximos por dia
input double InMaxDailyLossPct  = 3;      // perdida diaria maxima en % del balance con que empezo el dia
input double InMaxDailyLossUSD  = 0;      // o en dolares fijos (0 = usar el %)
input double InMinEquityPct     = 80;     // si el equity baja de este % del balance de inicio del dia: bloqueo total
input double InMinEquityUSD     = 0;      // o en dolares fijos (0 = usar el %)
input int InMaxOpenPositions = 1;        // trades abiertos a la vez
input int InMaxTradesPerDay  = 0;        // trades maximos por dia (0 = sin limite)
input int InCooldownMin      = 0;       // minutos de espera tras una perdida (0 = sin espera)
input int    DeviationPts       = 30;       // deslizamiento maximo
input bool   InLockSLTP           = true;     // true = el guardian vigila el SL/TP
input bool   InFlexibleLock       = true;     // true = puedes mover el TP libremente y el SL solo a tu favor (nunca alejarlo ni quitarlo)
input bool   InBlockOnManualClose = true;     // true = cerrar un trade a mano bloquea el resto del dia
input string SyncURL            = "https://www.victorcfo.com/api/trading/sync"; // direccion de VICTOR (permitela en Herramientas > Opciones > Asesores Expertos > WebRequest)
input string SyncToken          = ""; // dejalo vacio: el guardian se conecta solo con el codigo de 6 digitos del grafico
input int    SyncDays           = 30;       // dias de historial a revisar al sincronizar

// Ajustes del guardian: empiezan con las Entradas y VICTOR los actualiza al sincronizar.
string AllowedSymbols = "";
string BlockedSymbols = "";
ENUM_SL_MODE SLMode = SL_ATR;
double SLPips = 0;
double PipSize = 0;
string PipSymbol = "";
double SLPercent = 0;
double ATRMult = 0;
ENUM_TIMEFRAMES ATRTF = PERIOD_M15;
double RewardRatio = 0;
bool   LockSLTP = true;
bool   FlexibleLock = true;
bool   BlockOnManualClose = true;
bool   g_cfgOk = false;      // false = aun no hay reglas de VICTOR (version precompilada): no deja abrir
string g_token = "";         // codigo de conexion: el de Entradas o el guardado al vincular (por cuenta de MT5)
string g_codigo = "";        // codigo de 6 digitos que la persona escribe en VICTOR
long   g_login = 0;          // cuenta de MT5 con que arranco (si cambia, espera las reglas de la nueva)

// Reglas vivas: empiezan con las Entradas de arriba y VICTOR las actualiza en cada
// sincronizacion (lo que cambies en la web o en el chat llega solo, sin reinstalar).
double RiskMoney = 0;
double RiskPercent = 0;
int MaxLosersPerDay = 0;
double MaxDailyLossPct = 0;
double MaxDailyLossUSD = 0;
double MinEquityPct = 0;
double MinEquityUSD = 0;
int MaxOpenPositions = 0;
int MaxTradesPerDay = 0;
int CooldownMin = 0;
int    NewsMin = 0;          // minutos antes/despues de noticias de alto impacto (0 = apagado)
int    TzOffsetMin = 0;      // tu zona horaria respecto a UTC (solo para mostrar horas)
string g_horarioTxt = "";
// ---- 4.0: linea de Stop Loss que se arrastra + reglas que se cambian aqui en MT5 ----
string g_set = "";           // reglas cambiadas en el panel: se mandan a VICTOR en la proxima sincronizacion
string g_setMsg1 = "", g_setMsg2 = "";
bool   g_reglasAbiertas = false;
// 4.1: horario y bloqueos tambien se cambian aqui (boton Horario)
string g_hor = "";           // horario cambiado en el panel: se manda en la proxima sincronizacion
bool   g_horAbierto = false;
string g_hs = "", g_hv = "", g_hd = "", g_ph = "", g_zn = "";   // horario tal como esta en VICTOR
int    g_nr = 0;
double g_slOff = 0;          // 4.1: distancia de la linea al precio (+ debajo = compra, - arriba = venta)
string CFG0 = "";

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

void ResetAtr()
{
   for(int i = 0; i < ArraySize(g_atrH); i++) if(g_atrH[i] != INVALID_HANDLE) IndicatorRelease(g_atrH[i]);
   ArrayResize(g_atrSym, 0); ArrayResize(g_atrH, 0);
}

void PrepAtr()
{
   if(SLMode == SL_PERCENT) return;
   AtrHandle(_Symbol);
   for(int a = 0; a < ArraySize(g_syms); a++) AtrHandle(g_syms[a]);
   for(int c = 0; c < PositionsTotal(); c++) if(PositionGetTicket(c) > 0) AtrHandle(PositionGetString(POSITION_SYMBOL));
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
// Explicacion larga del ultimo bloqueo (para las alertas): por que te protegio y que hacer
string g_detalle = "";
string g_evs = "";           // avisos para el celular: se mandan a VICTOR en la siguiente sincronizacion (3.25)
void Evt(string s)
{
   StringReplace(s, "\\", "");
   StringReplace(s, "\"", "");
   if(StringLen(g_evs) + StringLen(s) > 1500) return;
   g_evs += (g_evs == "" ? "" : ",") + "\"" + s + "\"";
}

//------------------------------------------------------------------
// Reglas vivas desde VICTOR (horario, dias, pausas, noticias y limites).
// Formato: "RM=7;RP=1;ML=3;...;BW=0-720,1080-3600;PZ=1796356800-1796443200;NW=15;TZO=-240;HL=..."
//   BW = minutos BLOQUEADOS de la semana en UTC (0 = domingo 00:00 UTC ... 10080)
//   PZ = pausas por fecha, en segundos UTC
int  g_bwS[];
int  g_bwE[];
long g_pzS[];
long g_pzE[];

void ParseRanges(string v, bool weekly)
{
   string parts[];
   int k = StringSplit(v, ',', parts);
   if(weekly) { ArrayResize(g_bwS, 0); ArrayResize(g_bwE, 0); }
   else       { ArrayResize(g_pzS, 0); ArrayResize(g_pzE, 0); }
   for(int i = 0; i < k; i++)
   {
      int d = StringFind(parts[i], "-");
      if(d < 1) continue;
      long a = StringToInteger(StringSubstr(parts[i], 0, d));
      long b = StringToInteger(StringSubstr(parts[i], d + 1));
      if(b <= a) continue;
      if(weekly)
      {
         int n = ArraySize(g_bwS);
         ArrayResize(g_bwS, n + 1); ArrayResize(g_bwE, n + 1);
         g_bwS[n] = (int)a; g_bwE[n] = (int)b;
      }
      else
      {
         int n = ArraySize(g_pzS);
         ArrayResize(g_pzS, n + 1); ArrayResize(g_pzE, n + 1);
         g_pzS[n] = a; g_pzE[n] = b;
      }
   }
}

ENUM_TIMEFRAMES TfDeMin(int m)
{
   if(m <= 5) return PERIOD_M5;
   if(m <= 15) return PERIOD_M15;
   if(m <= 30) return PERIOD_M30;
   if(m <= 60) return PERIOD_H1;
   if(m <= 240) return PERIOD_H4;
   return PERIOD_D1;
}

string g_cfgLast = "";       // ultimas reglas recibidas (se vuelven a aplicar al reiniciar)
string CfgFile() { return "VictorGuard_c_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".txt"; }

void ApplyCfg(string cfg)
{
   if(cfg == "") return;
   if(cfg != g_cfgLast && cfg != CFG0)
   {
      g_cfgLast = cfg;
      // guardar en disco: si MT5 se reinicia o cambias el grafico, siguen TUS reglas
      if(AccountInfoInteger(ACCOUNT_LOGIN) > 0)
      {
         int h = FileOpen(CfgFile(), FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
         if(h != INVALID_HANDLE) { FileWriteString(h, cfg); FileClose(h); }
      }
   }
   bool resym = false, reatr = false;
   string parts[];
   int k = StringSplit(cfg, ';', parts);
   for(int i = 0; i < k; i++)
   {
      int eq = StringFind(parts[i], "=");
      if(eq < 1) continue;
      string key = StringSubstr(parts[i], 0, eq);
      string val = StringSubstr(parts[i], eq + 1);
      double x = StringToDouble(val);
      if(key == "RM" && x >= 0) RiskMoney = x;
      else if(key == "RP" && x > 0 && x <= 100) RiskPercent = x;
      else if(key == "ML" && x >= 1) MaxLosersPerDay = (int)x;
      else if(key == "DLP" && x > 0 && x <= 100) MaxDailyLossPct = x;
      else if(key == "DLU" && x >= 0) MaxDailyLossUSD = x;
      else if(key == "MEP" && x >= 0 && x <= 100) MinEquityPct = x;
      else if(key == "MEU" && x >= 0) MinEquityUSD = x;
      else if(key == "MO" && x >= 1) MaxOpenPositions = (int)x;
      else if(key == "MT" && x >= 0) MaxTradesPerDay = (int)x;
      else if(key == "CD" && x >= 0) CooldownMin = (int)x;
      else if(key == "BW") ParseRanges(val, true);
      else if(key == "PZ") ParseRanges(val, false);
      else if(key == "NW" && x >= 0) NewsMin = (int)x;
      else if(key == "TZO") TzOffsetMin = (int)StringToInteger(val);
      else if(key == "HL") g_horarioTxt = val;
      else if(key == "HS") g_hs = val;
      else if(key == "HV") g_hv = val;
      else if(key == "HD") g_hd = val;
      else if(key == "PH") g_ph = val;
      else if(key == "ZN") g_zn = val;
      else if(key == "NR" && x >= 0) g_nr = (int)x;
      else if(key == "AS") { if(val != AllowedSymbols) { AllowedSymbols = val; resym = true; } }
      else if(key == "BS") { if(val != BlockedSymbols) { BlockedSymbols = val; resym = true; } }
      else if(key == "SM" && x >= 0 && x <= 2) SLMode = (ENUM_SL_MODE)(int)x;
      else if(key == "SP" && x > 0) SLPips = x;
      else if(key == "PS" && x > 0) PipSize = x;
      else if(key == "PY" && val != "") PipSymbol = val;
      else if(key == "SC" && x > 0) SLPercent = x;
      else if(key == "AM" && x > 0) ATRMult = x;
      else if(key == "AT" && x > 0) { ENUM_TIMEFRAMES tf = TfDeMin((int)x); if(tf != ATRTF) { ATRTF = tf; reatr = true; } }
      else if(key == "RR" && x >= 0) RewardRatio = x;
      else if(key == "LK" && x >= 0 && x <= 2) { LockSLTP = (x > 0); FlexibleLock = (x == 2); }
      else if(key == "BM") BlockOnManualClose = (x > 0);
   }
   g_cfgOk = true;
   if(reatr) ResetAtr();
   if(resym || reatr) { ParseSymbols(); ParseBlocked(); PrepAtr(); }
}

// hora local de la persona (HH:MM) para un minuto de la semana UTC
string LocalHM(int mow)
{
   int m = ((mow + TzOffsetMin) % 1440 + 1440) % 1440;
   return StringFormat("%02d:%02d", m / 60, m % 60);
}

// "08:00" si es hoy (tu hora), o "mar 08:00" si es otro dia
string LocalWhen(int mow, int nowMow)
{
   string dn[7] = {"dom", "lun", "mar", "mie", "jue", "vie", "sab"};
   int a = (((mow + TzOffsetMin) / 1440) % 7 + 7) % 7;
   int b = (((nowMow + TzOffsetMin) / 1440) % 7 + 7) % 7;
   if(mow + TzOffsetMin < 0) a = 6;
   if(nowMow + TzOffsetMin < 0) b = 6;
   return (a == b ? "" : dn[a] + " ") + LocalHM(mow);
}

// Fuera de horario, dia bloqueado o pausa por fecha: no deja ABRIR trades
bool TimeBlocked(string &why)
{
   datetime g = TimeGMT();
   for(int i = 0; i < ArraySize(g_pzS); i++)
      if((long)g >= g_pzS[i] && (long)g < g_pzE[i])
      {
         datetime fin = (datetime)(g_pzE[i] + (long)TzOffsetMin * 60);
         why = "EN PAUSA hasta " + TimeToString(fin - 60, TIME_DATE);
         g_detalle = "estas en una pausa que pusiste en VICTOR (hasta el " + TimeToString(fin - 60, TIME_DATE) + "). Descansar tambien es parte del plan.";
         return true;
      }
   if(ArraySize(g_bwS) == 0) return false;
   MqlDateTime t; TimeToStruct(g, t);
   int mow = t.day_of_week * 1440 + t.hour * 60 + t.min;
   for(int i = 0; i < ArraySize(g_bwS); i++)
      if(mow >= g_bwS[i] && mow < g_bwE[i])
      {
         int fin = g_bwE[i];
         // si el bloqueo sigue al empezar la semana, busca donde termina
         if(fin >= 10080)
            for(int j = 0; j < ArraySize(g_bwS); j++) if(g_bwS[j] == 0) { fin = g_bwE[j]; break; }
         why = "FUERA DE HORARIO: abres " + LocalWhen(fin % 10080, mow);
         g_detalle = "estas fuera del horario que pusiste en VICTOR. Puedes volver a operar: " + LocalWhen(fin % 10080, mow) + " (tu hora).";
         return true;
      }
   return false;
}

// Noticias de alto impacto del calendario economico de MT5
struct VNews { datetime t; string cur; string name; };
VNews    g_news[];
datetime g_newsAt = 0;

void LoadNews()
{
   if(NewsMin <= 0) return;
   if(g_newsAt > 0 && TimeLocal() - g_newsAt < 900) return;
   g_newsAt = TimeLocal();
   ArrayResize(g_news, 0);
   MqlCalendarValue v[];
   datetime now = TimeTradeServer();
   int k = CalendarValueHistory(v, now - 3 * 3600, now + 2 * 86400);
   for(int i = 0; i < k; i++)
   {
      MqlCalendarEvent ev;
      if(!CalendarEventById(v[i].event_id, ev)) continue;
      if(ev.importance != CALENDAR_IMPORTANCE_HIGH) continue;
      MqlCalendarCountry c;
      if(!CalendarCountryById(ev.country_id, c)) continue;
      int n = ArraySize(g_news);
      ArrayResize(g_news, n + 1);
      g_news[n].t = v[i].time;
      g_news[n].cur = c.currency;
      g_news[n].name = ev.name;
   }
}

bool NewsBlocked(string s, string &why)
{
   if(NewsMin <= 0) return false;
   LoadNews();
   string b = SymbolInfoString(s, SYMBOL_CURRENCY_BASE), p = SymbolInfoString(s, SYMBOL_CURRENCY_PROFIT);
   datetime now = TimeTradeServer();
   for(int i = 0; i < ArraySize(g_news); i++)
   {
      if(g_news[i].cur != b && g_news[i].cur != p) continue;
      long dif = (long)(g_news[i].t - now);
      if(dif > (long)NewsMin * 60 || dif < -(long)NewsMin * 60) continue;
      why = "NOTICIA " + g_news[i].cur + ": espera " + IntegerToString(NewsMin) + " min";
      g_detalle = "hay una noticia de alto impacto de " + g_news[i].cur + " (" + g_news[i].name + "). Tu regla es no abrir trades "
                + IntegerToString(NewsMin) + " min antes ni despues: el precio se mueve sin control en ese momento.";
      return true;
   }
   return false;
}


// 3.24: que tipo de bloqueo es. Solo la perdida maxima del dia y el piso de la
// cuenta cierran trades abiertos (y solo los que todavia arriesgan dinero). Los
// demas bloqueos (perdedores del dia, cierre manual) solo impiden ABRIR nuevos.
bool g_bloqueoCierra = false;

bool IsBlocked(string &why)
{
   g_bloqueoCierra = false;
   int losers, manual, closed; double pl; datetime lastLoss;
   DayStats(losers, pl, manual, closed, lastLoss);
   double total = pl + FloatingPL();
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - pl;   // balance con que empezo el dia
   double maxLoss  = (MaxDailyLossUSD > 0) ? MaxDailyLossUSD : startBal * MaxDailyLossPct / 100.0;
   double minEq    = (MinEquityUSD > 0) ? MinEquityUSD : startBal * MinEquityPct / 100.0;
   if(BlockOnManualClose && manual > 0)
   {
      why = "BLOQUEADO: cerraste un trade a mano hoy";
      g_detalle = "hoy cerraste un trade a mano y tu regla es no hacerlo. Quedas bloqueado hasta manana para no operar con emocion.";
      return true;
   }
   if(losers >= MaxLosersPerDay)
   {
      why = "BLOQUEADO: " + IntegerToString(losers) + " perdedores hoy (tu limite)";
      g_detalle = "hoy ya perdiste " + IntegerToString(losers) + " trades, que es tu limite. Despues de varias perdidas seguidas es cuando mas se quema una cuenta. Manana se reinicia.";
      return true;
   }
   if(total <= -maxLoss)
   {
      why = "BLOQUEADO: llegaste a tu perdida del dia ($" + DoubleToString(maxLoss, 2) + ")";
      g_detalle = "llegaste a tu perdida maxima del dia ($" + DoubleToString(maxLoss, 2) + "). Te bloqueo hasta manana para que un mal dia no se convierta en una cuenta quemada.";
      g_bloqueoCierra = true;
      return true;
   }
   if(AccountInfoDouble(ACCOUNT_EQUITY) <= minEq)
   {
      why = "BLOQUEADO: la cuenta llego a tu piso ($" + DoubleToString(minEq, 2) + ")";
      g_detalle = "tu cuenta bajo de tu piso de $" + DoubleToString(minEq, 2) + ". Todo queda bloqueado para que no la pierdas completa. Revisa tu plan antes de seguir.";
      g_bloqueoCierra = true;
      return true;
   }
   why = "OK | perdedores hoy: " + IntegerToString(losers) + "/" + IntegerToString(MaxLosersPerDay)
       + " | P/L hoy: " + DoubleToString(total, 2);
   return false;
}

// bloqueo suave: no cierra nada, solo impide ABRIR otro trade ahora
// skipTk/riskOverride: para revisar un trade que YA se abrio (ej. desde el Trading Panel de MT5)
bool CanOpenNew(string s, string &why, ulong skipTk = 0, double riskOverride = -1)
{
   if(!g_cfgOk)
   {
      why = (g_token == "") ? "CONECTA CON VICTOR" : "ESPERANDO TUS REGLAS DE VICTOR";
      g_detalle = (g_token == "")
         ? (g_codigo != "" ? "escribe el codigo " + g_codigo + " en victorcfo.com > Trading > Conectar guardian."
                           : "pidiendo tu codigo a VICTOR. Permite " + SyncURL + " en Herramientas > Opciones > Asesores Expertos > WebRequest.")
         : "todavia no llegan tus reglas. Permite " + SyncURL + " en Herramientas > Opciones > Asesores Expertos > WebRequest.";
      return false;
   }
   if(IsBlocked(why)) return false;
   if(TimeBlocked(why)) return false;
   if(NewsBlocked(s, why)) return false;
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
      if(ptk == 0 || ptk == skipTk) continue;
      string psym  = PositionGetString(POSITION_SYMBOL);
      double popen = PositionGetDouble(POSITION_PRICE_OPEN);
      double psl   = PositionGetDouble(POSITION_SL);
      double pvol  = PositionGetDouble(POSITION_VOLUME);
      bool pbuy    = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double d = (psl == 0) ? SLDist(psym) : (pbuy ? popen - psl : psl - popen);
      if(d > 0) openRisk += LossPerLot(psym, d) * pvol;
   }
   double nd = SLDist(s);
   double newRisk = (riskOverride >= 0) ? riskOverride : CalcLot(s, nd) * LossPerLot(s, nd);
   // margen de 10% de un trade para deslizamiento (ej. 3 trades de $7 con perdidas de $7.05)
   if(maxLoss > 0 && openRisk + newRisk > maxLoss + pl + RiskAllowed() * 0.10 + 0.01)
   {
      double queda = MathMax(0, maxLoss + pl - openRisk);
      why = "No cabe hoy: te quedan $" + DoubleToString(queda, 2) + ", este arriesga $" + DoubleToString(newRisk, 2);
      g_detalle = "te quedan $" + DoubleToString(queda, 2) + " para perder hoy" + (openRisk > 0 ? " (contando lo que arriesgan tus trades abiertos)" : "")
                + " y este trade en " + s + " arriesgaria $" + DoubleToString(newRisk, 2) + ". Si sale mal pasarias tu limite de $" + DoubleToString(maxLoss, 2)
                + ". Espera a que cierre un trade abierto o vuelve manana.";
      return false;
   }

   if(MaxTradesPerDay > 0 && closed + PositionsTotal() - (skipTk > 0 ? 1 : 0) >= MaxTradesPerDay)
   {
      why = "Ya hiciste tus " + IntegerToString(MaxTradesPerDay) + " trades de hoy";
      g_detalle = "ya hiciste tus " + IntegerToString(MaxTradesPerDay) + " trades de hoy. Operar de mas es la forma mas comun de devolver lo ganado. Manana se reinicia.";
      return false;
   }
   if(CooldownMin > 0 && lastLoss > 0)
   {
      long left = (long)CooldownMin * 60 - (long)(TimeCurrent() - lastLoss);
      if(left > 0)
      {
         why = "ESPERA " + IntegerToString((int)(left / 60) + 1) + " min tras la perdida";
         g_detalle = "tu regla es esperar " + IntegerToString(CooldownMin) + " min despues de una perdida para no entrar con revancha. Faltan " + IntegerToString((int)(left / 60) + 1) + " min.";
         return false;
      }
   }
   return true;
}

//------------------------------------------------------------------
// Cierre robusto: 1 intento cada 3 s por ticket, prueba los 3 modos de llenado
// (un modo no aceptado por el broker deja ordenes de cierre atascadas).
datetime lastCloseTry = 0;
ulong    lastCloseTk  = 0;
// 3.26: un aviso por trade (aunque el guardian este en varios graficos)
bool AvisoUnaVez(ulong tk)
{
   string kav = P + "AV_" + (string)tk;
   if(GlobalVariableCheck(kav)) return false;
   GlobalVariableSet(kav, 1);
   return true;
}

bool SafeClose(ulong tk)
{
   // 3.26: con el mercado cerrado no se insiste cada segundo; se reintenta cada 5 min
   string kmc = P + "MC_" + (string)tk;
   if(GlobalVariableCheck(kmc) && TimeLocal() < (datetime)GlobalVariableGet(kmc)) return false;
   if(tk == lastCloseTk && TimeCurrent() - lastCloseTry < 3) return false;
   lastCloseTk = tk; lastCloseTry = TimeCurrent();
   ENUM_ORDER_TYPE_FILLING modes[3] = {ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN};
   for(int m = 0; m < 3; m++)
   {
      trade.SetTypeFilling(modes[m]);
      if(trade.PositionClose(tk)) return true;
      uint rc = trade.ResultRetcode();
      if(rc == TRADE_RETCODE_MARKET_CLOSED || rc == TRADE_RETCODE_TRADE_DISABLED)
      {
         if(!GlobalVariableCheck(kmc))
         {
            string msym = PositionSelectByTicket(tk) ? PositionGetString(POSITION_SYMBOL) : "";
            Alert("VictorGuard: el mercado de ", msym, " esta cerrado. Cierro ese trade en cuanto abra.");
         }
         GlobalVariableSet(kmc, (double)(TimeLocal() + 300));
         break;
      }
      if(rc == TRADE_RETCODE_CONNECTION) break;
   }
   Print("VictorGuard: no pude cerrar #", tk, " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   return false;
}

//------------------------------------------------------------------
void Guard()
{
   // sin TUS reglas cargadas no se toca ningun trade (antes, al cambiar de grafico o
   // temporalidad, usaba los valores por defecto y podia cerrar trades por error)
   if(!g_cfgOk) return;
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

      // 3.24: un trade con el SL en ganancia o en break-even ya no arriesga dinero:
      // nunca se cierra por un bloqueo. Y los bloqueos que no son de perdida
      // maxima/piso (ej. 3 perdedores hoy) no cierran los trades ya abiertos.
      bool slProtege = (sl != 0) && ((typ == POSITION_TYPE_BUY) ? (sl >= op) : (sl <= op));
      bool cierraPorBloqueo = blocked && g_bloqueoCierra && !slProtege;
      // reglas que cierran el trade (se explica una sola vez por trade)
      if(cierraPorBloqueo || !SymbolAllowed(sym) || kept >= MaxOpenPositions)
      {
         string kav = P + "AV_" + (string)tk;
         if(!GlobalVariableCheck(kav))
         {
            GlobalVariableSet(kav, 1);
            if(cierraPorBloqueo) Alert("VictorGuard cerro tu trade de ", sym, " para protegerte: ", g_detalle);
            else if(!SymbolAllowed(sym)) Alert("VictorGuard cerro tu trade de ", sym, ": esta en tus activos prohibidos o fuera de tu lista.");
            else Alert("VictorGuard cerro tu trade de ", sym, ": ya tenias ", IntegerToString(MaxOpenPositions), " trades abiertos, tu maximo.");
            if(cierraPorBloqueo) Evt("Cerre tu trade de " + sym + ": " + g_detalle);
            else if(!SymbolAllowed(sym)) Evt("Cerre tu trade de " + sym + ": esta en tus activos prohibidos.");
            else Evt("Cerre tu trade de " + sym + ": ya tenias " + IntegerToString(MaxOpenPositions) + " trades abiertos, tu maximo.");
         }
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
            // 4.0: el riesgo se mide a TU stop real (la linea de Stop Loss), este donde este
            double d = isBuy ? op - sl : sl - op;
            if(d > 0) lossDist = d;
         }
         // margen de 10% por deslizamiento y redondeo; el lote minimo siempre se permite
         double allowed = RiskAllowed();
         double minL = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
         if(vol > minL + 0.0000001 && vol * LossPerLot(sym, lossDist) > allowed * 1.10)
         {
            // 3.23: en vez de cerrar todo el trade (ej. una orden limit que se lleno con
            // el lote que escribiste a mano), se reduce al lote correcto y sigue abierto.
            double lpl  = LossPerLot(sym, lossDist);
            double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
            if(step <= 0) step = minL > 0 ? minL : 0.01;
            int vd = (int)MathMax(0, MathCeil(-MathLog10(step) - 1e-9));
            double okLot = (lpl > 0) ? NormalizeDouble(MathFloor(allowed / lpl / step) * step, vd) : 0;
            double cut = NormalizeDouble(vol - okLot, vd);
            if(okLot >= minL - 0.0000001 && cut >= minL - 0.0000001 && trade.PositionClosePartial(tk, cut))
            {
               Alert("VictorGuard ajusto tu trade de ", sym, ": tenia ", DoubleToString(vol, 2), " lotes y arriesgaba $", DoubleToString(vol * lpl, 2),
                     ". Lo deje en ", DoubleToString(okLot, 2), " lotes para arriesgar $", DoubleToString(okLot * lpl, 2), " (tu limite por trade es $", DoubleToString(allowed, 2), ").");
               continue;   // en el proximo ciclo se revisa con el lote nuevo
            }
            if(AvisoUnaVez(tk))
               Alert("VictorGuard cerro tu trade de ", sym, " para protegerte: con ", DoubleToString(vol, 2), " lotes arriesgabas $",
                     DoubleToString(vol * lpl, 2), " y tu limite por trade es $", DoubleToString(allowed, 2), ". Abre con el boton del guardian y te calcula el lote correcto.");
            SafeClose(tk);
            continue;
         }
         // el lote minimo solo se permite si no pasa 1.5 veces tu riesgo (igual que los botones)
         if(vol <= minL + 0.0000001 && RiskTooHigh(sym, vol, lossDist))
         {
            if(AvisoUnaVez(tk))
               Alert("VictorGuard cerro tu trade de ", sym, " para protegerte: hasta el lote mas pequeno (", DoubleToString(vol, 2), ") arriesgaba $",
                     DoubleToString(vol * LossPerLot(sym, lossDist), 2), " y tu limite por trade es $", DoubleToString(allowed, 2),
                     ". Ahora mismo este activo se mueve demasiado para tu cuenta.");
            SafeClose(tk);
            continue;
         }
         // mismas reglas que los botones: presupuesto del dia, trades del dia y espera tras perdida
         string wn;
         if(!CanOpenNew(sym, wn, tk, vol * LossPerLot(sym, lossDist)))
         {
            if(AvisoUnaVez(tk))
            {
               Alert("VictorGuard cerro tu trade de ", sym, " para protegerte: ", g_detalle);
               Evt("Cerre tu trade de " + sym + ": " + g_detalle);
            }
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
      // 4.0: un SL lejano ya no se mueve: el lote se reviso contra ese mismo SL arriba
      if(sl == 0)
         newSL = buy ? op - dist : op + dist;
      double dsl = MathAbs(op - newSL);
      if(tp == 0 && RewardRatio > 0 && dsl > 0)
         newTP = buy ? op + dsl * RewardRatio : op - dsl * RewardRatio;
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
//------------------------------------------------------------------
// 4.0: linea de Stop Loss. La arrastras a donde va tu stop y el lote se ajusta solo
// para arriesgar siempre lo mismo. Debajo del precio = compra; arriba = venta.
double PipDe(string s)
{
   int d = (int)SymbolInfoInteger(s, SYMBOL_DIGITS);
   double pt = SymbolInfoDouble(s, SYMBOL_POINT);
   return (d == 2 || d == 3 || d == 5) ? pt * 10 : pt;
}
string GvLinea() { return P + "SLO_" + (string)ChartID() + "_" + _Symbol; }

void LineaPoner(double precio)
{
   string n = P + "SLL";
   if(ObjectFind(0, n) < 0)
   {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, precio);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrRed);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 2);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, true);
      ObjectSetInteger(0, n, OBJPROP_SELECTED, false);
      ObjectSetString(0, n, OBJPROP_TEXT, "Stop Loss");
      ObjectSetString(0, n, OBJPROP_TOOLTIP, "Stop Loss: doble clic y arrastrala a donde va tu stop. Sigue al precio.");
   }
   if(ObjectFind(0, P + "SLT") < 0)
   {
      ObjectCreate(0, P + "SLT", OBJ_TEXT, 0, 0, precio);
      ObjectSetString(0, P + "SLT", OBJPROP_TEXT, "Stop Loss");
      ObjectSetString(0, P + "SLT", OBJPROP_FONT, "Arial Bold");
      ObjectSetInteger(0, P + "SLT", OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, P + "SLT", OBJPROP_COLOR, clrRed);
      ObjectSetInteger(0, P + "SLT", OBJPROP_ANCHOR, ANCHOR_RIGHT_LOWER);
      ObjectSetInteger(0, P + "SLT", OBJPROP_SELECTABLE, false);
   }
   ObjectSetDouble(0, n, OBJPROP_PRICE, NormalizeDouble(precio, _Digits));
}

// pone la linea a la distancia de tu regla de stop, debajo del precio
void LineaReglas()
{
   double d = SLDist(_Symbol);
   if(d <= 0) d = 35 * PipDe(_Symbol);
   g_slOff = d;
   LineaSeguir();
}

// 4.1: la linea sigue al precio a la distancia que escogiste (asi siempre esta cerca).
// Mientras la tienes seleccionada para arrastrarla, se queda quieta.
void LineaSeguir()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0 || g_slOff == 0) return;
   double objetivo = NormalizeDouble(g_slOff > 0 ? bid - g_slOff : ask - g_slOff, _Digits);
   if(ObjectFind(0, P + "SLL") < 0) { LineaPoner(objetivo); return; }
   if(ObjectGetInteger(0, P + "SLL", OBJPROP_SELECTED)) return;
   if(MathAbs(ObjectGetDouble(0, P + "SLL", OBJPROP_PRICE) - objetivo) > _Point / 2)
      ObjectSetDouble(0, P + "SLL", OBJPROP_PRICE, objetivo);
}

// la soltaste en otro lugar: esa es la nueva distancia
void LineaSoltada()
{
   double sl  = ObjectGetDouble(0, P + "SLL", OBJPROP_PRICE);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(sl > 0 && sl < bid) g_slOff = bid - sl;
   else if(sl > ask)      g_slOff = -(sl - ask);
   ObjectSetInteger(0, P + "SLL", OBJPROP_SELECTED, false);
   LineaSeguir();
}

// 1 = compra (linea debajo), -1 = venta (linea arriba), 0 = la linea esta en el precio
int LineaDir(double &dist)
{
   dist = 0;
   if(ObjectFind(0, P + "SLL") < 0) return 0;
   double sl  = ObjectGetDouble(0, P + "SLL", OBJPROP_PRICE);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(sl > 0 && sl < bid) { dist = ask - sl; return 1; }
   if(sl > ask)           { dist = sl - bid; return -1; }
   return 0;
}

// el nombre "Stop Loss" pegado a la linea, en el borde derecho del grafico
void LineaTexto()
{
   if(ObjectFind(0, P + "SLL") < 0 || ObjectFind(0, P + "SLT") < 0) return;
   int primera = (int)ChartGetInteger(0, CHART_FIRST_VISIBLE_BAR);
   int ancho   = (int)ChartGetInteger(0, CHART_WIDTH_IN_BARS);
   int barra   = MathMax(0, primera - ancho + 3);
   ObjectMove(0, P + "SLT", 0, iTime(_Symbol, _Period, barra), ObjectGetDouble(0, P + "SLL", OBJPROP_PRICE));
}

void OpenTrade(bool buy)
{
   string why;
   if(!SymbolAllowed(_Symbol)) { Alert("VictorGuard te protegio: ", _Symbol, " esta en tus activos prohibidos o fuera de tu lista. Lo pusiste ahi para cuidarte."); return; }
   if(!CanOpenNew(_Symbol, why)) { Alert("VictorGuard te protegio: ", g_detalle); return; }
   if(PositionsTotal() >= MaxOpenPositions) { Alert("VictorGuard te protegio: ya tienes ", IntegerToString(MaxOpenPositions), " trades abiertos, tu maximo. Cierra o espera uno antes de abrir otro."); return; }

   // 4.0: el stop es la linea roja de Stop Loss
   double dist = 0;
   int dir = LineaDir(dist);
   if(dir == 0) { Alert("VictorGuard: pon la linea roja de Stop Loss debajo del precio para comprar, o arriba para vender."); return; }
   if((buy && dir != 1) || (!buy && dir != -1))
   {
      Alert("VictorGuard: tu linea de Stop Loss esta ", (dir == 1 ? "debajo" : "arriba"), " del precio, eso es para ", (dir == 1 ? "COMPRAR" : "VENDER"),
            ". Para ", (buy ? "comprar ponla debajo." : "vender ponla arriba."));
      return;
   }
   long lvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   if(dist <= 0 || dist < lvl * SymbolInfoDouble(_Symbol, SYMBOL_POINT)) { Alert("VictorGuard: el Stop Loss esta demasiado cerca del precio en ", _Symbol); return; }
   double lot = CalcLot(_Symbol, dist);
   if(lot <= 0 || RiskTooHigh(_Symbol, lot, dist))
   {
      int dg = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      double lim = RiskAllowed();
      Alert("VictorGuard te protegio: en ", _Symbol, " el lote mas pequeno (", DoubleToString(lot, 2), ") con el stop a ", DoubleToString(dist, dg),
            " arriesgaria $", DoubleToString(lot * LossPerLot(_Symbol, dist), 2), " y tu limite por trade es $", DoubleToString(lim, 2),
            ". Acerca la linea de Stop Loss, usa otro activo o sube tu riesgo por trade.");
      return;
   }

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double price = buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = NormalizeDouble(ObjectGetDouble(0, P + "SLL", OBJPROP_PRICE), digits);
   dist = MathAbs(price - sl);
   double tp = (RewardRatio > 0) ? (buy ? price + dist * RewardRatio : price - dist * RewardRatio) : 0;
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
   if(!g_cfgOk) return;
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

      // 3.23: el lote de la orden se ajusta a tu riesgo ANTES de que se llene (MT5 no
      // deja cambiar el volumen de una orden: se borra y se vuelve a poner igual,
      // con el lote correcto). Asi la orden limit entra con su SL y su lote bien.
      double ovol = OrderGetDouble(ORDER_VOLUME_CURRENT);
      double odist = MathAbs(price - nsl);
      double olpl = LossPerLot(osym, odist);
      double allowedO = RiskAllowed();
      double ominL = SymbolInfoDouble(osym, SYMBOL_VOLUME_MIN);
      if(olpl > 0 && ovol > ominL + 0.0000001 && ovol * olpl > allowedO * 1.10)
      {
         double ostep = SymbolInfoDouble(osym, SYMBOL_VOLUME_STEP);
         if(ostep <= 0) ostep = ominL > 0 ? ominL : 0.01;
         int ovd = (int)MathMax(0, MathCeil(-MathLog10(ostep) - 1e-9));
         double oLot = NormalizeDouble(MathFloor(allowedO / olpl / ostep) * ostep, ovd);
         if(oLot >= ominL - 0.0000001)
         {
            ENUM_ORDER_TYPE_TIME ott = (ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME);
            datetime oexp = (datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
            double ostl = OrderGetDouble(ORDER_PRICE_STOPLIMIT);
            if(trade.OrderDelete(tk))
            {
               if(trade.OrderOpen(osym, t, oLot, ostl, price, nsl, ntp, ott, oexp, "VictorGuard"))
                  Alert("VictorGuard ajusto tu orden de ", osym, ": de ", DoubleToString(ovol, 2), " a ", DoubleToString(oLot, 2),
                        " lotes para arriesgar $", DoubleToString(oLot * olpl, 2), " con su stop (tu limite por trade es $", DoubleToString(allowedO, 2), ").");
               else
                  Alert("VictorGuard: no pude volver a poner tu orden de ", osym, " con el lote correcto (", trade.ResultRetcodeDescription(), "). Ponla otra vez con ", DoubleToString(oLot, 2), " lotes.");
            }
            continue;
         }
      }

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

// Algo Trading apagado = el guardian no puede poner stops, cerrar ni bloquear
bool g_algoAvisado = false;
bool AlgoOff()
{
   return !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED);
}

void UpdatePanel()
{
   if(AlgoOff())
   {
      if(!g_algoAvisado) Alert("VictorGuard: Algo Trading esta APAGADO. No puedo poner stops ni cerrar trades. Activa el boton Algo Trading.");
      g_algoAvisado = true;
      ObjectSetString(0, P + "ST", OBJPROP_TEXT, "ALGO TRADING APAGADO: NO te estoy protegiendo");
      ObjectSetInteger(0, P + "ST", OBJPROP_COLOR, clrRed);
      ObjectSetString(0, P + "LT", OBJPROP_TEXT, "Activa el boton Algo Trading (verde) en la barra de MT5");
      ObjectSetInteger(0, P + "LT", OBJPROP_COLOR, clrRed);
      ChartRedraw();
      return;
   }
   g_algoAvisado = false;
   ObjectSetInteger(0, P + "ST", OBJPROP_COLOR, clrOrange);
   string why;
   if(!IsBlocked(why))
   {
      string w2;
      if(!SymbolAllowed(_Symbol)) why = _Symbol + " no esta permitido";
      else if(!CanOpenNew(_Symbol, w2)) why = w2;
   }
   // 4.0: lote segun la linea de Stop Loss (si la borraron, vuelve a tu regla)
   if(ObjectFind(0, P + "SLL") < 0 && g_slOff == 0) LineaReglas();
   else LineaSeguir();
   double dist = 0;
   int dir = LineaDir(dist);
   double lot = dist > 0 ? CalcLot(_Symbol, dist) : 0;
   double rk  = dist > 0 ? lot * LossPerLot(_Symbol, dist) : 0;
   double lim = RiskAllowed();
   // MT5 corta las etiquetas a 63 letras: estado y riesgo van en lineas separadas
   ObjectSetString(0, P + "ST", OBJPROP_TEXT, StringSubstr(why, 0, 63));
   string lt = (dir == 0) ? "Pon la linea roja de Stop Loss arriba o abajo del precio"
             : (dir == 1 ? "COMPRA " : "VENTA ") + DoubleToString(lot, 2) + " lotes | SL " + DoubleToString(dist / PipDe(_Symbol), 1)
               + " pips | riesgo $" + DoubleToString(rk, 2) + " / $" + DoubleToString(lim, 2);
   ObjectSetString(0, P + "LT", OBJPROP_TEXT, StringSubstr(lt, 0, 63));
   // verde = el trade cabe en tu riesgo; rojo = ni el lote minimo cabe
   ObjectSetInteger(0, P + "LT", OBJPROP_COLOR, (dir == 0 || rk > lim * 1.5) ? clrRed : clrForestGreen);
   // el boton del lado que marca la linea muestra el lote; el otro se apaga
   ObjectSetString(0, P + "BUY",  OBJPROP_TEXT, dir == 1  ? "COMPRAR " + DoubleToString(lot, 2) : "COMPRAR");
   ObjectSetString(0, P + "SELL", OBJPROP_TEXT, dir == -1 ? "VENDER " + DoubleToString(lot, 2) : "VENDER");
   ObjectSetInteger(0, P + "BUY",  OBJPROP_BGCOLOR, dir == 1  ? clrSeaGreen : C'70,70,70');
   ObjectSetInteger(0, P + "SELL", OBJPROP_BGCOLOR, dir == -1 ? clrFireBrick : C'70,70,70');
   LineaTexto();

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
// 4.0: tus reglas se cambian aqui mismo (boton Reglas). Se mandan a VICTOR, que las
// guarda igual que la web: apretar aplica al instante; aflojar, desde manana.
string R_TXT[6] = {"Riesgo por trade ($)", "Perdidas maximas al dia", "Trades maximos al dia (0 = sin limite)",
                   "Trades abiertos a la vez", "TP: veces el riesgo (0 = sin TP)", "Espera tras perder (minutos)"};

double ReglaActual(int i)
{
   if(i == 0) return RiskAllowed();
   if(i == 1) return MaxLosersPerDay;
   if(i == 2) return MaxTradesPerDay;
   if(i == 3) return MaxOpenPositions;
   if(i == 4) return RewardRatio;
   return CooldownMin;
}

void RLabel(string n, int x, int y, string t, color c, int sz)
{
   if(ObjectFind(0, n) < 0)
   {
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, sz);
   ObjectSetString(0, n, OBJPROP_TEXT, t == "" ? " " : t);
}

void RBoton(string n, string t, int x, int y, int w, color bg)
{
   ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, 28);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrWhite);
}

int RY0() { return 160; }

void ReglasPie()
{
   if(!g_reglasAbiertas) return;
   double rm = StringToDouble(ObjectGetString(0, P + "RE0", OBJPROP_TEXT));
   double ml = StringToDouble(ObjectGetString(0, P + "RE1", OBJPROP_TEXT));
   int y = RY0() + 36 + 6 * 26;
   RLabel(P + "RDL", 20, y + 3, "Perdida maxima del dia: $" + DoubleToString(rm * MathMax(0, MathRound(ml)), 2) + "  (riesgo x perdidas)", clrSilver, 9);
   RLabel(P + "RM1", 20, y + 64, g_setMsg1, clrOrange, 9);
   RLabel(P + "RM2", 20, y + 80, g_setMsg2, clrOrange, 9);
   ChartRedraw();
}

void HorarioPie()
{
   if(!g_horAbierto) return;
   RLabel(P + "HM1", 20, RY0() + 272, g_setMsg1, clrOrange, 9);
   RLabel(P + "HM2", 20, RY0() + 288, g_setMsg2, clrOrange, 9);
   ChartRedraw();
}

void HorarioCerrar();
void ReglasAbrir()
{
   HorarioCerrar();
   g_reglasAbiertas = true;
   int x = 10, y = RY0(), w = 340;
   string bg = P + "RBG";
   ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, 36 + 6 * 26 + 104);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'18,22,30');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'40,180,110');
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   RLabel(P + "RH", x + 10, y + 8, "Tus reglas (se guardan en VICTOR)", C'40,200,120', 11);
   for(int i = 0; i < 6; i++)
   {
      int yy = y + 36 + i * 26;
      RLabel(P + "RL" + IntegerToString(i), x + 10, yy + 3, R_TXT[i], clrWhite, 9);
      string e = P + "RE" + IntegerToString(i);
      ObjectCreate(0, e, OBJ_EDIT, 0, 0, 0);
      ObjectSetInteger(0, e, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, e, OBJPROP_XDISTANCE, x + w - 80);
      ObjectSetInteger(0, e, OBJPROP_YDISTANCE, yy);
      ObjectSetInteger(0, e, OBJPROP_XSIZE, 70);
      ObjectSetInteger(0, e, OBJPROP_YSIZE, 20);
      ObjectSetInteger(0, e, OBJPROP_BGCOLOR, C'35,40,50');
      ObjectSetInteger(0, e, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, e, OBJPROP_ALIGN, ALIGN_RIGHT);
      double v = ReglaActual(i);
      ObjectSetString(0, e, OBJPROP_TEXT, (i == 0 || i == 4) ? DoubleToString(v, 2) : IntegerToString((int)v));
   }
   int yb = y + 36 + 6 * 26 + 26;
   RBoton(P + "RSV", "Guardar", x + 10, yb, 150, clrSeaGreen);
   RBoton(P + "RX", "Cerrar", x + 170, yb, 150, C'70,70,70');
   ReglasPie();
}

void ReglasCerrar()
{
   g_reglasAbiertas = false;
   ObjectsDeleteAll(0, P + "R");
   ChartRedraw();
}

void ReglasMsg(string m)
{
   // MT5 corta cada etiqueta a 63 letras: el mensaje va en dos lineas
   g_setMsg1 = m; g_setMsg2 = "";
   if(StringLen(m) > 58)
   {
      int corte = 58;
      while(corte > 20 && StringSubstr(m, corte, 1) != " ") corte--;
      g_setMsg1 = StringSubstr(m, 0, corte);
      g_setMsg2 = StringSubstr(m, corte + 1, 62);
   }
   ReglasPie();
   HorarioPie();
}

void ReglasGuardar()
{
   if(g_token == "") { ReglasMsg("Primero conecta con VICTOR con tu codigo de 6 digitos."); return; }
   double v[6];
   for(int i = 0; i < 6; i++) v[i] = StringToDouble(ObjectGetString(0, P + "RE" + IntegerToString(i), OBJPROP_TEXT));
   if(v[0] <= 0) { ReglasMsg("El riesgo por trade debe ser mayor que $0."); return; }
   if(v[1] < 1 || v[1] > 50) { ReglasMsg("Perdidas maximas al dia: de 1 a 50."); return; }
   if(v[2] < 0 || v[2] > 100) { ReglasMsg("Trades maximos al dia: de 0 (sin limite) a 100."); return; }
   if(v[3] < 1 || v[3] > 20) { ReglasMsg("Trades abiertos a la vez: de 1 a 20."); return; }
   if(v[4] < 0 || v[4] > 10) { ReglasMsg("TP: de 0 (sin TP) a 10 veces el riesgo."); return; }
   if(v[5] < 0 || v[5] > 1440) { ReglasMsg("Espera tras perder: de 0 a 1440 minutos."); return; }
   g_set = "{\"rm\":" + DoubleToString(v[0], 2) + ",\"ml\":" + IntegerToString((int)MathRound(v[1]))
         + ",\"mt\":" + IntegerToString((int)MathRound(v[2])) + ",\"mo\":" + IntegerToString((int)MathRound(v[3]))
         + ",\"rr\":" + DoubleToString(v[4], 2) + ",\"cd\":" + IntegerToString((int)MathRound(v[5])) + "}";
   g_lastTry = 0;   // se manda en el proximo segundo
   ReglasMsg("Enviando a VICTOR...");
}

//------------------------------------------------------------------
// 4.1: horario y bloqueos (boton Horario). Las horas son en TU hora (la zona de VICTOR).
string H_SES[4]  = {"asia", "londres", "solape", "nueva_york"};
string H_SESN[4] = {"Asia", "Londres", "Lon+NY", "Nueva York"};
string H_DIA[7]  = {"D", "L", "M", "X", "J", "V", "S"};

bool EnLista(string lista, string x)
{
   string a[];
   int k = StringSplit(lista, ',', a);
   for(int i = 0; i < k; i++) if(a[i] == x) return true;
   return false;
}

void HToggle(string n, string t, int x, int y, int w, bool on)
{
   RBoton(n, t, x, y, w, on ? C'31,157,116' : C'50,55,65');
   ObjectSetInteger(0, n, OBJPROP_YSIZE, 24);
   ObjectSetInteger(0, n, OBJPROP_STATE, on);
}

void HEdit(string n, int x, int y, int w, string t)
{
   ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, 20);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C'35,40,50');
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
}

void HorarioAbrir()
{
   if(g_reglasAbiertas) ReglasCerrar();
   g_horAbierto = true;
   int x = 10, y = RY0(), w = 340;
   string bg = P + "HBG";
   ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, 312);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'18,22,30');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'40,180,110');
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   RLabel(P + "HT", x + 10, y + 8, "Horario y bloqueos" + (g_zn != "" ? " (hora de " + g_zn + ")" : ""), C'40,200,120', 11);
   RLabel(P + "HL1", x + 10, y + 34, "Solo operar en estas sesiones (ninguna = sin limite)", clrWhite, 9);
   for(int i = 0; i < 4; i++) HToggle(P + "HS" + IntegerToString(i), H_SESN[i], x + 10 + i * 81, y + 52, 77, EnLista(g_hs, H_SES[i]));
   string hv[];
   string ini = "", fin = "";
   if(StringSplit(g_hv, '-', hv) == 2) { ini = hv[0]; fin = hv[1]; }
   RLabel(P + "HL2", x + 10, y + 89, "O en estas horas (HH:MM)", clrWhite, 9);
   HEdit(P + "HV0", x + 180, y + 86, 60, ini);
   RLabel(P + "HL3", x + 246, y + 89, "a", clrWhite, 9);
   HEdit(P + "HV1", x + 262, y + 86, 60, fin);
   RLabel(P + "HL4", x + 10, y + 117, "Dias sin operar", clrWhite, 9);
   for(int d = 0; d < 7; d++) HToggle(P + "HD" + IntegerToString(d), H_DIA[d], x + 10 + d * 46, y + 135, 42, EnLista(g_hd, IntegerToString(d)));
   RLabel(P + "HL5", x + 10, y + 172, "Noticias fuertes: min antes y despues (0 = no)", clrWhite, 9);
   HEdit(P + "HN", x + 262, y + 169, 60, IntegerToString(g_nr));
   RLabel(P + "HL6", x + 10, y + 200, "Pausa hasta (AAAA-MM-DD, vacio = sin pausa)", clrWhite, 9);
   HEdit(P + "HP", x + 232, y + 197, 90, g_ph);
   RBoton(P + "HSV", "Guardar", x + 10, y + 232, 150, clrSeaGreen);
   RBoton(P + "HX", "Cerrar", x + 170, y + 232, 150, C'70,70,70');
   HorarioPie();
}

void HorarioCerrar()
{
   if(!g_horAbierto) return;
   g_horAbierto = false;
   ObjectsDeleteAll(0, P + "H");
   ChartRedraw();
}

bool HoraOk(string t)
{
   string p[];
   if(StringSplit(t, ':', p) != 2) return false;
   int h = (int)StringToInteger(p[0]), m = (int)StringToInteger(p[1]);
   return StringLen(p[1]) == 2 && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

void HorarioGuardar()
{
   if(g_token == "") { ReglasMsg("Primero conecta con VICTOR con tu codigo de 6 digitos."); return; }
   string ses = "", dias = "";
   for(int i = 0; i < 4; i++) if(ObjectGetInteger(0, P + "HS" + IntegerToString(i), OBJPROP_STATE)) ses += (ses == "" ? "" : ",") + H_SES[i];
   for(int d = 0; d < 7; d++) if(ObjectGetInteger(0, P + "HD" + IntegerToString(d), OBJPROP_STATE)) dias += (dias == "" ? "" : ",") + IntegerToString(d);
   string ini = ObjectGetString(0, P + "HV0", OBJPROP_TEXT), fin = ObjectGetString(0, P + "HV1", OBJPROP_TEXT);
   StringTrimLeft(ini); StringTrimRight(ini); StringTrimLeft(fin); StringTrimRight(fin);
   string ven = "";
   if(ini != "" || fin != "")
   {
      if(!HoraOk(ini) || !HoraOk(fin) || ini == fin) { ReglasMsg("Horas: escribelas como 08:00 y 14:00 (o deja las dos vacias)."); return; }
      ven = ini + "-" + fin;
   }
   int nr = (int)StringToInteger(ObjectGetString(0, P + "HN", OBJPROP_TEXT));
   if(nr < 0 || nr > 120) { ReglasMsg("Noticias: de 0 a 120 minutos."); return; }
   string ph = ObjectGetString(0, P + "HP", OBJPROP_TEXT);
   StringTrimLeft(ph); StringTrimRight(ph);
   if(ph != "" && (StringLen(ph) != 10 || StringSubstr(ph, 4, 1) != "-" || StringSubstr(ph, 7, 1) != "-")) { ReglasMsg("Pausa: escribe la fecha como 2026-12-31."); return; }
   g_hor = "{\"ses\":" + JStr(ses) + ",\"ven\":" + JStr(ven) + ",\"dias\":" + JStr(dias)
         + ",\"news\":" + IntegerToString(nr) + ",\"pausa\":" + JStr(ph) + "}";
   g_lastTry = 0;
   ReglasMsg("Enviando a VICTOR...");
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

// ---- Conexion con codigo de 6 digitos (3.21) ----
// Sin token, el guardian pide un codigo a VICTOR y lo muestra grande en el grafico.
// La persona lo escribe en victorcfo.com y VICTOR le entrega el token, que se guarda
// en un archivo por cuenta de MT5 (asi demo y real tienen cada una el suyo).
datetime g_lastPair = 0;

string FileTxt(string name)
{
   int h = FileOpen(name, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE) return "";
   string s = FileReadString(h);
   FileClose(h);
   StringTrimLeft(s);
   StringTrimRight(s);
   return s;
}
bool FileSave(string name, string s)
{
   int h = FileOpen(name, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE) return false;
   FileWriteString(h, s);
   FileClose(h);
   return true;
}
string TokenFile() { return "VictorGuard_t_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".txt"; }
string InstallId()
{
   string id = FileTxt("VictorGuard_install.txt");
   if(StringLen(id) >= 16) return id;
   MathSrand((int)(GetTickCount() ^ (uint)GetMicrosecondCount() ^ (uint)TimeLocal() ^ (uint)AccountInfoInteger(ACCOUNT_LOGIN)));
   string hx = "0123456789abcdef";
   id = "";
   for(int i = 0; i < 40; i++) id += StringSubstr(hx, (MathRand() ^ (int)(GetMicrosecondCount() & 0xFF)) % 16, 1);
   FileSave("VictorGuard_install.txt", id);
   return id;
}
string JGet(string resp, string key)
{
   string k = "\"" + key + "\":\"";
   int a = StringFind(resp, k);
   if(a < 0) return "";
   a += StringLen(k);
   int e = StringFind(resp, "\"", a);
   if(e <= a) return "";
   return StringSubstr(resp, a, e - a);
}
void BigLabel(string name, string txt, int y, int size)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS) / 2);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrDodgerBlue);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
}
void ShowCode(string cd)
{
   if(cd == "")
   {
      ObjectDelete(0, P + "CD");
      ObjectDelete(0, P + "CD2");
      ChartRedraw();
      return;
   }
   BigLabel(P + "CD", "Tu codigo VICTOR:  " + StringSubstr(cd, 0, 3) + " " + StringSubstr(cd, 3), 170, 30);
   BigLabel(P + "CD2", "Escribelo en victorcfo.com  >  Trading  >  Conectar guardian", 225, 13);
   ChartRedraw();
}

void PairTick()
{
   if(g_token != "" || SyncURL == "") return;
   if(AccountInfoInteger(ACCOUNT_LOGIN) <= 0) return;
   if(TimeLocal() - g_lastPair < 5) return;
   g_lastPair = TimeLocal();
   // si esta cuenta ya se habia conectado antes, usa su codigo guardado
   string guardado = FileTxt(TokenFile());
   if(StringLen(guardado) >= 32) { g_token = guardado; g_lastTry = 0; ShowCode(""); return; }

   string body = "{\"pair\":{\"install\":" + JStr(InstallId())
      + ",\"login\":" + JStr(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)))
      + ",\"server\":" + JStr(AccountInfoString(ACCOUNT_SERVER)) + "}}";
   char data[], res[];
   string rh;
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   int code = WebRequest("POST", SyncURL, "Content-Type: application/json\r\n", 8000, data, res, rh);
   if(code == -1)
   {
      g_sync = "Permite " + SyncURL + " en Opciones > Asesores Expertos";
      ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
      return;
   }
   if(code != 200)
   {
      g_sync = "Conexion: error HTTP " + IntegerToString(code);
      ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
      return;
   }
   string resp = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   string tk = JGet(resp, "token");
   if(StringLen(tk) >= 32)
   {
      g_token = tk;
      FileSave(TokenFile(), tk);
      g_codigo = "";
      ShowCode("");
      g_lastTry = 0;
      g_sync = "Conectado con VICTOR";
      ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
      Alert("VictorGuard: conectado con VICTOR. Tus reglas llegan en segundos.");
      return;
   }
   string cd = JGet(resp, "codigo");
   if(StringLen(cd) == 6)
   {
      g_codigo = cd;
      ShowCode(cd);
      g_sync = "Esperando que escribas el codigo en VICTOR";
      ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
   }
}

void SyncTick()
{
   if(g_token == "" || SyncURL == "") return;
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

   // 2b) trades abiertos y estado del dia, para los avisos al celular (3.25)
   string opn = "";
   int nOpen = 0;
   for(int q = 0; q < PositionsTotal() && nOpen < 20; q++)
   {
      ulong ptk = PositionGetTicket(q);
      if(ptk == 0) continue;
      string psym = PositionGetString(POSITION_SYMBOL);
      bool pbuy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      double pvol = PositionGetDouble(POSITION_VOLUME);
      double psl = PositionGetDouble(POSITION_SL), pop = PositionGetDouble(POSITION_PRICE_OPEN);
      double prk = -1;
      if(GlobalVariableCheck(P + "RK_" + (string)ptk)) prk = GlobalVariableGet(P + "RK_" + (string)ptk);
      else if(psl > 0)
      {
         double pdd = pbuy ? pop - psl : psl - pop;
         if(pdd > 0) prk = LossPerLot(psym, pdd) * pvol;
      }
      opn += (opn == "" ? "" : ",") + "{\"ticket\":" + JStr((string)ptk) + ",\"symbol\":" + JStr(psym)
         + ",\"side\":" + JStr(pbuy ? "buy" : "sell") + ",\"volume\":" + DoubleToString(pvol, 2)
         + (prk >= 0 ? ",\"risk\":" + DoubleToString(prk, 2) : "") + "}";
      nOpen++;
   }
   string lockTxt = "";
   double leftUsd = -1;
   int dLos = 0, dMan = 0, dCl = 0; double dPl = 0; datetime dLL = 0;
   if(g_cfgOk)
   {
      string dsv = g_detalle, lw = "";
      if(IsBlocked(lw)) lockTxt = g_detalle;
      g_detalle = dsv;
      DayStats(dLos, dPl, dMan, dCl, dLL);
      double sb = AccountInfoDouble(ACCOUNT_BALANCE) - dPl;
      double mx = (MaxDailyLossUSD > 0) ? MaxDailyLossUSD : sb * MaxDailyLossPct / 100.0;
      leftUsd = MathMax(0, mx + MathMin(0, dPl));
   }

   // 3) enviar (siempre, aunque no haya trades nuevos: asi se actualiza el balance)
   string body = "{\"token\":" + JStr(g_token)
      + ",\"login\":" + JStr(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)))
      + ",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)
      + ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)
      + ",\"lock\":" + JStr(lockTxt) + ",\"losers\":" + IntegerToString(dLos) + ",\"maxl\":" + IntegerToString(MaxLosersPerDay)
      + ",\"left\":" + DoubleToString(leftUsd, 2) + ",\"open\":[" + opn + "],\"events\":[" + g_evs + "]"
      + (g_set != "" ? ",\"set\":" + g_set : "")
      + (g_hor != "" ? ",\"hor\":" + g_hor : "")
      + ",\"trades\":[" + items + "]}";
   string evsEnviados = g_evs;
   string setEnviado = g_set;
   string horEnviado = g_hor;
   char data[], res[];
   string rh;
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   int code = WebRequest("POST", SyncURL, "Content-Type: application/json\r\n", 8000, data, res, rh);
   if(code == -1)
      g_sync = "Sync: permite " + SyncURL + " en Opciones > Asesores Expertos";
   else if(code == 200)
   {
      for(int q = 0; q < ns; q++) GlobalVariableSet(P + "SENT_" + (string)sentIds[q], 1);
      if(g_evs == evsEnviados) g_evs = "";
      // reglas vivas que manda VICTOR: "cfg":"K=V;K=V"
      string resp = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
      int c0 = StringFind(resp, "\"cfg\":\"");
      if(c0 >= 0)
      {
         c0 += 7;
         int c1 = StringFind(resp, "\"", c0);
         if(c1 > c0) ApplyCfg(StringSubstr(resp, c0, c1 - c0));
      }
      // 4.0: respuesta a las reglas que cambiaste en el panel
      if(setEnviado != "" || horEnviado != "")
      {
         if(setEnviado != "" && g_set == setEnviado) g_set = "";
         if(horEnviado != "" && g_hor == horEnviado) g_hor = "";
         string sm = JGet(resp, "setmsg");
         if(sm == "") sm = "Reglas enviadas a VICTOR.";
         Alert("VictorGuard: ", sm);
         if(g_reglasAbiertas) { ReglasCerrar(); ReglasAbrir(); }
         if(g_horAbierto) { HorarioCerrar(); HorarioAbrir(); }
         ReglasMsg(sm);
      }
      g_sync = "Sync OK " + TimeToString(TimeLocal(), TIME_MINUTES) + " (" + IntegerToString(ns) + " nuevos)";
   }
   else if(code == 409)
   {
      // el codigo es de OTRA cuenta de MT5 (ej. el de la real puesto en la demo)
      g_sync = "Este codigo es de otra cuenta de MT5";
      if(SyncToken == "") { FileDelete(TokenFile(), FILE_COMMON); g_token = ""; g_lastPair = 0; }
      else Alert("VictorGuard: el SyncToken de Entradas es de otra cuenta. Borralo y conecta con el codigo de 6 digitos.");
   }
   else if(code == 401 && SyncToken == "")
   {
      // el codigo guardado ya no sirve (se desactivo en VICTOR): pedir uno nuevo
      FileDelete(TokenFile(), FILE_COMMON);
      g_token = "";
      g_lastPair = 0;
      g_sync = "Vuelve a conectar con VICTOR";
   }
   else
      g_sync = "Sync error HTTP " + IntegerToString(code);
   ObjectSetString(0, P + "SY", OBJPROP_TEXT, g_sync);
}

int OnInit()
{
   RiskMoney = InRiskMoney; RiskPercent = InRiskPercent; MaxLosersPerDay = InMaxLosersPerDay;
   MaxDailyLossPct = InMaxDailyLossPct; MaxDailyLossUSD = InMaxDailyLossUSD; MinEquityPct = InMinEquityPct;
   MinEquityUSD = InMinEquityUSD; MaxOpenPositions = InMaxOpenPositions; MaxTradesPerDay = InMaxTradesPerDay;
   CooldownMin = InCooldownMin;
   AllowedSymbols = InAllowedSymbols; BlockedSymbols = InBlockedSymbols; SLMode = InSLMode;
   SLPips = InSLPips; PipSize = InPipSize; PipSymbol = InPipSymbol; SLPercent = InSLPercent;
   ATRMult = InATRMult; ATRTF = InATRTF; RewardRatio = InRewardRatio; LockSLTP = InLockSLTP;
   FlexibleLock = InFlexibleLock; BlockOnManualClose = InBlockOnManualClose;
   long lg = AccountInfoInteger(ACCOUNT_LOGIN);
   if(lg != g_login) { g_cfgOk = false; g_cfgLast = ""; g_login = lg; }   // cambio de cuenta: reglas de esta cuenta
   g_token = (SyncToken != "") ? SyncToken : (lg > 0 ? FileTxt(TokenFile()) : "");
   g_codigo = "";
   g_lastTry = 0;
   g_lastPair = 0;
   ApplyCfg(CFG0);   // horario, dias, pausas y noticias con que se descargo (luego llegan al sincronizar)
   // Las Entradas de arriba son solo valores de arranque: si ya habian llegado TUS reglas
   // (en esta sesion o guardadas en disco para esta cuenta) se vuelven a aplicar al
   // instante, asi cambiar de grafico, de temporalidad o reiniciar MT5 no las pierde.
   string cache = (g_cfgLast != "") ? g_cfgLast : (lg > 0 ? FileTxt(CfgFile()) : "");
   if(cache != "") ApplyCfg(cache);
   trade.SetDeviationInPoints(DeviationPts);
   ParseSymbols();
   ParseBlocked();
   if(SLMode == SL_PIPS && SLPips * PipSize <= 0) { Alert("VictorGuard: SLPips y PipSize deben ser mayores que 0"); return INIT_PARAMETERS_INCORRECT; }
   if(SLMode == SL_ATR && ATRMult <= 0)           { Alert("VictorGuard: ATRMult debe ser mayor que 0"); return INIT_PARAMETERS_INCORRECT; }
   if(SLPercent <= 0)                              { Alert("VictorGuard: SLPercent debe ser mayor que 0"); return INIT_PARAMETERS_INCORRECT; }
   PrepAtr();
   hMA = iMA(_Symbol, MaTF, MaPeriod, 0, MaMethod, PRICE_CLOSE);
   MakeButton(P + "SELL", "VENDER",  10, 30, clrFireBrick);   // mismo orden que MT5: vender a la izquierda
   MakeButton(P + "BUY",  "COMPRAR", 130, 30, clrSeaGreen);
   MakeButton(P + "BRG",  "Reglas", 250, 30, C'40,90,160');
   MakeButton(P + "BHO",  "Horario", 370, 30, C'40,90,160');
   // linea de Stop Loss (si cambiaste de temporalidad, sigue a la misma distancia)
   if(GlobalVariableCheck(GvLinea())) { g_slOff = GlobalVariableGet(GvLinea()); GlobalVariableDel(GvLinea()); LineaSeguir(); }
   else LineaReglas();
   ObjectCreate(0, P + "ST", OBJ_LABEL, 0, 0, 0);
   ObjectSetString(0, P + "ST", OBJPROP_TEXT, " ");
   ObjectSetInteger(0, P + "ST", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "ST", OBJPROP_YDISTANCE, 70);
   ObjectSetInteger(0, P + "ST", OBJPROP_COLOR, clrOrange);
   ObjectSetInteger(0, P + "ST", OBJPROP_FONTSIZE, 10);
   ObjectCreate(0, P + "LT", OBJ_LABEL, 0, 0, 0);
   ObjectSetString(0, P + "LT", OBJPROP_TEXT, " ");
   ObjectSetInteger(0, P + "LT", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "LT", OBJPROP_YDISTANCE, 88);
   ObjectSetInteger(0, P + "LT", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "LT", OBJPROP_FONTSIZE, 10);
   ObjectCreate(0, P + "TM", OBJ_LABEL, 0, 0, 0);
   ObjectSetString(0, P + "TM", OBJPROP_TEXT, " ");
   // cierre de la vela abajo a la derecha
   ObjectSetInteger(0, P + "TM", OBJPROP_CORNER, CORNER_RIGHT_LOWER);
   ObjectSetInteger(0, P + "TM", OBJPROP_ANCHOR, ANCHOR_RIGHT_LOWER);
   ObjectSetInteger(0, P + "TM", OBJPROP_XDISTANCE, 15);
   ObjectSetInteger(0, P + "TM", OBJPROP_YDISTANCE, 15);
   ObjectSetInteger(0, P + "TM", OBJPROP_COLOR, clrDodgerBlue);
   ObjectSetString(0, P + "TM", OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, P + "TM", OBJPROP_FONTSIZE, 12);
   ObjectCreate(0, P + "SY", OBJ_LABEL, 0, 0, 0);
   ObjectSetString(0, P + "SY", OBJPROP_TEXT, " ");
   ObjectSetInteger(0, P + "SY", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "SY", OBJPROP_YDISTANCE, 110);
   ObjectSetInteger(0, P + "SY", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "SY", OBJPROP_FONTSIZE, 9);
   ObjectCreate(0, P + "PL", OBJ_LABEL, 0, 0, 0);
   ObjectSetString(0, P + "PL", OBJPROP_TEXT, " ");
   ObjectSetInteger(0, P + "PL", OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, P + "PL", OBJPROP_YDISTANCE, 133);
   ObjectSetInteger(0, P + "PL", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, P + "PL", OBJPROP_FONTSIZE, 13);
   EventSetTimer(1);
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(reason == REASON_CHARTCHANGE && g_slOff != 0) GlobalVariableSet(GvLinea(), g_slOff);
   g_reglasAbiertas = false;
   g_horAbierto = false;
   if(hMA != INVALID_HANDLE) IndicatorRelease(hMA);
   for(int i = 0; i < ArraySize(g_atrH); i++) if(g_atrH[i] != INVALID_HANDLE) IndicatorRelease(g_atrH[i]);
   ArrayResize(g_atrSym, 0); ArrayResize(g_atrH, 0);
   ObjectsDeleteAll(0, P);
}

void OnTimer()  { Guard(); GuardOrders(); UpdatePanel(); PairTick(); SyncTick(); }
void OnTick()   { Guard(); GuardOrders(); AutoEntryCheck(); LineaSeguir(); }

void OnChartEvent(const int id, const long &lp, const double &dp, const string &sp)
{
   if(id == CHARTEVENT_OBJECT_DRAG && sp == P + "SLL") { LineaSoltada(); UpdatePanel(); return; }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && StringFind(sp, P + "RE") == 0) { ReglasPie(); return; }
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sp == P + "BRG") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); if(g_reglasAbiertas) ReglasCerrar(); else ReglasAbrir(); return; }
   if(sp == P + "RX")  { ReglasCerrar(); return; }
   if(sp == P + "RSV") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); ReglasGuardar(); return; }
   if(sp == P + "BHO") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); if(g_horAbierto) HorarioCerrar(); else HorarioAbrir(); return; }
   if(sp == P + "HX")  { HorarioCerrar(); return; }
   if(sp == P + "HSV") { ObjectSetInteger(0, sp, OBJPROP_STATE, false); HorarioGuardar(); return; }
   if(StringFind(sp, P + "HS") == 0 || StringFind(sp, P + "HD") == 0)
   {
      bool on = (bool)ObjectGetInteger(0, sp, OBJPROP_STATE);
      ObjectSetInteger(0, sp, OBJPROP_BGCOLOR, on ? C'31,157,116' : C'50,55,65');
      ChartRedraw();
      return;
   }
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
