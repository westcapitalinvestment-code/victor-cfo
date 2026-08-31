import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivoR2 } from "@/lib/r2";

// Elimina UN archivo adjunto de una factura — de R2 y de
// invoice_attachments. Calcado de /api/documentos/archivo/[fileId].
export async function DELETE(req: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: archivo, error: fetchError } = await supabase
    .from("invoice_attachments")
    .select("id, r2_key")
    .eq("id", params.fileId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !archivo) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  try {
    await borrarArchivoR2(archivo.r2_key);
  } catch (err) {
    console.error("Error borrando de R2:", err);
  }

  const { error: deleteError } = await supabase.from("invoice_attachments").delete().eq("id", params.fileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
