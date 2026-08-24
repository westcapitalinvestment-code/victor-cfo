import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// Redirige a una URL firmada temporal (5 min) del archivo en R2 — el
// bucket se queda privado, así que este endpoint es la ÚNICA forma de
// llegar al archivo, y solo funciona si el que pide la URL es el dueño
// del documento. No hay link permanente que se pueda copiar y compartir.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select("r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !doc || !doc.r2_key) {
    return NextResponse.json({ error: "Este documento no tiene archivo adjunto." }, { status: 404 });
  }

  const url = await urlDescargaR2(doc.r2_key);
  return NextResponse.redirect(url);
}
