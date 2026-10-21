// Helpers de servidor del módulo Nómina (19 oct 2026): gate del addon, carga de
// parámetros/tramos, validación de empleados y la corrida completa. Se usa
// desde las rutas /api/nomina/*. El cálculo en sí vive en lib/nomina.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { nominaIncluidaEnPlan } from "./stripe";
import { createAdminClient } from "./supabase/admin";
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
// ¿El dueño tiene Nómina (Business, o Pro con el addon)? `db` lee la fila users.
async function duenoTieneNomina(db: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data: perfil } = await db
    .from("users")
    .select("plan, plan_status, addon_nomina_status, nomina_fundador")
    .eq("id", ownerId)
    .maybeSingle();
  const esPro = perfil?.plan === "pro" || perfil?.plan === "proplus";
  return esPro && (nominaIncluidaEnPlan(perfil) || perfil?.addon_nomina_status === "activo");
}

export async function exigirNomina(
  supabase: SupabaseClient
): Promise<{ userId: string } | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  if (!(await duenoTieneNomina(supabase, user.id))) {
    return { error: NextResponse.json({ error: "Necesitas el addon Nómina activo." }, { status: 403 }) };
  }
  return { userId: user.id };
}

// --- Quién opera la nómina: el dueño o su contable (migración 0172) -----------
// El dueño trabaja con su propia sesión (RLS). El contable solo opera si es
// contable activo del dueño Y el dueño encendió "cpa_puede_nomina" para esa
// entidad; en ese caso las escrituras van por el cliente de servicio, con
// owner_id SIEMPRE el del dueño (nunca el del contable).
export interface ActorNomina {
  userId: string; // owner_id con el que se leen/escriben las filas
  db: SupabaseClient;
  actor: "dueno" | "contable";
  email: string;
  apruebaDirecto: boolean; // dueño: siempre true; contable: según el interruptor
}

export async function actorNomina(
  supabase: SupabaseClient,
  entityId: string,
  // soloPermisos: el dueño sin Nómina activa solo puede encender/apagar los
  // interruptores del contable (ver /api/nomina/config).
  opts: { soloPermisos?: boolean } = {}
): Promise<{ g: ActorNomina } | { error: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const email = user.email ?? "";
  if (!entityId) return { error: NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 }) };

  // 1) ¿Es el dueño de la entidad?
  if (await entidadDelUsuario(supabase, user.id, entityId)) {
    if (!opts.soloPermisos && !(await duenoTieneNomina(supabase, user.id))) {
      return { error: NextResponse.json({ error: "Necesitas el addon Nómina activo." }, { status: 403 }) };
    }
    return { g: { userId: user.id, db: supabase, actor: "dueno", email, apruebaDirecto: true } };
  }

  // 2) ¿Es un contable autorizado por el dueño?
  const admin = createAdminClient();
  const { data: ent } = await admin.from("business_entities").select("owner_id").eq("id", entityId).maybeSingle();
  if (!ent?.owner_id) return { error: NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 }) };
  const { data: miembro } = await admin
    .from("account_members")
    .select("id")
    .eq("owner_id", ent.owner_id)
    .eq("member_email", email)
    .eq("role", "cpa")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!miembro) return { error: NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 }) };
  const { data: cfg } = await admin
    .from("payroll_entity_config")
    .select("cpa_puede_nomina, cpa_aprueba_directo")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!cfg?.cpa_puede_nomina) {
    return { error: NextResponse.json({ error: "El dueño no ha autorizado que el contable corra la nómina de esta entidad." }, { status: 403 }) };
  }
  // El contable siempre tiene Nómina (decisión del 21 oct 2026): no depende de
  // que el dueño tenga el addon; solo del permiso que el dueño le dio arriba.
  return { g: { userId: ent.owner_id, db: admin, actor: "contable", email, apruebaDirecto: !!cfg.cpa_aprueba_directo } };
}

// Para rutas /[id]: averigua la entidad de la fila y luego autoriza como arriba.
export async function actorNominaPorFila(
  supabase: SupabaseClient,
  tabla: "payroll_employees" | "payroll_runs",
  id: string
): Promise<{ g: ActorNomina; entityId: string } | { error: NextResponse }> {
  const admin = createAdminClient();
  const { data: fila } = await admin.from(tabla).select("entity_id").eq("id", id).maybeSingle();
  if (!fila?.entity_id) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404 }) };
  const r = await actorNomina(supabase, String(fila.entity_id));
  if ("error" in r) return r;
  return { g: r.g, entityId: String(fila.entity_id) };
}

