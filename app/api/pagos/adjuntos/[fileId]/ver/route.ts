import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";

// Redirige a una URL firmada temporal (5 min) de UN archivo de evidencia de
// un pago — calcado de /api/facturas/adjuntos/[fileId]/ver.
// ownerId efectivo (12 sept 2026) — ver comentario en upload/route.ts.
export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const efectivo = user.email ? await resolverOwnerEfectivo(supabase, user.email) : null;
  const ownerId = efectivo?.ownerId ?? user.id;

  const { data: archivo, error } = await supabase
    .from("vendor_retencion_attachments")
    .select("r2_key")
    .eq("id", params.fileId)
    .eq("owner_id", ownerId)
    .single();

  if (error || !archivo) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(archivo.r2_key);
  return NextResponse.redirect(url);
}
