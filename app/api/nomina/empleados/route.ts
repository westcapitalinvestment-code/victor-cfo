import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entidadDelUsuario, exigirNomina, limpiarEmpleado } from "@/lib/nomina-server";

// Empleados de nómina de una entidad (migración 0167). Solo el dueño.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  if (!(await entidadDelUsuario(supabase, g.userId, entityId))) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("payroll_employees")
    .select("*")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empleados: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  if (!(await entidadDelUsuario(supabase, g.userId, entityId))) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }
  const { datos, error: errVal } = limpiarEmpleado(body);
  if (errVal || !datos) return NextResponse.json({ error: errVal }, { status: 400 });
  const { data, error } = await supabase
    .from("payroll_employees")
    .insert({ ...datos, owner_id: g.userId, entity_id: entityId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, empleado: data });
}
