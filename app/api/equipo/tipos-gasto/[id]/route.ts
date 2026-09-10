import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Editar (PATCH) o eliminar (DELETE) un tipo de gasto con evidencia
// requerida — ver /api/equipo/tipos-gasto/route.ts (POST) para el contexto.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const cambios: Record<string, unknown> = {};
  if (typeof body?.nombre === "string") {
    const nombre = body.nombre.trim();
    if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    cambios.nombre = nombre;
  }
  if ("haciendaCategoryId" in (body ?? {})) cambios.hacienda_category_id = body.haciendaCategoryId ? String(body.haciendaCategoryId) : null;
  if (typeof body?.toleranciaMonto === "number") cambios.tolerancia_monto = body.toleranciaMonto;
  if (typeof body?.ventanaDias === "number") cambios.ventana_dias = body.ventanaDias;
  if (typeof body?.activo === "boolean") cambios.activo = body.activo;

  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  const { data: tipo, error } = await supabase
    .from("expense_evidence_types")
    .update(cambios)
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .select("id, nombre, hacienda_category_id, tolerancia_monto, ventana_dias, activo")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tipo) return NextResponse.json({ error: "Tipo de gasto no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, tipo });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Guardarraíl: no se borra si ya tiene evidencia reportada — el dueño
  // debe desactivarlo en su lugar (mismo patrón que categorías/servicios),
  // así no se pierde el rastro de fotos/montos ya subidos por un técnico.
  const { count } = await supabase
    .from("expense_evidence_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("tipo_id", params.id);

  if (count && count > 0) {
    return NextResponse.json({ error: `Este tipo ya tiene ${count} evidencia(s) reportada(s). Desactívalo en vez de eliminarlo.` }, { status: 409 });
  }

  const { error } = await supabase.from("expense_evidence_types").delete().eq("id", params.id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
