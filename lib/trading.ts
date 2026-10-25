// Módulo Trading (oct 2026) — organizador del "negocio de trading". No da
// señales ni consejos: solo lee el reporte del usuario, calcula métricas y
// marca qué reglas de riesgo (las que él mismo definió) se rompieron.
// Funciones puras, sin red ni base de datos.

export type Trade = {
  ticket: string;
  simbolo: string;
  lado: "buy" | "sell";
  volumen: number;
  hora_apertura: string; // "YYYY-MM-DD HH:MM:SS" (hora del servidor del broker)
  precio_apertura: number | null;
  sl: number | null;
  tp: number | null;
  hora_cierre: string | null;
  precio_cierre: number | null;
  comision: number;
  swap: number;
  ganancia: number;
};

export type ReglasRiesgo = {
  riesgo_por_trade_pct: number;
  max_perdedores_dia: number;
  perdida_max_dia_pct: number;
  max_trades_dia: number;
  espera_tras_perdida_min: number;
  duracion_min_seg: number;
  sl_obligatorio: boolean;
};

export const REGLAS_POR_DEFECTO: ReglasRiesgo = {
  riesgo_por_trade_pct: 3,
  max_perdedores_dia: 3,
  perdida_max_dia_pct: 9,
  max_trades_dia: 6,
  espera_tras_perdida_min: 30,
  duracion_min_seg: 300,
  sl_obligatorio: true,
};

// ---------- Lector del reporte MT5 (Excel exportado: Historial → Reporte) ----------

export type ReporteMT5 = {
  cuenta: string | null; // número
  descripcion: string | null; // "60348215 (USD, Axi-US52-Live, real, Hedge)"
  broker: string | null;
  tipo: "demo" | "real" | null;
  trades: Trade[];
};

const RE_FECHA = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}(:\d{2})?$/;

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fechaISO(v: unknown): string {
  // "2026.07.27 22:01:38" -> "2026-07-27 22:01:38"
  return String(v).trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
}

/** `filas` = hoja convertida a matriz (xlsx: sheet_to_json con header:1, raw:true). */
export function leerReporteMT5(filas: unknown[][]): ReporteMT5 {
  const out: ReporteMT5 = { cuenta: null, descripcion: null, broker: null, tipo: null, trades: [] };
  let enPosiciones = false;
  for (const fila of filas) {
    const celdas = (fila ?? []).filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (celdas.length === 0) continue;
    const primera = String(celdas[0]).trim();

    if (primera === "Account:" && celdas[1]) {
      const d = String(celdas[1]);
      out.descripcion = d;
      out.cuenta = d.match(/^\d+/)?.[0] ?? null;
      const partes = d.match(/\(([^)]*)\)/)?.[1]?.split(",").map((s) => s.trim()) ?? [];
      out.broker = partes[1] ?? null;
      const t = partes.find((p) => /^(real|demo|contest)$/i.test(p))?.toLowerCase();
      out.tipo = t === "real" ? "real" : t ? "demo" : null;
      continue;
    }
    if (primera === "Positions") {
      enPosiciones = true;
      continue;
    }
    if (!enPosiciones) continue;
    if (primera === "Time") continue; // encabezado de columnas
    if (!RE_FECHA.test(primera)) {
      // llegó otra sección (Orders, Deals, Summary...)
      if (/^(Orders|Deals|Results|Summary)/i.test(primera)) break;
      continue;
    }
    // Time, Position, Symbol, Type, Volume, Price, S/L, T/P, Time, Price, Commission, Swap, Profit
    // Posiciones fijas: S/L y T/P pueden venir vacíos, así que no se usan las celdas filtradas.
    const c = Array.from({ length: 13 }, (_, i) => (fila ?? [])[i]);
    const lado = String(c[3]).toLowerCase();
    if (lado !== "buy" && lado !== "sell") continue; // saltar balance/depósitos
    const sl = num(c[6]);
    const tp = num(c[7]);
    out.trades.push({
      ticket: String(c[1]),
      simbolo: String(c[2]),
      lado,
      volumen: num(c[4]),
      hora_apertura: fechaISO(c[0]),
      precio_apertura: num(c[5]),
      sl: sl > 0 ? sl : null,
      tp: tp > 0 ? tp : null,
      hora_cierre: RE_FECHA.test(String(c[8] ?? "").trim()) ? fechaISO(c[8]) : null,
      precio_cierre: num(c[9]),
      comision: num(c[10]),
      swap: num(c[11]),
      ganancia: num(c[12]),
    });
  }
  return out;
}

