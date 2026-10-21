import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina } from "@/lib/nomina-server";
import { reglasLic } from "@/lib/nomina-licencias";

// Horas de vacaciones/enfermedad pagadas dentro de un período (días × horas por día),
// para pasarlas a las horas regulares de empleados por hora. Los salariados cobran
// igual, así que no necesitan ajuste.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const sp = req.nextUrl.searchParams;
  const entityId = sp.get("entityId") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });
  }
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const r = reglasLic(cfg);
  const { data, error } = await g.db
    .from("payroll_leave")
    .select("employee_id, tipo, dias")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("movimiento", "tomado")
    .in("tipo", ["vacaciones", "enfermedad"])
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const porEmp: Record<string, { dias: number; horas: number }> = {};
  for (const m of data ?? []) {
    const x = (porEmp[m.employee_id as string] ??= { dias: 0, horas: 0 });
    x.dias += Number(m.dias) || 0;
    x.horas += (Number(m.dias) || 0) * r.horas_por_dia;
  }
  return NextResponse.json({ ok: true, horasPorDia: r.horas_por_dia, empleados: porEmp });
}
