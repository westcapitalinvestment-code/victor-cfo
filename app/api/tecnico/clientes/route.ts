import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";

// Buscar/crear clientes desde la app del técnico — scoped a la entidad del
// técnico (nunca ve clientes de otro negocio). Crear solo si el dueño
// activó el permiso "Añadir clientes nuevos" (business_entities.
// equipo_tecnico_anade_clientes).
export async function GET(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  let query = ctx.admin
    .from("clients")
    .select("id, name, phone")
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(30);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data } = await query;
  return NextResponse.json({ ok: true, clientes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });
  if (!ctx.permisos.anadeClientes) {
    return NextResponse.json({ error: "No tienes permiso para añadir clientes nuevos." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  if (!name) return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });

  const { data, error } = await ctx.admin
    .from("clients")
    .insert({ owner_id: ctx.tecnico.owner_id, entity_id: ctx.tecnico.entity_id, name, phone: phone || null, active: true })
    .select("id, name, phone")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "No se pudo crear el cliente." }, { status: 500 });
  return NextResponse.json({ ok: true, cliente: data });
}
