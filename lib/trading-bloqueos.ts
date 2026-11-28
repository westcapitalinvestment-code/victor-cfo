// Bloqueos del guardián por horario, sesión, día, fechas y noticias (22 nov 2026,
// pedido de Joel). Funciones puras: las usan la web, el chat y /api/trading/sync.
//
// - Las HORAS y FECHAS están en la zona horaria de la persona (zona_horaria).
// - Las SESIONES son del mercado (Tokio, Londres, Nueva York) y se convierten solas,
//   incluido el cambio de horario de verano de Londres y Nueva York.
// - El guardián (MQL5) no sabe de zonas horarias: recibe una plantilla semanal de
//   minutos bloqueados en UTC (0 = domingo 00:00 UTC … 10079) y las pausas en
//   segundos UTC. VICTOR la recalcula en cada sincronización (~30 s).

export type Ventana = { ini: string; fin: string }; // "HH:MM" hora local
export type Pausa = { desde: string; hasta: string; motivo?: string }; // YYYY-MM-DD locales, ambas incluidas
export type Sesion = "asia" | "londres" | "solape" | "nueva_york";

export type Bloqueos = {
  zona: string;
  ventanas: Ventana[];
  sesiones: Sesion[];
  dias: number[]; // 0 = domingo … 6 = sábado (hora local)
  pausas: Pausa[];
  noticiasMin: number; // 0 = apagado
};

export const BLOQUEOS_VACIOS: Bloqueos = { zona: "America/Puerto_Rico", ventanas: [], sesiones: [], dias: [], pausas: [], noticiasMin: 0 };

export const SESIONES: Record<Sesion, { nombre: string; corto: string; detalle: string }> = {
  asia: { nombre: "Asia (Tokio)", corto: "Asia", detalle: "9:00 am – 6:00 pm hora de Tokio" },
  londres: { nombre: "Londres", corto: "Londres", detalle: "8:00 am – 5:00 pm hora de Londres" },
  solape: { nombre: "Londres + Nueva York", corto: "Londres+NY", detalle: "cuando las dos están abiertas: 8:00 am – 12:00 pm hora de Nueva York" },
  nueva_york: { nombre: "Nueva York", corto: "Nueva York", detalle: "8:00 am – 5:00 pm hora de Nueva York" },
};
const SESION_DEF: Record<Exclude<Sesion, "solape">, { tz: string; ini: number; fin: number }> = {
  asia: { tz: "Asia/Tokyo", ini: 9 * 60, fin: 18 * 60 },
  londres: { tz: "Europe/London", ini: 8 * 60, fin: 17 * 60 },
  nueva_york: { tz: "America/New_York", ini: 8 * 60, fin: 17 * 60 },
};
export const TODAS_SESIONES: Sesion[] = ["asia", "londres", "solape", "nueva_york"];

export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Zonas comunes del público de VICTOR (se puede guardar cualquier zona IANA válida).
export const ZONAS_COMUNES: { tz: string; nombre: string }[] = [
  { tz: "America/Puerto_Rico", nombre: "Puerto Rico / Rep. Dominicana" },
  { tz: "America/New_York", nombre: "Florida / Nueva York (Este EE.UU.)" },
  { tz: "America/Chicago", nombre: "Texas / Chicago (Centro EE.UU.)" },
  { tz: "America/Los_Angeles", nombre: "California (Pacífico EE.UU.)" },
  { tz: "America/Mexico_City", nombre: "México (Centro)" },
  { tz: "America/Bogota", nombre: "Colombia / Perú / Ecuador / Panamá" },
  { tz: "America/Caracas", nombre: "Venezuela / Bolivia" },
  { tz: "America/Santiago", nombre: "Chile" },
  { tz: "America/Argentina/Buenos_Aires", nombre: "Argentina / Uruguay" },
  { tz: "America/Guatemala", nombre: "Centroamérica" },
  { tz: "Europe/Madrid", nombre: "España" },
];