// Bitácora (mejor esfuerzo: un fallo aquí nunca bloquea la operación).
export async function registrarNomina(g: ActorNomina, entityId: string, accion: string, detalle: Record<string, unknown> = {}) {
  try {
    await createAdminClient().from("payroll_audit_log").insert({
      owner_id: g.userId,
      entity_id: entityId,
      actor_email: g.email,
      actor_rol: g.actor,
      accion,
      detalle,
    });
  } catch {
    /* sin bitácora no se detiene la nómina */
  }
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
    allowancesDeduccion: Number(f.allowances_deduccion ?? 0),
    veterano: !!f.veterano,
    deduccionEspecial: !!f.deduccion_especial,
    retencionAdicional: Number(f.retencion_adicional),
    deduccionMedico: Number(f.deduccion_medico),
    aporte401k: Number(f.aporte_401k),
    esChofer: !!f.es_chofer,
    exentoSinot: !!f.exento_sinot,
    jovenExento: !!f.joven_exento,
    fechaNacimiento: f.fecha_nacimiento ? String(f.fecha_nacimiento).slice(0, 10) : null,
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
  // Dependientes: custodia compartida cuenta 0.5 → se redondea al medio más cercano.
  if (b.dependientes !== undefined) d.dependientes = Math.round(num(b.dependientes) * 2) / 2;
  if (b.allowances_deduccion !== undefined) d.allowances_deduccion = Math.floor(num(b.allowances_deduccion));
  if (b.veterano !== undefined) d.veterano = !!b.veterano;
  if (b.deduccion_especial !== undefined) d.deduccion_especial = !!b.deduccion_especial;
  for (const k of ["retencion_adicional", "deduccion_medico", "aporte_401k"]) {
    if (b[k] !== undefined) d[k] = num(b[k]);
  }
  if (b.es_chofer !== undefined) d.es_chofer = !!b.es_chofer;
  if (b.exento_sinot !== undefined) d.exento_sinot = !!b.exento_sinot;
  if (b.joven_exento !== undefined) d.joven_exento = !!b.joven_exento;
  if (b.fecha_nacimiento !== undefined) {
    const fn = b.fecha_nacimiento ? String(b.fecha_nacimiento).slice(0, 10) : null;
    if (fn && !/^\d{4}-\d{2}-\d{2}$/.test(fn)) return { error: "Fecha de nacimiento inválida." };
    d.fecha_nacimiento = fn;
  }
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
  runId?: string; // al EDITAR una corrida: esa corrida no cuenta en los acumulados previos
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

  // Solo cuentan las corridas APROBADAS (las pendientes del contable no suman al acumulado).
  const { data: aprobadas } = await supabase
    .from("payroll_runs")
    .select("id")
    .eq("owner_id", userId)
    .eq("anio", anio)
    .eq("estado", "aprobada");
  const idsAprobadas = (aprobadas ?? []).map((r) => String(r.id)).filter((id) => id !== (e.runId ?? ""));
  const { data: previas } = idsAprobadas.length
    ? await supabase
        .from("payroll_run_lines")
        .select("employee_id, bruto, base_sinot, base_suta, base_futa")
        .eq("owner_id", userId)
        .eq("anio", anio)
        .in("run_id", idsAprobadas)
        .in("employee_id", ids)
    : { data: [] as { employee_id: string; bruto: number; base_sinot: number; base_suta: number; base_futa: number }[] };

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
      fechaPago: e.fechaPago,
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

// Filas de payroll_run_lines a partir del resultado de una corrida.
export function filasDeLineas(res: ResultadoCorrida, runId: string, ownerId: string, entityId: string) {
  return res.lineas.map((l) => ({
    run_id: runId,
    owner_id: ownerId,
    entity_id: entityId,
    employee_id: l.employeeId,
    anio: res.anio,
    entrada: l.entrada,
    bruto: l.bruto,
    neto: l.neto,
    ss_emp: l.ssEmp,
    medicare_emp: l.medicareEmp,
    medicare_adic: l.medicareAdic,
    hacienda: l.hacienda,
    sinot_emp: l.sinotEmp,
    choferil: l.choferil,
    otras_deducciones: l.deduccionMedico + l.aporte401k + l.otrasDeducciones,
    ss_pat: l.ssPat,
    medicare_pat: l.medicarePat,
    futa: l.futa,
    suta: l.suta,
    sinot_pat: l.sinotPat,
    cfse: l.cfse,
    base_ss: l.baseSs,
    base_suta: l.baseSuta,
    base_futa: l.baseFuta,
    base_sinot: l.baseSinot,
    detalle: l,
  }));
}

export { PERIODOS_POR_ANIO };
