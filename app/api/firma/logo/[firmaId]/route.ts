import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlDescargaR2 } from "@/lib/r2";

// Sirve el logo de una firma de contadores (redirige a una URL firmada de R2).
// Lo puede ver: la propia firma, o un cliente que esa firma tiene bajo su plan
// (billed_by_firma_id). Cualquier otro usuario recibe 404.
export async function GET(_req: NextRequest, { params }: { params: { firmaId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const admin = createAdminClient();

  if (user.id !== params.firmaId) {
    const { data: yo } = await admin.from("users").select("billed_by_firma_id").eq("id", user.id).maybeSingle();
    if (yo?.billed_by_firma_id !== params.firmaId) {
      return NextResponse.json({ error: "Logo no encontrado." }, { status: 404 });
    }
  }

  const { data: firma } = await admin.from("users").select("firma_logo_r2_key").eq("id", params.firmaId).maybeSingle();
  if (!firma?.firma_logo_r2_key) return NextResponse.json({ error: "Logo no encontrado." }, { status: 404 });

  const url = await urlDescargaR2(firma.firma_logo_r2_key as string);
  return NextResponse.redirect(url);
}