export const nombreZona = (tz: string) => ZONAS_COMUNES.find((z) => z.tz === tz)?.nombre.split(" / ")[0] ?? tz.split("/").pop()!.replace(/_/g, " ");

// ---------- Validación ----------
export function zonaValida(tz: unknown): string {
  if (typeof tz !== "string" || !tz || tz.length > 60) return BLOQUEOS_VACIOS.zona;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return BLOQUEOS_VACIOS.zona;
  }
}
const RE_HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const RE_F = /^\d{4}-\d{2}-\d{2}$/;
export const aMin = (hm: string) => {
  const m = RE_HM.exec(hm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};
export const aHM = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export function hora12(hm: string): string {
  const m = aMin(hm);
  if (m < 0) return hm;
  const h = Math.floor(m / 60), mi = m % 60;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${ap}`;
}

export function normalizarBloqueos(x: Partial<Record<string, unknown>> | null | undefined): Bloqueos {
  const r = (x ?? {}) as Record<string, unknown>;
  const ventanas = (Array.isArray(r.horario_ventanas ?? r.ventanas) ? ((r.horario_ventanas ?? r.ventanas) as unknown[]) : [])
    .map((v) => v as Record<string, unknown>)
    .filter((v) => typeof v?.ini === "string" && typeof v?.fin === "string" && aMin(v.ini as string) >= 0 && aMin(v.fin as string) >= 0 && v.ini !== v.fin)
    .slice(0, 4)
    .map((v) => ({ ini: aHM(aMin(v.ini as string)), fin: aHM(aMin(v.fin as string)) }));
  const sesiones = (Array.isArray(r.horario_sesiones ?? r.sesiones) ? ((r.horario_sesiones ?? r.sesiones) as unknown[]) : []).filter((s): s is Sesion =>
    TODAS_SESIONES.includes(s as Sesion)
  );
  const dias = [...new Set((Array.isArray(r.dias_bloqueados ?? r.dias) ? ((r.dias_bloqueados ?? r.dias) as unknown[]) : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const pausas = (Array.isArray(r.pausas) ? (r.pausas as unknown[]) : [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p?.desde === "string" && typeof p?.hasta === "string" && RE_F.test(p.desde as string) && RE_F.test(p.hasta as string))
    .map((p) => {
      const d = p.desde as string, h = p.hasta as string;
      const motivo = typeof p.motivo === "string" ? p.motivo.trim().slice(0, 60) : "";
      return { desde: d <= h ? d : h, hasta: d <= h ? h : d, ...(motivo ? { motivo } : {}) };
    })
    .slice(0, 20);
  const nm = Math.round(Number(r.noticias_min ?? r.noticiasMin ?? 0));
  return {
    zona: zonaValida(r.zona_horaria ?? r.zona),
    ventanas,
    sesiones: [...new Set(sesiones)],
    dias,
    pausas,
    noticiasMin: Number.isFinite(nm) ? Math.min(120, Math.max(0, nm)) : 0,
  };
}

// Columnas de risk_rules
export function bloqueosAColumnas(b: Bloqueos) {
  return {
    zona_horaria: b.zona,
    horario_ventanas: b.ventanas,
    horario_sesiones: b.sesiones,
    dias_bloqueados: b.dias,
    pausas: b.pausas,
    noticias_min: b.noticiasMin,
  };
}

// ---------- Zonas horarias ----------
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}
// Minutos que hay que SUMAR a UTC para tener la hora local (PR = -240).
export function offsetMin(tz: string, t: number): number {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(t))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute);
  return Math.round((local - Math.floor(t / 60000) * 60000) / 60000);
}
// Fecha local YYYY-MM-DD
export function fechaLocal(tz: string, t: number): string {
  return new Date(t + offsetMin(tz, t) * 60000).toISOString().slice(0, 10);
}
// Instante UTC (ms) de una hora local (YYYY-MM-DD + minutos del día)
export function utcDeLocal(tz: string, fecha: string, minDia = 0): number {
  const base = Date.parse(fecha + "T00:00:00Z") + minDia * 60000;
  let t = base - offsetMin(tz, base) * 60000;
  t = base - offsetMin(tz, t) * 60000; // segunda pasada por si cruza un cambio de horario
  return t;
}

// ---------- ¿Se puede operar en este instante? ----------
type CacheOff = Map<string, number>;
function offHora(cache: CacheOff, tz: string, t: number) {
  const k = tz + "|" + Math.floor(t / 3600000);
  let o = cache.get(k);
  if (o === undefined) {
    o = offsetMin(tz, t);
    cache.set(k, o);
  }
  return o;
}
function localDe(cache: CacheOff, tz: string, t: number) {
  const d = new Date(t + offHora(cache, tz, t) * 60000);
  return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}
const enRango = (m: number, ini: number, fin: number) => (ini < fin ? m >= ini && m < fin : m >= ini || m < fin);

function sesionAbierta(cache: CacheOff, s: Sesion, t: number): boolean {
  if (s === "solape") return sesionAbierta(cache, "londres", t) && sesionAbierta(cache, "nueva_york", t);
  const d = SESION_DEF[s];
  const l = localDe(cache, d.tz, t);
  return l.dow >= 1 && l.dow <= 5 && enRango(l.min, d.ini, d.fin);
}

// Sin contar pausas por fecha (esas van aparte, como rangos absolutos).
function permitidoSemanal(cache: CacheOff, b: Bloqueos, t: number): boolean {
  const l = localDe(cache, b.zona, t);
  if (b.dias.includes(l.dow)) return false;
  if (!b.ventanas.length && !b.sesiones.length) return true;
  if (b.ventanas.some((v) => enRango(l.min, aMin(v.ini), aMin(v.fin)))) return true;
  return b.sesiones.some((s) => sesionAbierta(cache, s, t));
}

export function pausaEn(b: Bloqueos, t: number): Pausa | null {
  if (!b.pausas.length) return null;
  const f = fechaLocal(b.zona, t);
  return b.pausas.find((p) => f >= p.desde && f <= p.hasta) ?? null;
}

const SEMANA = 7 * 1440;
// Inicio (ms) de la semana UTC que contiene t: domingo 00:00 UTC
const inicioSemanaUTC = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay());
};

// Plantilla semanal: rangos [ini, fin) de minutos BLOQUEADOS desde domingo 00:00 UTC.
export function plantillaBloqueada(b: Bloqueos, ahora = Date.now()): [number, number][] {
  const cache: CacheOff = new Map();
  const base = inicioSemanaUTC(ahora);
  const out: [number, number][] = [];
  let ini = -1;
  for (let m = 0; m < SEMANA; m++) {
    const bloq = !permitidoSemanal(cache, b, base + m * 60000);
    if (bloq && ini < 0) ini = m;
    if (!bloq && ini >= 0) {
      out.push([ini, m]);
      ini = -1;
    }
  }
  if (ini >= 0) out.push([ini, SEMANA]);
  return out;
}
const minutosBloqueados = (b: Bloqueos, ahora: number) => {
  const s = new Uint8Array(SEMANA);
  for (const [i, f] of plantillaBloqueada(b, ahora)) s.fill(1, i, f);
  return s;
};

// Pausas como rangos absolutos en segundos UTC (solo las que no han terminado)
export function pausasUTC(b: Bloqueos, ahora = Date.now()): [number, number][] {
  return b.pausas
    .map((p) => {
      const fin = new Date(Date.parse(p.hasta + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
      return [Math.floor(utcDeLocal(b.zona, p.desde) / 1000), Math.floor(utcDeLocal(b.zona, fin) / 1000)] as [number, number];
    })
    .filter(([, f]) => f * 1000 > ahora)
    .sort((a, c) => a[0] - c[0])
    .slice(0, 20);
}

export type EstadoHorario = { permitido: boolean; motivo: string | null; cambiaA: number | null };
// Estado ahora mismo y cuándo cambia (para la web y el chat)
export function estadoHorario(b: Bloqueos, ahora = Date.now()): EstadoHorario {
  const p = pausaEn(b, ahora);
  if (p) {
    const fin = new Date(Date.parse(p.hasta + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    return { permitido: false, motivo: `pausa${p.motivo ? ` (${p.motivo})` : ""} hasta el ${p.hasta}`, cambiaA: utcDeLocal(b.zona, fin) };
  }
  const cache: CacheOff = new Map();
  const ok = permitidoSemanal(cache, b, ahora);
  const t0 = Math.floor(ahora / 60000) * 60000;
  for (let m = 1; m <= SEMANA; m++) {
    if (permitidoSemanal(cache, b, t0 + m * 60000) !== ok) {
      const l = localDe(cache, b.zona, t0);
      return { permitido: ok, motivo: ok ? null : b.dias.includes(l.dow) ? `hoy ${DIAS_SEMANA[l.dow]} es día bloqueado` : "fuera de tu horario", cambiaA: t0 + m * 60000 };
    }
  }
  return { permitido: ok, motivo: ok ? null : "todo el horario está bloqueado", cambiaA: null };
}

// Hora local legible: "lunes 8:00 am"
export function cuandoLocal(b: Bloqueos, t: number, ahora = Date.now()): string {
  const f = fechaLocal(b.zona, t);
  const d = new Date(t + offsetMin(b.zona, t) * 60000);
  const hm = hora12(aHM(d.getUTCHours() * 60 + d.getUTCMinutes()));
  if (f === fechaLocal(b.zona, ahora)) return `hoy ${hm}`;
  if (f === fechaLocal(b.zona, ahora + 86400000)) return `mañana ${hm}`;
  return `${DIAS_SEMANA[d.getUTCDay()]} ${hm}`;
}

export function hayBloqueos(b: Bloqueos): boolean {
  return b.ventanas.length > 0 || b.sesiones.length > 0 || b.dias.length > 0 || b.pausas.length > 0 || b.noticiasMin > 0;
}

// Texto para la web y para VICTOR
export function describirBloqueos(b: Bloqueos): string[] {
  const l: string[] = [];
  const partes: string[] = [];
  if (b.ventanas.length) partes.push(b.ventanas.map((v) => `${hora12(v.ini)} a ${hora12(v.fin)}`).join(" y "));
  if (b.sesiones.length) partes.push(`en la sesión de ${b.sesiones.map((s) => SESIONES[s].corto).join(" o ")}`);
  if (partes.length) l.push(`Solo opera ${partes.join(" o ")} (hora de ${nombreZona(b.zona)}).`);
  if (b.dias.length) l.push(`Días sin operar: ${b.dias.map((d) => DIAS_SEMANA[d]).join(", ")}.`);
  const hoy = fechaLocal(b.zona, Date.now());
  const futuras = b.pausas.filter((p) => p.hasta >= hoy);
  if (futuras.length) l.push(`Pausas: ${futuras.map((p) => `${p.desde} a ${p.hasta}${p.motivo ? ` (${p.motivo})` : ""}`).join("; ")}.`);
  if (b.noticiasMin > 0) l.push(`No abre trades ${b.noticiasMin} min antes y después de noticias de alto impacto de la moneda del activo.`);
  return l;
}

// Sin acentos ni ; = " para el guardián (MQL5 en ASCII)
const ascii = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 :.,()+/-]/g, "").slice(0, 120);

// ---------- Configuración que viaja al guardián ----------
export type FilaReglas = Record<string, unknown>;

export function riesgoFijoDe(r: FilaReglas): number {
  const dl = Number(r.guard_daily_loss_usd ?? 0) || 0;
  const mp = Number(r.max_perdedores_dia ?? 0) || 0;
  return dl > 0 && mp > 0 ? Math.floor((dl / mp) * 100) / 100 : 0;
}

// Símbolos para el guardián: "*" o vacío = todos; solo caracteres válidos en MT5.
function simbolosCfg(v: unknown, porDefecto: string): string {
  const t = String(v ?? porDefecto).toUpperCase().replace(/[^A-Z0-9._,#*-]/g, "").slice(0, 300);
  return !t || t.includes("*") ? "*" : t.split(",").filter(Boolean).join(",");
}
const MODO_STOP_CFG: Record<string, number> = { pips: 0, porcentaje: 1, atr: 2 };
const TF_CFG: Record<string, number> = { M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
const LOCK_CFG: Record<string, number> = { ninguno: 0, total: 1, flexible: 2 };

// "RM=7;RP=1;ML=3;...;BW=0-480,1020-1920;PZ=...;NW=15;TZO=-240;HL=..."
// demo: en cuentas demo no aplican días/horarios bloqueados, pausas ni la
// ventana de noticias (23 nov 2026), para poder practicar y probar el guardián
// cualquier día. Riesgo, stop, pérdida máxima y candados siguen igual.
export function cfgGuardian(r: FilaReglas, ahora = Date.now(), opciones: { demo?: boolean } = {}): string {
  const demo = opciones.demo === true;
  const b = normalizarBloqueos(r);
  const n = (v: unknown, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };
  const kv: [string, string | number][] = [
    ["RM", riesgoFijoDe(r)],
    ["RP", n(r.riesgo_por_trade_pct, 1)],
    ["ML", Math.max(1, Math.round(n(r.max_perdedores_dia, 3)))],
    ["DLP", n(r.perdida_max_dia_pct, 3)],
    ["DLU", n(r.guard_daily_loss_usd ?? 0, 0)],
    ["MEP", 80],
    ["MEU", n(r.guard_min_equity_usd ?? 0, 0)],
    ["MO", Math.max(1, Math.round(n(r.guard_max_open, 1)))],
    ["MT", Math.max(0, Math.round(n(r.max_trades_dia, 0)))],
    ["CD", Math.max(0, Math.round(n(r.espera_tras_perdida_min, 0)))],
    ["BW", demo ? "" : plantillaBloqueada(b, ahora).map(([i, f]) => `${i}-${f}`).join(",")],
    ["PZ", demo ? "" : pausasUTC(b, ahora).map(([i, f]) => `${i}-${f}`).join(",")],
    ["NW", demo ? 0 : b.noticiasMin],
    ["TZO", offsetMin(b.zona, ahora)],
    ["HL", demo ? "Demo: sin limite de horario" : ascii(describirBloqueos({ ...b, noticiasMin: 0, pausas: [] }).join(" ") || "Sin limite de horario")],
    // 4.1: el horario tal como está guardado, para el panel "Horario" del guardián
    // (en demo también, aunque en demo no bloquee).
    ["HS", b.sesiones.join(",")],
    ["HV", b.ventanas[0] ? `${b.ventanas[0].ini}-${b.ventanas[0].fin}` : ""],
    ["HD", b.dias.join(",")],
    ["NR", b.noticiasMin],
    ["PH", b.pausas.map((p) => p.hasta).filter((h) => h >= fechaLocal(b.zona, ahora)).sort().pop() ?? ""],
    ["ZN", ascii(nombreZona(b.zona))],
    // Ajustes del guardián (desde la 3.20 llegan por sincronización: el .ex5
    // precompilado es igual para todos y toma todo de aquí).
    ["AS", simbolosCfg(r.guard_symbol, "XAUUSD")],
    ["BS", simbolosCfg(r.guard_blocked_symbols, "").replace("*", "")],
    ["SM", MODO_STOP_CFG[String(r.guard_sl_mode ?? "atr")] ?? 2],
    ["SP", n(r.guard_sl_pips, 60)],
    ["PS", n(r.guard_pip_size, 0.1)],
    ["PY", simbolosCfg(r.guard_pip_symbol, "XAUUSD").split(",")[0].replace("*", "XAUUSD")],
    ["SC", n(r.guard_sl_pct, 0.5)],
    ["AM", n(r.guard_atr_mult, 1.5)],
    ["AT", TF_CFG[String(r.guard_atr_tf ?? "M15")] ?? 15],
    ["RR", n(r.guard_reward_ratio, 2)],
    ["LK", LOCK_CFG[String(r.guard_lock_mode ?? "flexible")] ?? 2],
    ["BM", r.guard_block_manual_close === false ? 0 : 1],
  ];
  return kv.map(([k, v]) => `${k}=${v}`).join(";");
}

// ---------- ¿El cambio aprieta o afloja? ----------
// Afloja = te deja operar más o arriesgar más. Eso aplica desde mañana (medianoche
// en tu hora), para que nadie se quite los frenos en caliente después de perder.
// Apretar aplica al instante.
export const ETIQUETA_CAMPO: Record<string, string> = {
  riesgo_por_trade_pct: "riesgo por trade (%)",
  max_perdedores_dia: "pérdidas permitidas al día",
  perdida_max_dia_pct: "pérdida máxima del día (%)",
  max_trades_dia: "trades al día",
  espera_tras_perdida_min: "espera después de perder",
  duracion_min_seg: "duración mínima del trade",
  sl_obligatorio: "stop obligatorio",
  guard_daily_loss_usd: "pérdida máxima del día ($)",
  guard_min_equity_usd: "piso de la cuenta ($)",
  guard_max_open: "trades abiertos a la vez",
  guard_reward_ratio: "TP (veces el riesgo)",
  guard_lock_mode: "bloqueo del stop",
  guard_block_manual_close: "bloqueo por cierre manual",
  guard_blocked_symbols: "activos prohibidos",
  guard_symbol: "activos permitidos",
  horario: "horario permitido",
  pausas: "pausas por fecha",
  noticias_min: "bloqueo por noticias",
};

type Dir = "sube_afloja" | "baja_afloja";
const NUMERICOS: Record<string, Dir> = {
  riesgo_por_trade_pct: "sube_afloja",
  max_perdedores_dia: "sube_afloja",
  perdida_max_dia_pct: "sube_afloja",
  espera_tras_perdida_min: "baja_afloja",
  duracion_min_seg: "baja_afloja",
  guard_max_open: "sube_afloja",
  noticias_min: "baja_afloja",
};
const num = (v: unknown, d: number) => (v === null || v === undefined || v === "" ? d : Number.isFinite(Number(v)) ? Number(v) : d);
const lista = (s: unknown) => new Set(String(s ?? "").toUpperCase().split(",").map((x) => x.trim()).filter(Boolean));
const CAMPOS_HORARIO = ["zona_horaria", "horario_ventanas", "horario_sesiones", "dias_bloqueados"];

export type Clasificacion = { aprieta: string[]; afloja: string[]; igual: string[] };

// Devuelve qué GRUPOS cambian y en qué sentido. Los grupos son los nombres de
// ETIQUETA_CAMPO ("horario" agrupa zona, ventanas, sesiones y días).
export function clasificarCambios(antes: FilaReglas, despues: FilaReglas, ahora = Date.now()): Clasificacion {
  const r: Clasificacion = { aprieta: [], afloja: [], igual: [] };
  const poner = (g: string, cambia: boolean, afloja: boolean) => (!cambia ? r.igual : afloja ? r.afloja : r.aprieta).push(g);

  for (const [k, dir] of Object.entries(NUMERICOS)) {
    if (!(k in despues)) continue;
    const a = num(antes[k], 0), d = num(despues[k], 0);
    poner(k, a !== d, dir === "sube_afloja" ? d > a : d < a);
  }
  if ("max_trades_dia" in despues) {
    const inf = (v: unknown) => (num(v, 0) <= 0 ? Infinity : num(v, 0)); // 0 = sin límite
    const a = inf(antes.max_trades_dia), d = inf(despues.max_trades_dia);
    poner("max_trades_dia", a !== d, d > a);
  }
  if ("guard_daily_loss_usd" in despues) {
    const inf = (v: unknown) => (num(v, 0) <= 0 ? Infinity : num(v, 0)); // vacío = usa el %
    const a = inf(antes.guard_daily_loss_usd), d = inf(despues.guard_daily_loss_usd);
    poner("guard_daily_loss_usd", a !== d, d > a);
  }
  if ("guard_min_equity_usd" in despues) {
    const a = num(antes.guard_min_equity_usd, 0), d = num(despues.guard_min_equity_usd, 0);
    poner("guard_min_equity_usd", a !== d, d < a);
  }
  for (const k of ["sl_obligatorio", "guard_block_manual_close"]) {
    if (!(k in despues)) continue;
    const a = antes[k] !== false, d = despues[k] !== false;
    poner(k, a !== d, a && !d);
  }
  if ("guard_lock_mode" in despues) {
    const orden = (v: unknown) => (v === "total" ? 0 : v === "ninguno" ? 2 : 1);
    const a = orden(antes.guard_lock_mode), d = orden(despues.guard_lock_mode);
    poner("guard_lock_mode", a !== d, d > a);
  }
  if ("guard_blocked_symbols" in despues) {
    const a = lista(antes.guard_blocked_symbols), d = lista(despues.guard_blocked_symbols);
    const quita = [...a].some((x) => !d.has(x));
    poner("guard_blocked_symbols", quita || [...d].some((x) => !a.has(x)), quita);
  }
  if ("guard_symbol" in despues) {
    const todos = (s: Set<string>) => s.size === 0 || s.has("*");
    const a = lista(antes.guard_symbol), d = lista(despues.guard_symbol);
    const cambia = [...a].sort().join() !== [...d].sort().join();
    const agrega = todos(d) ? !todos(a) : !todos(a) && [...d].some((x) => !a.has(x));
    poner("guard_symbol", cambia, agrega);
  }
  if (CAMPOS_HORARIO.some((k) => k in despues)) {
    const ba = normalizarBloqueos(antes), bd = normalizarBloqueos({ ...antes, ...despues });
    const ma = minutosBloqueados(ba, ahora), md = minutosBloqueados(bd, ahora);
    let cambia = false, abre = false;
    for (let i = 0; i < SEMANA; i++) {
      if (ma[i] !== md[i]) cambia = true;
      if (ma[i] && !md[i]) { abre = true; break; }
    }
    if (!cambia) cambia = ba.zona !== bd.zona || JSON.stringify([ba.ventanas, ba.sesiones, ba.dias]) !== JSON.stringify([bd.ventanas, bd.sesiones, bd.dias]);
    poner("horario", cambia, abre);
  }
  if ("pausas" in despues) {
    const ba = normalizarBloqueos(antes), bd = normalizarBloqueos({ ...antes, pausas: despues.pausas });
    const hoy = fechaLocal(ba.zona, ahora);
    const dias = (b: Bloqueos) => {
      const s = new Set<string>();
      for (const p of b.pausas) {
        let f = p.desde < hoy ? hoy : p.desde;
        for (let i = 0; f <= p.hasta && i < 400; i++) {
          s.add(f);
          f = new Date(Date.parse(f + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
        }
      }
      return s;
    };
    const a = dias(ba), d = dias(bd);
    const quita = [...a].some((x) => !d.has(x));
    poner("pausas", quita || [...d].some((x) => !a.has(x)), quita);
  }
  return r;
}

// Columnas de risk_rules que pertenecen a cada grupo
export function columnasDeGrupo(g: string): string[] {
  if (g === "horario") return CAMPOS_HORARIO;
  return [g];
}

// Sesión del mercado en un instante (para analizar resultados con las sesiones reales)
export function sesionDeInstante(t: number): string {
  const c: CacheOff = new Map();
  const lon = sesionAbierta(c, "londres", t);
  const ny = sesionAbierta(c, "nueva_york", t);
  if (lon && ny) return "Londres+NY";
  if (lon) return "Londres";
  if (ny) return "NY tarde";
  if (sesionAbierta(c, "asia", t)) return "Asia";
  return "Fuera de sesión";
}
