import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlDescargaR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descarga de SU copia del 480.6SP desde el portal del contratista. El token
// identifica al contratista; el formulario tiene que ser de ese mismo vendor.
export async function GET(_req: NextRequest, { params }: { params: { token: string; id: string } }) {
  if (!TOKEN_RE.test(params.token)) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const supabase = createAdminClient();
  const { data: v } = await supabase.from("vendors").select("id").eq("portal_token", params.token).maybeSingle();
  if (!v) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const { data: f } = await supabase
    .from("vendor_480_forms")
    .select("r2_key")
    .eq("id", params.id)
    .eq("vendor_id", (v as { id: string }).id)
    .maybeSingle();
  if (!f) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.redirect(await urlDescargaR2((f as { r2_key: string }).r2_key));
}
