import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Editar/desactivar o borrar un vehículo. Si ya tiene cruces de peaje
// vinculados, bloqueamos el borrado (igual que con tipos-gasto) y sugerimos
// desactivar en vez de borrar, para no perder el historial.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const cambios: Record<string, unknown> = {};
  if (typeof body?.placa === "string" && body.placa.trim()) cambios.placa = body.placa.trim().toUpperCase();
  if (body?.alias !== undefined) cambios.alias = body.alias ? String(body.alias).trim() : null;
  if (typeof body?.activo === "boolean") cambios.activo = body.activo;

  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });

  const { data: vehiculo, error } = await supabase
    .from("vehiculos")
    .update(cambios)
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .select("id, placa, alias, activo")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Esa placa ya está registrada." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!vehiculo) return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, vehiculo });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: vehiculo } = await supabase.from("vehiculos").select("id").eq("id", params.id).eq("owner_id", user.id).maybeSingle();
  if (!vehiculo) return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });

  const { count } = await supabase
    .from("peaje_cruces")
    .select("id", { count: "exact", head: true })
    .eq("vehiculo_id", params.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Este vehículo ya tiene cruces de peaje registrados. Desactívalo en vez de borrarlo para no perder el historial." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("vehiculos").delete().eq("id", params.id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
