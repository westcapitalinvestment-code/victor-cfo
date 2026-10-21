import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina } from "@/lib/nomina-server";

// Datos para los reportes de Nómina (estado de cuenta del empleado, certificación de
// ingresos, resumen del año). Solo corridas APROBADAS: las pendientes del contable
// todavía no cuentan. El armado del reporte (tablas, CSV, impresión) se hace en el
// cliente; aquí solo se devuelven las líneas de las corridas en el rango pedido
// (por fecha de pago, que es lo que cuenta para el W-2).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;

  const f = /^\d{4}-\d{2}-\d{2}$/;
  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!f.test(desde) || !f.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });
  }
  const employeeId = req.nextUrl.searchParams.get("employeeId") ?? "";

  let q = g.db
    .from("payroll_run_lines")
    .select(
      "id, employee_id, entrada, bruto, neto, ss_emp, medicare_emp, medicare_adic, hacienda, sinot_emp, choferil, otras_deducciones, detalle, payroll_runs!inner(periodo_inicio, periodo_fin, fecha_pago, estado)"
    )
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("payroll_runs.estado", "aprobada")
    .gte("payroll_runs.fecha_pago", desde)
    .lte("payroll_runs.fecha_pago", hasta);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data: lineas, error } = await q.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: empleados } = await g.db
    .from("payroll_employees")
    .select("id, nombre, ssn_ultimos4, frecuencia, tipo_pago, tarifa, fecha_ingreso, ytd_inicial, ytd_inicial_anio, activo")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .order("nombre", { ascending: true });
  const { data: ent } = await g.db.from("business_entities").select("name").eq("id", entityId).maybeSingle();

  type Fila = Record<string, unknown> & { payroll_runs: { periodo_inicio: string; periodo_fin: string; fecha_pago: string } | { periodo_inicio: string; periodo_fin: string; fecha_pago: string }[] };
  const filas = ((lineas ?? []) as unknown as Fila[]).map((l) => {
    const run = Array.isArray(l.payroll_runs) ? l.payroll_runs[0] : l.payroll_runs;
    return { ...l, payroll_runs: undefined, periodo_inicio: run?.periodo_inicio, periodo_fin: run?.periodo_fin, fecha_pago: run?.fecha_pago };
  });
  filas.sort((x, y) => String(x.fecha_pago).localeCompare(String(y.fecha_pago)));

  return NextResponse.json({ ok: true, entidad: ent?.name ?? "", empleados: empleados ?? [], lineas: filas });
}
