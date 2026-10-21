import type { ActorNomina } from "./nomina-server";
import { registrarNomina } from "./nomina-server";
import { mesesTrabajados, reglasLic, saldoLic, type MovLic } from "./nomina-licencias";
import { cargarLogoExcel } from "./reporte-excel";
import { sendTalonarioEmail } from "./email";
import { htmlTalonarioCorreo, fechaMDY, type DatosTalonarios, type Talonario } from "./nomina-talonario-html";

// Talonarios (recibos de pago) de una corrida: arma los datos y los envía por correo.
// 21 oct 2026 — pedido de Javier Pabón (AVG Accounting) y de Joel.
const n = (v: unknown) => Number(v ?? 0) || 0;

export type DatosCorridaServer = DatosTalonarios & {
  corrida: DatosTalonarios["corrida"] & { id: string; anio: number; estado: string };
  logoR2Key: string | null;
};

export async function cargarDatosTalonarios(
  g: ActorNomina,
  entityId: string,
  corridaId: string,
  soloEmpleado?: string | null
): Promise<{ datos?: DatosCorridaServer; error?: string; status?: number }> {
  const { data: run } = await g.db.from("payroll_runs").select("*").eq("id", corridaId).eq("owner_id", g.userId).maybeSingle();
  if (!run) return { error: "Corrida no encontrada.", status: 404 };

  const { data: ent } = await g.db.from("business_entities").select("name, ein, municipio, phone, address, zip, logo_r2_key").eq("id", entityId).maybeSingle();

  let q = g.db.from("payroll_run_lines").select("*").eq("run_id", corridaId).order("created_at");
  if (soloEmpleado) q = q.eq("employee_id", soloEmpleado);
  const { data: lineas } = await q;
  const ids = (lineas ?? []).map((l) => l.employee_id as string);
  const base = {
    entidad: ent ? { name: ent.name, ein: ent.ein, municipio: ent.municipio, phone: ent.phone, address: ent.address, zip: ent.zip } : null,
    corrida: { id: run.id, frecuencia: run.frecuencia, periodo_inicio: run.periodo_inicio, periodo_fin: run.periodo_fin, fecha_pago: run.fecha_pago, anio: run.anio, estado: run.estado },
    logoR2Key: (ent?.logo_r2_key as string | null) ?? null,
  };
  if (ids.length === 0) return { datos: { ...base, talonarios: [] } };

  const { data: emps } = await g.db
    .from("payroll_employees")
    .select("id, nombre, email, ssn_ultimos4, tipo_pago, tarifa, frecuencia, fecha_ingreso, ytd_inicial, ytd_inicial_anio")
    .in("id", ids);

  // Acumulado del año: corridas aprobadas hasta este período (+ la propia) + lo previo cargado.
  const { data: corridasAnio } = await g.db
    .from("payroll_runs")
    .select("id, estado, periodo_fin")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("anio", run.anio)
    .lte("periodo_fin", run.periodo_fin);
  const runIds = (corridasAnio ?? []).filter((r) => r.id === corridaId || r.estado !== "pendiente").map((r) => r.id as string);
  const { data: previas } = await g.db
    .from("payroll_run_lines")
    .select("employee_id, bruto, neto, ss_emp, medicare_emp, medicare_adic, hacienda, sinot_emp, choferil, otras_deducciones")
    .in("run_id", runIds.length ? runIds : [corridaId])
    .in("employee_id", ids);

  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const reglas = reglasLic(cfg);
  const { data: movs } = await g.db.from("payroll_leave").select("employee_id, tipo, movimiento, fecha, dias").eq("owner_id", g.userId).eq("entity_id", entityId).in("employee_id", ids);

  const talonarios: Talonario[] = (lineas ?? []).map((l) => {
    const e = (emps ?? []).find((x) => x.id === l.employee_id);
    const propias = (previas ?? []).filter((p) => p.employee_id === l.employee_id);
    const suma = (k: string) => propias.reduce((s, p) => s + n((p as Record<string, unknown>)[k]), 0);
    const inicial = e && e.ytd_inicial_anio === run.anio ? ((e.ytd_inicial ?? {}) as { bruto?: number }) : null;
    const meses = mesesTrabajados((e?.fecha_ingreso as string | null) ?? null);
    const m = (movs ?? []).filter((x) => x.employee_id === l.employee_id) as unknown as MovLic[];
    return {
      employeeId: l.employee_id as string,
      nombre: (e?.nombre as string) ?? (l.detalle as { nombre?: string })?.nombre ?? "",
      email: ((e?.email as string | null) ?? "").trim() || null,
      ssnUltimos4: (e?.ssn_ultimos4 as string | null) ?? null,
      tipoPago: (e?.tipo_pago as string) ?? "salario",
      tarifa: n(e?.tarifa),
      frecuencia: (e?.frecuencia as string) ?? run.frecuencia,
      entrada: (l.entrada ?? {}) as Talonario["entrada"],
      linea: l.detalle as Talonario["linea"],
      acumulado: {
        bruto: suma("bruto") + n(inicial?.bruto),
        neto: suma("neto"),
        retenciones: suma("ss_emp") + suma("medicare_emp") + suma("medicare_adic") + suma("hacienda") + suma("sinot_emp") + suma("choferil"),
        hacienda: suma("hacienda"),
        otras: suma("otras_deducciones"),
      },
      licencias: {
        vacaciones: saldoLic("vacaciones", meses, m, reglas).saldo,
        enfermedad: saldoLic("enfermedad", meses, m, reglas).saldo,
      },
    };
  });
  return { datos: { ...base, talonarios } };
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ResultadoEnvio {
  enviados: number;
  sinEmail: string[];
  fallidos: { nombre: string; motivo: string }[];
}

// Envía el talonario de cada empleado con email. Solo corridas aprobadas.
export async function enviarTalonariosCorrida(
  g: ActorNomina,
  entityId: string,
  corridaId: string,
  opts: { employeeId?: string | null; origen: "manual" | "automatico" }
): Promise<{ ok: true; resultado: ResultadoEnvio } | { ok: false; error: string; status: number }> {
  const r = await cargarDatosTalonarios(g, entityId, corridaId, opts.employeeId);
  if (!r.datos) return { ok: false, error: r.error ?? "No se pudo cargar la corrida.", status: r.status ?? 500 };
  const d = r.datos;
  if (d.corrida.estado !== "aprobada") return { ok: false, error: "La corrida debe estar aprobada para enviar los talonarios.", status: 409 };
  if (d.talonarios.length === 0) return { ok: false, error: "Esta corrida no tiene empleados.", status: 404 };

  const logo = await cargarLogoExcel(d.logoR2Key);
  const resultado: ResultadoEnvio = { enviados: 0, sinEmail: [], fallidos: [] };
  for (const t of d.talonarios) {
    if (!t.email || !EMAIL_OK.test(t.email)) {
      resultado.sinEmail.push(t.nombre);
      continue;
    }
    const asunto = `Tu talonario de pago ${fechaMDY(d.corrida.periodo_inicio)} – ${fechaMDY(d.corrida.periodo_fin)}${d.entidad?.name ? ` — ${d.entidad.name}` : ""}`;
    const env = await sendTalonarioEmail({
      toEmail: t.email,
      empresa: d.entidad?.name ?? "Tu empleador",
      asunto,
      html: htmlTalonarioCorreo(d, t, !!logo),
      logo,
    });
    if (env.sent) resultado.enviados++;
    else resultado.fallidos.push({ nombre: t.nombre, motivo: env.reason ?? "error" });
  }
  await registrarNomina(g, entityId, "talonarios_enviados", {
    run_id: corridaId,
    periodo: `${d.corrida.periodo_inicio} a ${d.corrida.periodo_fin}`,
    origen: opts.origen,
    enviados: resultado.enviados,
    sin_email: resultado.sinEmail.length,
    fallidos: resultado.fallidos.length,
    solo_empleado: opts.employeeId ?? null,
  });
  return { ok: true, resultado };
}

// Envío automático al aprobar una corrida (si el dueño lo encendió en Tasas). Nunca
// lanza error: un fallo aquí no debe afectar la aprobación.
export async function enviarTalonariosAuto(
  g: ActorNomina,
  entityId: string,
  corridaId: string
): Promise<{ enviados: number; sinEmail: number; fallidos: number } | null> {
  try {
    const { data: cfg } = await g.db.from("payroll_entity_config").select("talonarios_auto").eq("entity_id", entityId).maybeSingle();
    if (!cfg?.talonarios_auto) return null;
    const r = await enviarTalonariosCorrida(g, entityId, corridaId, { origen: "automatico" });
    if (!r.ok) return null;
    return { enviados: r.resultado.enviados, sinEmail: r.resultado.sinEmail.length, fallidos: r.resultado.fallidos.length };
  } catch {
    return null;
  }
}
