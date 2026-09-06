import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivoR2 } from "@/lib/r2";

// Deshacer una subida de estado de cuenta completa (migración 0072, 6 sept
// 2026 — Joel subió un estado a la cuenta equivocada y no había forma
// exacta de deshacerlo). Borrar la fila de statement_uploads borra en
// cascada TODAS sus transacciones (FK ON DELETE CASCADE) — ni una más, ni
// una menos, porque cada transacción quedó enlazada a esta subida exacta
// desde el momento en que se importó.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = params;

  const { data: subida, error: errorBuscar } = await supabase
    .from("statement_uploads")
    .select("id, r2_key, total_importadas, nombre_archivo")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (errorBuscar || !subida) {
    return NextResponse.json({ error: "No se encontró esa subida." }, { status: 404 });
  }

  // Primero el archivo de R2 (si existe) — si esto falla, no importa, la
  // fila igual se borra; un archivo huérfano en R2 no hace daño a nadie.
  if (subida.r2_key) {
    try {
      await borrarArchivoR2(subida.r2_key);
    } catch (err) {
      console.error("No se pudo borrar el archivo de R2 (se continúa igual):", err);
    }
  }

  const { error: errorBorrar } = await supabase.from("statement_uploads").delete().eq("id", id).eq("owner_id", user.id);
  if (errorBorrar) {
    return NextResponse.json({ error: `No se pudo deshacer la importación: ${errorBorrar.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, transaccionesBorradas: subida.total_importadas });
}
