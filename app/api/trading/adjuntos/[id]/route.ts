import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivoR2 } from "@/lib/r2";

// Borra UN archivo de un trade (R2 + fila). Solo el dueño.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { data: a } = await supabase.from("trade_adjuntos").select("id, r2_key").eq("id", params.id).eq("owner_id", user.id).maybeSingle();
  if (!a) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  try {
    await borrarArchivoR2(a.r2_key);
  } catch (err) {
    console.error("Error borrando adjunto de trading en R2:", err);
  }
  const { error } = await supabase.from("trade_adjuntos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
