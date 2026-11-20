import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// Redirige a una URL firmada temporal (5 min) del archivo. Bucket privado; solo el dueño.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  const { data: a } = await supabase.from("trade_adjuntos").select("r2_key").eq("id", params.id).eq("owner_id", user.id).maybeSingle();
  if (!a) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  return NextResponse.redirect(await urlDescargaR2(a.r2_key));
}
