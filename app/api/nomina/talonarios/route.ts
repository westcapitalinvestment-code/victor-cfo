import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila } from "@/lib/nomina-server";
import { mesesTrabajados, reglasLic, saldoLic, type MovLic } from "@/lib/nomina-licencias";

// Talonarios (recibos de pago) de una corrida (21 oct 2026, pedido de Javier Pabón,
// AVG Accounting). Devuelve, por empleado, todo lo que lleva un talonario: ingresos
// del período (horas y tarifa), deducciones, neto, acumulado del año y saldos de
// vacaciones/enfermedad. El PDF/impresión se arma en el cliente.
const n = (v: unknown) => Number(v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const corridaId = req.nextUrl.searchParams.get("corridaId") ?? "";
  const soloEmpleado = req.nextUrl.searchParams.get("employeeId");
  if (!corridaId) return NextResponse.json({ error: "Falta la corrida." }, { status: 400 });
  const a = await actorNominaPorFila(supabase, "payroll_runs", corridaId);
  if ("error" in a) return a.error;
  const { g, entityId } = a;

  const { data: run } = await g.db.from("payroll_runs").select("*").eq("id", corridaId).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });

  const { data: ent } = await g.db.from("business_entities").select("name, ein, municipio, phone, address, zip").eq("id", entityId).maybeSingle();

  let q = g.db.from("payroll_run_lines").select("*").eq("run_id", corridaId).order("created_at");
  if (soloEmpleado) q = q.eq("employee_id", soloEmpleado);
  const { data: lineas } = await q;
  const ids = (lineas ?? []).map((l) => l.employee_id as string);
  if (ids.length === 0) return NextResponse.json({ ok: true, entidad: ent, corrida: run, talonarios: [] });

  const { data: emps } = await g.db
    .from("payroll_employees")
    .select("id, nombre, ssn_ultimos4, tipo_pago, tarifa, frecuencia, fecha_ingreso, ytd_inicial, ytd_inicial_anio")
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

  // Vacaciones / enfermedad
  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const reglas = reglasLic(cfg);
  const { data: movs } = await g.db.from("payroll_leave").select("employee_id, tipo, movimiento, fecha, dias").eq("owner_id", g.userId).eq("entity_id", entityId).in("employee_id", ids);

  const talonarios = (lineas ?? []).map((l) => {
    const e = (emps ?? []).find((x) => x.id === l.employee_id);
    const propias = (previas ?? []).filter((p) => p.employee_id === l.employee_id);
    const suma = (k: string) => propias.reduce((s, p) => s + n((p as Record<string, unknown>)[k]), 0);
    const inicial = e && e.ytd_inicial_anio === run.anio ? ((e.ytd_inicial ?? {}) as { bruto?: number }) : null;
    const brutoAnio = suma("bruto") + n(inicial?.bruto);
    const meses = mesesTrabajados((e?.fecha_ingreso as string | null) ?? null);
    const m = (movs ?? []).filter((x) => x.employee_id === l.employee_id) as unknown as MovLic[];
    return {
      employeeId: l.employee_id as string,
      nombre: (e?.nombre as string) ?? (l.detalle as { nombre?: string })?.nombre ?? "",
      ssnUltimos4: (e?.ssn_ultimos4 as string | null) ?? null,
      tipoPago: (e?.tipo_pago as string) ?? "salario",
      tarifa: n(e?.tarifa),
      frecuencia: (e?.frecuencia as string) ?? run.frecuencia,
      entrada: (l.entrada ?? {}) as Record<string, unknown>,
      linea: l.detalle as Record<string, unknown>,
      acumulado: {
        bruto: brutoAnio,
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

  return NextResponse.json({
    ok: true,
    entidad: ent,
    corrida: { id: run.id, frecuencia: run.frecuencia, periodo_inicio: run.periodo_inicio, periodo_fin: run.periodo_fin, fecha_pago: run.fecha_pago, anio: run.anio, estado: run.estado },
    talonarios,
  });
}
