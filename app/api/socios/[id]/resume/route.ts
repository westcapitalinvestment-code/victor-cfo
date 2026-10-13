import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { urlDescargaR2 } from "@/lib/r2";

// Currículum de un candidato a socio (13 oct 2026) — solo el founder. Genera
// una URL firmada de R2 (5 min, bucket privado) y redirige. Se abre desde el
// botón "Ver currículum" del panel de Ventas.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin.from("socios").select("resume_key").eq("id", params.id).maybeSingle();
  if (!socio?.resume_key) {
    return NextResponse.json({ error: "Este candidato no subió currículum." }, { status: 404 });
  }

  const url = await urlDescargaR2(socio.resume_key);
  return NextResponse.redirect(url);
}