// ---------- Calculadora de lote ----------

// Unidades por 1.00 lote para los instrumentos más comunes. Si el símbolo no
// está, la calculadora pide el valor del contrato (lo da el broker).
export const CONTRATO_POR_LOTE: Record<string, number> = {
  XAUUSD: 100, // onzas
  XAGUSD: 5000,
  EURUSD: 100000,
  GBPUSD: 100000,
  AUDUSD: 100000,
  NZDUSD: 100000,
  BTCUSD: 1,
  ETHUSD: 1,
  NAS100: 1,
  US100: 1,
  US30: 1,
  US500: 1,
};

export function contratoDe(simbolo: string): number | null {
  const base = simbolo.toUpperCase().replace(/[^A-Z0-9].*$/, "");
  return CONTRATO_POR_LOTE[base] ?? null;
}

export type ResultadoLote = {
  riesgoUSD: number; // dinero máximo que acepta perder
  lote: number; // redondeado hacia abajo al paso
  loteMinimoExcede: boolean; // el lote mínimo ya arriesga más de lo permitido
  riesgoConLoteMinimo: number;
};

export function calcularLote(opts: {
  balance: number;
  riesgoPct: number;
  distanciaSL: number; // en unidades de precio (ej. 6.00 en oro)
  contrato: number; // unidades por 1 lote
  loteMin?: number;
  paso?: number;
}): ResultadoLote {
  const { balance, riesgoPct, distanciaSL, contrato } = opts;
  const loteMin = opts.loteMin ?? 0.01;
  const paso = opts.paso ?? 0.01;
  const riesgoUSD = (balance * riesgoPct) / 100;
  const perdidaPorLote = distanciaSL * contrato;
  if (!(perdidaPorLote > 0)) return { riesgoUSD, lote: 0, loteMinimoExcede: false, riesgoConLoteMinimo: 0 };
  const bruto = riesgoUSD / perdidaPorLote;
  const lote = Math.floor(bruto / paso + 1e-9) * paso;
  const riesgoConLoteMinimo = loteMin * perdidaPorLote;
  return {
    riesgoUSD,
    lote: Math.round(lote * 1e6) / 1e6,
    loteMinimoExcede: lote < loteMin,
    riesgoConLoteMinimo,
  };
}

// ---------- Control de cumplimiento ----------

export type Regla = "sin_sl" | "riesgo_alto" | "muy_corto" | "revancha" | "exceso_trades" | "limite_perdedores" | "limite_diario";

export const NOMBRE_REGLA: Record<Regla, string> = {
  sin_sl: "Sin stop loss",
  riesgo_alto: "Riesgo por encima del plan",
  muy_corto: "Cerrado muy rápido",
  revancha: "Entrada de revancha",
  exceso_trades: "Demasiados trades en el día",
  limite_perdedores: "Operó tras llegar al máximo de perdedores",
  limite_diario: "Operó tras pasar la pérdida máxima del día",
};

export type TradeEvaluado = Trade & { neto: number; violaciones: Regla[]; duracionSeg: number };

