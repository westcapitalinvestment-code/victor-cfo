// Helpers de servidor del módulo Nómina (19 oct 2026): gate del addon, carga de
// parámetros/tramos, validación de empleados y la corrida completa. Se usa
// desde las rutas /api/nomina/*. El cálculo en sí vive en lib/nomina.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { NOMINA_INCLUIDA_EN_BUSINESS } from "./stripe";
import type { Tramo } from "./impuestos-estimados";
import {
  PERIODOS_POR_ANIO,
  acumuladosDesde,
  calcularEmpleado,
  consolidarCorrida,
  parametrosDesdeFilas,
  faltantes,
  trimestreYVencimiento,
  asientoCuadra,
  type ConfigEntidadNomina,
  type EmpleadoNomina,
  type EntradaPeriodo,
  type Frecuencia,
  type LineaNomina,
  type ResumenCorrida,
} from "./nomina";

// --- Gate: usuario autenticado + addon Nómina activo -----------------------
export async function exigirNomina(
  supabase: SupabaseClient
): Promise<{ userId: string } | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, addon_nomina_status")
    .eq("id", user.id)
    .maybeSingle();
  const esPro = perfil?.plan === "pro" || perfil?.plan === "proplus";
  const incluido = perfil?.plan === "proplus" && NOMINA_INCLUIDA_EN_BUSINESS;
  if (!esPro || (!incluido && perfil?.addon_nomina_status !== "activo")) {
    return { error: NextResponse.json({ error: "Necesitas el addon Nómina activo." }, { status: 403 }) };
  }
  return { userId: user.id };
}

