import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exigirNomina, limpiarEmpleado } from "@/lib/nomina-server";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const { datos, error: errVal } = limpiarEmpleado(body, true);
  if (errVal || !datos) return NextResponse.json({ error: errVal }, { status: 400 });
  const { data, error } = await supabase
    .from("payroll_employees")
    .update(datos)
    .eq("id", params.id)
    .eq("owner_id", g.userId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, empleado: data });
}

// Si ya tiene corridas guardadas solo se desactiva (el historial no se pierde);
// si nunca se le pagó, se borra de verdad.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const { count } = await supabase
    .from("payroll_run_lines")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", params.id)
    .eq("owner_id", g.userId);
  if ((count ?? 0) > 0) {
    await supabase.from("payroll_employees").update({ activo: false }).eq("id", params.id).eq("owner_id", g.userId);
    return NextResponse.json({ ok: true, desactivado: true });
  }
  const { error } = await supabase.from("payroll_employees").delete().eq("id", params.id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
