import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, registrarNomina } from "@/lib/nomina-server";
import { mesesTrabajados, reglasLic, saldoLic, type MovLic } from "@/lib/nomina-licencias";

// Vacaciones y enfermedad (21 oct 2026): saldos por empleado con las reglas
// configurables de la entidad + registro de días tomados / ajustes. VICTOR solo
// lleva la cuenta; no paga ni radica nada.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;

  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const reglas = reglasLic(cfg);

  const { data: emps } = await g.db
    .from("payroll_employees")
    .select("id, nombre, tipo_pago, fecha_ingreso, activo")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  const { data: movs, error } = await g.db
    .from("payroll_leave")
    .select("id, employee_id, tipo, movimiento, fecha, dias, nota, creado_por, created_at")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .order("fecha", { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const empleados = (emps ?? []).map((e) => {
    const propios = (movs ?? []).filter((m) => m.employee_id === e.id) as unknown as (MovLic & { id: string })[];
    const meses = mesesTrabajados((e.fecha_ingreso as string | null) ?? null);
    return {
      id: e.id as string,
      nombre: e.nombre as string,
      tipoPago: e.tipo_pago as string,
      fechaIngreso: (e.fecha_ingreso as string | null) ?? null,
      meses,
      vacaciones: saldoLic("vacaciones", meses, propios, reglas),
      enfermedad: saldoLic("enfermedad", meses, propios, reglas),
    };
  });

  return NextResponse.json({ ok: true, reglas, empleados, movimientos: movs ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;

  const employeeId = String(body.employeeId ?? "");
  const tipo = ["enfermedad", "vacaciones", "ausencia"].includes(body.tipo) ? (body.tipo as string) : null;
  const movimiento = body.movimiento === "ajuste" && tipo !== "ausencia" ? "ajuste" : "tomado";
  const dias = Number(body.dias);
  const fecha = String(body.fecha ?? "");
  if (!employeeId || !tipo || !(dias > 0 && dias <= 365) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Revisa empleado, tipo, días y fecha." }, { status: 400 });
  }
  const { data: emp } = await g.db
    .from("payroll_employees")
    .select("id, nombre")
    .eq("id", employeeId)
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });

  const { data, error } = await g.db
    .from("payroll_leave")
    .insert({
      owner_id: g.userId,
      entity_id: entityId,
      employee_id: employeeId,
      tipo,
      movimiento,
      fecha,
      dias,
      nota: String(body.nota ?? "").slice(0, 300) || null,
      creado_por: g.email ?? null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "licencia_registrada", { empleado: emp.nombre, tipo, movimiento, dias, fecha });
  return NextResponse.json({ ok: true, movimiento: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data: m } = await g.db
    .from("payroll_leave")
    .select("id, tipo, movimiento, dias, fecha, payroll_employees(nombre)")
    .eq("id", id)
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
  const { error } = await g.db.from("payroll_leave").delete().eq("id", id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emp = m.payroll_employees as unknown as { nombre?: string } | { nombre?: string }[] | null;
  const nombre = Array.isArray(emp) ? emp[0]?.nombre : emp?.nombre;
  await registrarNomina(g, entityId, "licencia_eliminada", { empleado: nombre ?? "", tipo: m.tipo, movimiento: m.movimiento, dias: m.dias, fecha: m.fecha });
  return NextResponse.json({ ok: true });
}
