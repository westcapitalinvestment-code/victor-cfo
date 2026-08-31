import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// Redirige a una URL firmada temporal (5 min) de UN archivo adjunto de
// factura — calcado de /api/documentos/archivo/[fileId]/ver.
export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: archivo, error } = await supabase
    .from("invoice_attachments")
    .select("r2_key")
    .eq("id", params.fileId)
    .eq("owner_id", user.id)
    .single();

  if (error || !archivo) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(archivo.r2_key);
  return NextResponse.redirect(url);
}
