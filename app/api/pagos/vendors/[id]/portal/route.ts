import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2, borrarArchivoR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
const SITE_URL = "https://www.victorcfo.com";

// Lado del DUEÑO del portal del contratista (migración 0207).
//  GET                      → { url, subidas[] } (enlace + envíos del contratista)
//  GET ?regenerar=1         → rota el token (invalida el enlace anterior)
//  GET ?ver=<subidaId>      → redirige al PDF enviado (URL firmada)
//  POST {id, accion}        → aplicar | rechazar un envío pendiente
// Autoriza por owner_id; el relevo/registro recién se aplican cuando el
// dueño lo acepta (el relevo cambia el % de retención).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  const p = req.nextUrl.searchParams;

  const ver = p.get("ver");
  if (ver) {
    const { data } = await supabase.from("vendor_portal_subidas").select("r2_key").eq("id", ver).eq("vendor_id", params.id).eq("owner_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    return NextResponse.redirect(await urlDescargaR2((data as { r2_key: string }).r2_key));
  }

  let token: string | null = null;
  if (p.get("regenerar") === "1") {
    const { data, error } = await supabase.from("vendors").update({ portal_token: crypto.randomUUID() }).eq("id", params.id).eq("owner_id", user.id).select("portal_token").single();
    if (error || !data) return NextResponse.json({ error: "No se pudo regenerar el enlace." }, { status: 400 });
    token = (data as { portal_token: string }).portal_token;
  } else {
    const { data, error } = await supabase.from("vendors").select("portal_token").eq("id", params.id).eq("owner_id", user.id).single();
    if (error || !data) return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
    token = (data as { portal_token: string }).portal_token;
  }

  const { data: subidas } = await supabase
    .from("vendor_portal_subidas")
    .select("id, tipo, estado, relevo_pct, relevo_fecha_expiracion, created_at")
    .eq("vendor_id", params.id)
    .eq("owner_id", user.id)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, url: `${SITE_URL}/portal-contratista/${token}`, subidas: subidas ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const accion = body?.accion;
  if (!id || (accion !== "aplicar" && accion !== "rechazar")) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: s } = await supabase
    .from("vendor_portal_subidas")
    .select("id, tipo, r2_key, relevo_pct, relevo_fecha_expiracion, estado")
    .eq("id", id).eq("vendor_id", params.id).eq("owner_id", user.id).maybeSingle();
  const sub = s as { id: string; tipo: string; r2_key: string; relevo_pct: number | null; relevo_fecha_expiracion: string | null; estado: string } | null;
  if (!sub || sub.estado !== "pendiente") return NextResponse.json({ error: "Envío no encontrado o ya resuelto." }, { status: 404 });

  if (accion === "aplicar") {
    const { data: v } = await supabase.from("vendors").select("relevo_r2_key, registro_comerciante_r2_key").eq("id", params.id).eq("owner_id", user.id).single();
    const vend = v as { relevo_r2_key: string | null; registro_comerciante_r2_key: string | null } | null;
    if (!vend) return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
    const cambios = sub.tipo === "relevo"
      ? { relevo_r2_key: sub.r2_key, relevo_pct: sub.relevo_pct, relevo_fecha_expiracion: sub.relevo_fecha_expiracion }
      : { registro_comerciante_r2_key: sub.r2_key };
    const { error } = await supabase.from("vendors").update(cambios).eq("id", params.id).eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const viejo = sub.tipo === "relevo" ? vend.relevo_r2_key : vend.registro_comerciante_r2_key;
    if (viejo) { try { await borrarArchivoR2(viejo); } catch (e) { console.error("No se pudo borrar el archivo anterior:", e); } }
  } else {
    try { await borrarArchivoR2(sub.r2_key); } catch (e) { console.error("No se pudo borrar el envío rechazado:", e); }
  }

  await supabase.from("vendor_portal_subidas")
    .update({ estado: accion === "aplicar" ? "aplicada" : "rechazada", resuelta_at: new Date().toISOString() })
    .eq("id", id).eq("owner_id", user.id);
  return NextResponse.json({ ok: true });
}
