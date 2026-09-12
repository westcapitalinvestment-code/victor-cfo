import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { borrarArchivoR2 } from "@/lib/r2";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";

// Elimina UN archivo de evidencia de un pago — de R2 y de
// vendor_retencion_attachments. Calcado de /api/facturas/adjuntos/[fileId].
// ownerId efectivo (12 sept 2026) — ver comentario en upload/route.ts.
export async function DELETE(req: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const efectivo = user.email ? await resolverOwnerEfectivo(supabase, user.email) : null;
  const ownerId = efectivo?.ownerId ?? user.id;

  const { data: archivo, error: fetchError } = await supabase
    .from("vendor_retencion_attachments")
    .select("id, r2_key")
    .eq("id", params.fileId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchError || !archivo) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  try {
    await borrarArchivoR2(archivo.r2_key);
  } catch (err) {
    console.error("Error borrando de R2:", err);
  }

  const { error: deleteError } = await supabase.from("vendor_retencion_attachments").delete().eq("id", params.fileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