function ms(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

const neto = (t: Trade) => t.ganancia + t.comision + t.swap;

export function evaluarCumplimiento(trades: Trade[], reglas: ReglasRiesgo, balanceInicial: number): TradeEvaluado[] {
  const orden = [...trades].sort((a, b) => ms(a.hora_apertura) - ms(b.hora_apertura));
  const lista: TradeEvaluado[] = [];
  let balance = balanceInicial;
  // Acumulados del día (por fecha de apertura) y último cierre perdedor.
  const dia: Record<string, { n: number; perd: number; pl: number; balanceInicioDia: number }> = {};
  let ultimaPerdidaCierre: number | null = null;
  const cierres: { t: number; neto: number }[] = [];

  for (const t of orden) {
    const abre = ms(t.hora_apertura);
    const cierra = t.hora_cierre ? ms(t.hora_cierre) : abre;
    const k = t.hora_apertura.slice(0, 10);
    const d = (dia[k] ??= { n: 0, perd: 0, pl: 0, balanceInicioDia: balance });

    // Resultados ya cerrados antes de abrir este trade
    d.perd = 0;
    d.pl = 0;
    for (const c of cierres) {
      if (c.t <= abre && new Date(c.t).toISOString().slice(0, 10) === k) {
        d.pl += c.neto;
        if (c.neto < 0) d.perd += 1;
      }
    }
    ultimaPerdidaCierre = null;
    for (const c of cierres) if (c.t <= abre && c.neto < 0) ultimaPerdidaCierre = Math.max(ultimaPerdidaCierre ?? 0, c.t);

    const v: Regla[] = [];
    if (reglas.sl_obligatorio && !t.sl) v.push("sin_sl");

    const contrato = contratoDe(t.simbolo);
    if (t.sl && t.precio_apertura && contrato) {
      const riesgo = Math.abs(t.precio_apertura - t.sl) * contrato * t.volumen;
      if (riesgo > (balance * reglas.riesgo_por_trade_pct) / 100 + 0.005) v.push("riesgo_alto");
    }
    const dur = Math.max(0, Math.round((cierra - abre) / 1000));
    if (t.hora_cierre && dur < reglas.duracion_min_seg) v.push("muy_corto");

    if (
      ultimaPerdidaCierre !== null &&
      reglas.espera_tras_perdida_min > 0 &&
      abre - ultimaPerdidaCierre < reglas.espera_tras_perdida_min * 60000 &&
      abre >= ultimaPerdidaCierre
    )
      v.push("revancha");

    if (d.n >= reglas.max_trades_dia) v.push("exceso_trades");
    if (d.perd >= reglas.max_perdedores_dia) v.push("limite_perdedores");
    if (d.pl < 0 && (-d.pl / d.balanceInicioDia) * 100 >= reglas.perdida_max_dia_pct) v.push("limite_diario");

    d.n += 1;
    const n = neto(t);
    cierres.push({ t: cierra, neto: n });
    balance += n;
    lista.push({ ...t, neto: n, violaciones: v, duracionSeg: dur });
  }
  return lista;
}

// ---------- Métricas ----------

export type Metricas = {
  trades: number;
  neto: number;
  ganados: number;
  perdidos: number;
  winRate: number; // 0-100
  profitFactor: number | null;
  promedioGanado: number;
  promedioPerdido: number;
  expectativa: number; // neto promedio por trade
  caidaMaxima: number; // en dólares
  caidaMaximaPct: number;
  rachaPerdedoraMax: number;
  disciplina: number; // % de trades sin reglas rotas
  reglasRotas: Record<Regla, number>;
};

export function calcularMetricas(evaluados: TradeEvaluado[], balanceInicial: number): Metricas {
  const porCierre = [...evaluados].sort((a, b) => ms(a.hora_cierre ?? a.hora_apertura) - ms(b.hora_cierre ?? b.hora_apertura));
  let bruto = 0,
    perdidoBruto = 0,
    ganados = 0,
    perdidos = 0,
    racha = 0,
    rachaMax = 0,
    saldo = balanceInicial,
    pico = balanceInicial,
    dd = 0,
    ddPct = 0;
  const reglasRotas = Object.fromEntries((Object.keys(NOMBRE_REGLA) as Regla[]).map((r) => [r, 0])) as Record<Regla, number>;
  let limpios = 0;

  for (const t of porCierre) {
    if (t.neto > 0) {
      ganados++;
      bruto += t.neto;
      racha = 0;
    } else if (t.neto < 0) {
      perdidos++;
      perdidoBruto += -t.neto;
      racha++;
      rachaMax = Math.max(rachaMax, racha);
    }
    saldo += t.neto;
    pico = Math.max(pico, saldo);
    const caida = pico - saldo;
    if (caida > dd) {
      dd = caida;
      ddPct = pico > 0 ? (caida / pico) * 100 : 0;
    }
    if (t.violaciones.length === 0) limpios++;
    for (const r of t.violaciones) reglasRotas[r]++;
  }
  const n = evaluados.length;
  const netoTotal = evaluados.reduce((s, t) => s + t.neto, 0);
  return {
    trades: n,
    neto: netoTotal,
    ganados,
    perdidos,
    winRate: n ? (ganados / n) * 100 : 0,
    profitFactor: perdidoBruto > 0 ? bruto / perdidoBruto : bruto > 0 ? null : 0,
    promedioGanado: ganados ? bruto / ganados : 0,
    promedioPerdido: perdidos ? -perdidoBruto / perdidos : 0,
    expectativa: n ? netoTotal / n : 0,
    caidaMaxima: dd,
    caidaMaximaPct: ddPct,
    rachaPerdedoraMax: rachaMax,
    disciplina: n ? (limpios / n) * 100 : 0,
    reglasRotas,
  };
}

// ---------- Para el panel (gráficos) ----------

export type DiaResumen = { fecha: string; neto: number; trades: number };

/** Resultado por día (fecha de cierre, hora del broker). */
export function resultadosPorDia(evaluados: TradeEvaluado[]): Record<string, DiaResumen> {
  const out: Record<string, DiaResumen> = {};
  for (const t of evaluados) {
    const f = (t.hora_cierre ?? t.hora_apertura).slice(0, 10);
    const d = (out[f] ??= { fecha: f, neto: 0, trades: 0 });
    d.neto += t.neto;
    d.trades += 1;
  }
  return out;
}

export function curvaCapital(evaluados: TradeEvaluado[], balanceInicial: number): { fecha: string; saldo: number }[] {
  const orden = [...evaluados].sort((a, b) => ms(a.hora_cierre ?? a.hora_apertura) - ms(b.hora_cierre ?? b.hora_apertura));
  let saldo = balanceInicial;
  const serie = [{ fecha: orden[0] ? (orden[0].hora_cierre ?? orden[0].hora_apertura).slice(0, 10) : "", saldo }];
  for (const t of orden) {
    saldo += t.neto;
    serie.push({ fecha: (t.hora_cierre ?? t.hora_apertura).slice(0, 10), saldo });
  }
  return serie;
}

/** Seis ejes de 0 a 100 para el radar y el puntaje general. */
export function puntajeRadar(m: Metricas, dias: Record<string, DiaResumen>): { etiqueta: string; valor: number }[] {
  const lista = Object.values(dias);
  const diasPos = lista.length ? (lista.filter((d) => d.neto > 0).length / lista.length) * 100 : 0;
  const pf = m.profitFactor === null ? 2 : m.profitFactor;
  const rr = m.promedioPerdido !== 0 ? Math.abs(m.promedioGanado / m.promedioPerdido) : m.promedioGanado > 0 ? 2 : 0;
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  return [
    { etiqueta: "Aciertos", valor: clamp(m.winRate) },
    { etiqueta: "Factor beneficio", valor: clamp((pf / 2) * 100) },
    { etiqueta: "Ganado/perdido", valor: clamp((rr / 2) * 100) },
    { etiqueta: "Disciplina", valor: clamp(m.disciplina) },
    { etiqueta: "Caída máx.", valor: clamp(100 - m.caidaMaximaPct) },
    { etiqueta: "Consistencia", valor: clamp(diasPos) },
  ];
}

/** Compara los trades que cumplieron todas las reglas contra los que rompieron alguna. */
export function impactoReglas(evaluados: TradeEvaluado[]) {
  const limpios = evaluados.filter((t) => t.violaciones.length === 0);
  const rotos = evaluados.filter((t) => t.violaciones.length > 0);
  const suma = (l: TradeEvaluado[]) => l.reduce((s, t) => s + t.neto, 0);
  return { limpios: { n: limpios.length, neto: suma(limpios) }, rotos: { n: rotos.length, neto: suma(rotos) } };
}
