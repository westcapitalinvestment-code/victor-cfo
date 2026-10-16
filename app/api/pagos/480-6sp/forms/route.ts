import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

export const runtime = "nodejs";

// GET: lista de formularios guardados (con vendor). ?id=...&ver=1 → redirige a descarga.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const id = p.get("id");
  if (id) {
    const { data } = await supabase.from("vendor_480_forms").select("r2_key").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    return NextResponse.redirect(await urlDescargaR2((data as { r2_key: string }).r2_key));
  }
  const entityId = p.get("entityId");
  let q = supabase.from("vendor_480_forms").select("id, anio, enviado_en, enviado_a, created_at, vendors(name)").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(200);
  if (entityId) q = q.eq("entity_id", entityId);
  const { data } = await q;
  return NextResponse.json({ forms: data ?? [] });
}
