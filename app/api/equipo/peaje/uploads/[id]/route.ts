import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivoR2 } from "@/lib/r2";

// Deshace una subida de PDF de peaje completa — borra la fila de
// peaje_statement_uploads (los cruces caen en cascada por FK, migración
// 0082) y el PDF original en R2. Mismo patrón que borrar un estado de
// cuenta bancario subido.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: subida } = await supabase.from("peaje_statement_uploads").select("r2_key").eq("id", params.id).eq("owner_id", user.id).maybeSingle();
  if (!subida) return NextResponse.json({ error: "Subida no encontrada." }, { status: 404 });

  const { error } = await supabase.from("peaje_statement_uploads").delete().eq("id", params.id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await borrarArchivoR2(subida.r2_key).catch((err) => console.error("No se pudo borrar el PDF de peaje en R2 (no crítico):", err));

  return NextResponse.json({ ok: true });
}
