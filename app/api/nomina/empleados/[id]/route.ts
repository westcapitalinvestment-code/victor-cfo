import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila, limpiarEmpleado, registrarNomina } from "@/lib/nomina-server";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_employees", params.id);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const { datos, error: errVal } = limpiarEmpleado(body, true);
  if (errVal || !datos) return NextResponse.json({ error: errVal }, { status: 400 });
  // Para la bitácora: qué campos cambiaron (antes → después).
  const { data: antes } = await g.db.from("payroll_employees").select("*").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  const { data, error } = await g.db
    .from("payroll_employees")
    .update(datos)
    .eq("id", params.id)
    .eq("owner_id", g.userId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  const cambios: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(datos)) {
    const a = (antes as Record<string, unknown> | null)?.[k];
    const b = (data as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) cambios[k] = [a ?? null, b ?? null];
  }
  await registrarNomina(g, entityId, "empleado_editado", { empleado: data.nombre, cambios });
  return NextResponse.json({ ok: true, empleado: data });
}

// Si ya tiene corridas guardadas solo se desactiva (el historial no se pierde);
// si nunca se le pagó, se borra de verdad.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_employees", params.id);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  const { count } = await g.db
    .from("payroll_run_lines")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", params.id)
    .eq("owner_id", g.userId);
  if ((count ?? 0) > 0) {
    await g.db.from("payroll_employees").update({ activo: false }).eq("id", params.id).eq("owner_id", g.userId);
    await registrarNomina(g, entityId, "empleado_desactivado", { id: params.id });
    return NextResponse.json({ ok: true, desactivado: true });
  }
  const { error } = await g.db.from("payroll_employees").delete().eq("id", params.id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "empleado_eliminado", { id: params.id });
  return NextResponse.json({ ok: true });
}