// ¿La entidad es del usuario? (RLS ya lo garantiza, pero damos un 404 claro)
export async function entidadDelUsuario(supabase: SupabaseClient, userId: string, entityId: string) {
  if (!entityId) return false;
  const { data } = await supabase
    .from("business_entities")
    .select("id")
    .eq("id", entityId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

// --- Parámetros y tramos ------------------------------------------------------
export async function cargarParametros(supabase: SupabaseClient, anio: number) {
  const { data: filas } = await supabase.from("payroll_params").select("jurisdiccion, anio, clave, valor, por_confirmar");
  const { valores, porConfirmar } = parametrosDesdeFilas(
    (filas ?? []) as { jurisdiccion: string; anio: number; clave: string; valor: number; por_confirmar: boolean }[],
    anio
  );
  const { data: brackets } = await supabase
    .from("tax_brackets")
    .select("anio, desde, tasa")
    .eq("jurisdiccion", "pr")
    .eq("estatus", "individuo")
    .lte("anio", anio);
  let anioTramos = 0;
  for (const b of brackets ?? []) if (b.anio > anioTramos) anioTramos = b.anio;
  const tramos: Tramo[] = (brackets ?? [])
    .filter((b) => b.anio === anioTramos)
    .map((b) => ({ desde: Number(b.desde), tasa: Number(b.tasa) }))
    .sort((a, b) => a.desde - b.desde);
  return { valores, porConfirmar, tramos, anioTramos };
}

export async function cargarConfigEntidad(supabase: SupabaseClient, entityId: string): Promise<ConfigEntidadNomina> {
  const { data } = await supabase
    .from("payroll_entity_config")
    .select("suta_tasa, cfse_tasa, futa_aplica")
    .eq("entity_id", entityId)
    .maybeSingle();
  return {
    sutaTasa: data?.suta_tasa === null || data?.suta_tasa === undefined ? null : Number(data.suta_tasa),
    cfseTasa: data?.cfse_tasa === null || data?.cfse_tasa === undefined ? null : Number(data.cfse_tasa),
    futaAplica: data?.futa_aplica ?? true,
  };
}

// --- Empleados ------------------------------------------------------------------
const FRECUENCIAS = ["semanal", "bisemanal", "quincenal", "mensual"];
const ESTADOS = ["soltero", "casado_conjunto", "casado_separado"];
const EXENCIONES = ["completa", "compartida", "ninguna"];

type Fila = Record<string, unknown>;

export function filaAEmpleado(f: Fila): EmpleadoNomina {
  return {
    id: String(f.id),
    nombre: String(f.nombre),
    frecuencia: f.frecuencia as Frecuencia,
    tipoPago: f.tipo_pago as "salario" | "hora",
    tarifa: Number(f.tarifa),
    estadoCivil: f.estado_civil as EmpleadoNomina["estadoCivil"],
    exencionPersonal: f.exencion_personal as EmpleadoNomina["exencionPersonal"],
    dependientes: Number(f.dependientes),
    dependientesUniv: Number(f.dependientes_univ),
    retencionAdicional: Number(f.retencion_adicional),
    deduccionMedico: Number(f.deduccion_medico),
    aporte401k: Number(f.aporte_401k),
    esChofer: !!f.es_chofer,
  };
}

const num = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

// Valida y recorta el cuerpo recibido a las columnas permitidas.
export function limpiarEmpleado(b: Fila, parcial = false): { datos?: Fila; error?: string } {
  const d: Fila = {};
  if (b.nombre !== undefined || !parcial) {
    const nombre = String(b.nombre ?? "").trim();
    if (!nombre) return { error: "El nombre es obligatorio." };
    d.nombre = nombre.slice(0, 120);
  }
  if (b.ssn_ultimos4 !== undefined) {
    const s = String(b.ssn_ultimos4 ?? "").trim();
    if (s && !/^[0-9]{4}$/.test(s)) return { error: "Escribe solo los últimos 4 dígitos del Seguro Social." };
    d.ssn_ultimos4 = s || null;
  }
  if (b.email !== undefined) d.email = String(b.email ?? "").trim().slice(0, 160) || null;
  if (b.frecuencia !== undefined) {
    if (!FRECUENCIAS.includes(String(b.frecuencia))) return { error: "Frecuencia inválida." };
    d.frecuencia = b.frecuencia;
  }
  if (b.tipo_pago !== undefined) {
    if (!["salario", "hora"].includes(String(b.tipo_pago))) return { error: "Tipo de pago inválido." };
    d.tipo_pago = b.tipo_pago;
  }
  if (b.tarifa !== undefined) d.tarifa = num(b.tarifa);
  if (b.estado_civil !== undefined) {
    if (!ESTADOS.includes(String(b.estado_civil))) return { error: "Estado civil inválido." };
    d.estado_civil = b.estado_civil;
  }
  if (b.exencion_personal !== undefined) {
    if (!EXENCIONES.includes(String(b.exencion_personal))) return { error: "Exención personal inválida." };
    d.exencion_personal = b.exencion_personal;
  }
  for (const k of ["dependientes", "dependientes_univ"]) {
    if (b[k] !== undefined) d[k] = Math.floor(num(b[k]));
  }
  for (const k of ["retencion_adicional", "deduccion_medico", "aporte_401k"]) {
    if (b[k] !== undefined) d[k] = num(b[k]);
  }
  if (b.es_chofer !== undefined) d.es_chofer = !!b.es_chofer;
  if (b.activo !== undefined) d.activo = !!b.activo;
  if (b.fecha_ingreso !== undefined) d.fecha_ingreso = b.fecha_ingreso ? String(b.fecha_ingreso).slice(0, 10) : null;
  if (b.ytd_inicial !== undefined) {
    const y = (b.ytd_inicial ?? {}) as Fila;
    d.ytd_inicial = {
      bruto: num(y.bruto),
      sinot_base: num(y.sinot_base),
      suta_base: num(y.suta_base),
      futa_base: num(y.futa_base),
    };
  }
  if (b.ytd_inicial_anio !== undefined) d.ytd_inicial_anio = b.ytd_inicial_anio ? Math.floor(num(b.ytd_inicial_anio)) : null;
  return { datos: d };
}

// --- Corrida completa ---------------------------------------------------------------
export interface EntradaCorrida {
  entityId: string;
  frecuencia: Frecuencia;
  periodoInicio: string;
  periodoFin: string;
  fechaPago: string;
  lineas: ({ employeeId: string } & EntradaPeriodo)[];
}

export interface ResultadoCorrida {
  anio: number;
  lineas: (LineaNomina & { entrada: EntradaPeriodo })[];
  resumen: ResumenCorrida;
  vencimiento: { trimestre: string; vence: string };
  porConfirmar: string[];
  parametrosUsados: Record<string, number>;
  asientoCuadra: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function calcularCorrida(
  supabase: SupabaseClient,
  userId: string,
  e: EntradaCorrida
): Promise<{ resultado?: ResultadoCorrida; error?: string; status?: number }> {
  if (!(await entidadDelUsuario(supabase, userId, e.entityId))) return { error: "Entidad no encontrada.", status: 404 };
  if (!FRECUENCIAS.includes(e.frecuencia)) return { error: "Frecuencia inválida.", status: 400 };
  if (![e.periodoInicio, e.periodoFin, e.fechaPago].every((f) => FECHA.test(f ?? ""))) {
    return { error: "Fechas inválidas.", status: 400 };
  }
  if (e.periodoFin < e.periodoInicio) return { error: "El fin del periodo es anterior al inicio.", status: 400 };
  if (!Array.isArray(e.lineas) || e.lineas.length === 0) return { error: "Selecciona al menos un empleado.", status: 400 };

  const anio = Number(e.fechaPago.slice(0, 4));
  const ids = e.lineas.map((l) => l.employeeId);
  const { data: filas } = await supabase
    .from("payroll_employees")
    .select("*")
    .eq("owner_id", userId)
    .eq("entity_id", e.entityId)
    .in("id", ids);
  const porId = new Map<string, Fila>((filas ?? []).map((f): [string, Fila] => [String(f.id), f as Fila]));

  const { valores, porConfirmar, tramos } = await cargarParametros(supabase, anio);
  const falt = faltantes(valores);
  if (falt.length > 0) return { error: `Faltan parámetros de nómina (${falt.join(", ")}). Corre la migración 0167.`, status: 500 };
  if (tramos.length === 0) return { error: "Faltan los tramos de Hacienda (tax_brackets pr/individuo).", status: 500 };

  const config = await cargarConfigEntidad(supabase, e.entityId);

  const { data: previas } = await supabase
    .from("payroll_run_lines")
    .select("employee_id, bruto, base_sinot, base_suta, base_futa")
    .eq("owner_id", userId)
    .eq("anio", anio)
    .in("employee_id", ids);

  const lineas: (LineaNomina & { entrada: EntradaPeriodo })[] = [];
  for (const l of e.lineas) {
    const fila = porId.get(l.employeeId);
    if (!fila) return { error: "Un empleado de la corrida no existe en esta entidad.", status: 404 };
    if (fila.frecuencia !== e.frecuencia) {
      return { error: `${fila.nombre} se paga ${fila.frecuencia}, pero esta corrida es ${e.frecuencia}.`, status: 400 };
    }
    const emp = filaAEmpleado(fila);
    const inicial = fila.ytd_inicial_anio === anio ? (fila.ytd_inicial as Fila) : null;
    const ytd = acumuladosDesde(
      inicial as { bruto?: number; sinot_base?: number; suta_base?: number; futa_base?: number } | null,
      (previas ?? [])
        .filter((p) => p.employee_id === l.employeeId)
        .map((p) => ({
          bruto: Number(p.bruto),
          base_sinot: Number(p.base_sinot),
          base_suta: Number(p.base_suta),
          base_futa: Number(p.base_futa),
        }))
    );
    const entrada: EntradaPeriodo = {
      horasRegulares: num(l.horasRegulares),
      horasExtra: num(l.horasExtra),
      comisiones: num(l.comisiones),
      bonos: num(l.bonos),
      otrosIngresos: num(l.otrosIngresos),
      otrasDeducciones: num(l.otrasDeducciones),
    };
    const calc = calcularEmpleado(emp, entrada, ytd, valores, tramos, config);
    lineas.push({ ...calc, entrada });
  }

  const resumen = consolidarCorrida(lineas);
  return {
    resultado: {
      anio,
      lineas,
      resumen,
      vencimiento: trimestreYVencimiento(e.fechaPago),
      porConfirmar,
      parametrosUsados: valores,
      asientoCuadra: asientoCuadra(resumen.asiento),
    },
  };
}

export { PERIODOS_POR_ANIO };
