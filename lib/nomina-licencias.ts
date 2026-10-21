// Saldos de vacaciones y enfermedad (21 oct 2026). Funciones puras.
// Las reglas son del patrono (payroll_entity_config); si un campo está vacío se usa
// una sugerencia marcada "por confirmar" que debe validar el contable.
export const LIC_DEFAULTS = {
  vac_dias_mes: 1.25,
  vac_meses_espera: 0,
  vac_tope: 30,
  enf_dias_mes: 1,
  enf_meses_espera: 0,
  enf_tope: 15,
  horas_por_dia: 8,
};

export interface ReglasLic {
  vac_dias_mes: number;
  vac_meses_espera: number;
  vac_tope: number;
  enf_dias_mes: number;
  enf_meses_espera: number;
  enf_tope: number;
  horas_por_dia: number;
  porConfirmar: boolean;
}

export function reglasLic(cfg: Record<string, unknown> | null): ReglasLic {
  const g = (k: keyof typeof LIC_DEFAULTS) => (cfg && cfg[k] != null ? Number(cfg[k]) : LIC_DEFAULTS[k]);
  const campos: (keyof typeof LIC_DEFAULTS)[] = ["vac_dias_mes", "vac_tope", "enf_dias_mes", "enf_tope", "horas_por_dia"];
  return {
    vac_dias_mes: g("vac_dias_mes"),
    vac_meses_espera: g("vac_meses_espera"),
    vac_tope: g("vac_tope"),
    enf_dias_mes: g("enf_dias_mes"),
    enf_meses_espera: g("enf_meses_espera"),
    enf_tope: g("enf_tope"),
    horas_por_dia: g("horas_por_dia"),
    porConfirmar: campos.some((k) => !cfg || cfg[k] == null),
  };
}

const PERIODOS: Record<string, number> = { semanal: 52, bisemanal: 26, quincenal: 24, mensual: 12 };

// Pago de un día: por hora = tarifa × horas por día; salario = tarifa × períodos/año ÷ 260 días.
export function tarifaDiaria(emp: { tipo_pago: string; tarifa: number; frecuencia: string }, horasPorDia: number): number {
  const t = Number(emp.tarifa) || 0;
  const d = emp.tipo_pago === "hora" ? t * horasPorDia : (t * (PERIODOS[emp.frecuencia] ?? 26)) / 260;
  return Math.round(d * 100) / 100;
}

export interface MovLic {
  tipo: "vacaciones" | "enfermedad" | "ausencia";
  movimiento: "tomado" | "ajuste";
  dias: number;
}

export interface SaldoTipo {
  acumulado: number; // devengado por antigüedad (con tope)
  ajustes: number;
  tomados: number;
  saldo: number;
}

export function mesesTrabajados(fechaIngreso: string | null, hoy: Date = new Date()): number | null {
  if (!fechaIngreso) return null;
  const f = new Date(fechaIngreso + "T00:00:00");
  if (Number.isNaN(f.getTime())) return null;
  let m = (hoy.getFullYear() - f.getFullYear()) * 12 + (hoy.getMonth() - f.getMonth());
  if (hoy.getDate() < f.getDate()) m -= 1;
  return Math.max(0, m);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function saldoLic(
  tipo: "vacaciones" | "enfermedad",
  meses: number | null,
  movs: MovLic[],
  r: ReglasLic,
): SaldoTipo {
  const diasMes = tipo === "vacaciones" ? r.vac_dias_mes : r.enf_dias_mes;
  const espera = tipo === "vacaciones" ? r.vac_meses_espera : r.enf_meses_espera;
  const tope = tipo === "vacaciones" ? r.vac_tope : r.enf_tope;
  const dev = meses == null ? 0 : Math.max(0, meses - espera) * diasMes;
  const acumulado = r2(Math.min(tope, dev));
  let ajustes = 0;
  let tomados = 0;
  for (const m of movs) {
    if (m.tipo !== tipo) continue;
    if (m.movimiento === "ajuste") ajustes += Number(m.dias) || 0;
    else tomados += Number(m.dias) || 0;
  }
  return { acumulado, ajustes: r2(ajustes), tomados: r2(tomados), saldo: r2(acumulado + ajustes - tomados) };
}
