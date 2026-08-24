import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// Redirige a una URL firmada temporal (5 min) de UN archivo específico de
// document_files — un documento puede tener varios archivos, así que esto
// va por el id del archivo, no del documento. El bucket se queda privado;
// esta es la única forma de llegar a un archivo, y solo funciona si el
// que la pide es el dueño.
export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: archivo, error } = await supabase
    .from("document_files")
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
