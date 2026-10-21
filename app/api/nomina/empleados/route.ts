import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, limpiarEmpleado, registrarNomina } from "@/lib/nomina-server";

// Empleados de nómina de una entidad (migración 0167). El dueño, o su contable
// si el dueño lo autorizó (migración 0172).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data, error } = await g.db
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
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { datos, error: errVal } = limpiarEmpleado(body);
  if (errVal || !datos) return NextResponse.json({ error: errVal }, { status: 400 });
  const { data, error } = await g.db
    .from("payroll_employees")
    .insert({ ...datos, owner_id: g.userId, entity_id: entityId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "empleado_creado", { empleado: data.nombre });
  return NextResponse.json({ ok: true, empleado: data });
}
