import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Link del portal en línea del cliente (migración 0157). Autoriza por RLS:
// si el usuario no ve a ese cliente, el 404 lo cubre. ?regenerar=1 rota el
// token (invalida el link anterior) por si se filtró.
export const dynamic = "force-dynamic";
const SITE_URL = "https://www.victorcfo.com";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  if (req.nextUrl.searchParams.get("regenerar") === "1") {
    const nuevo = crypto.randomUUID();
    const { data, error } = await supabase.from("clients").update({ portal_token: nuevo }).eq("id", params.id).select("portal_token").single();
    if (error || !data) return NextResponse.json({ error: "No se pudo regenerar el enlace." }, { status: 400 });
    return NextResponse.json({ ok: true, url: `${SITE_URL}/portal-cliente/${data.portal_token}` });
  }

  const { data, error } = await supabase.from("clients").select("portal_token").eq("id", params.id).single();
  if (error || !data) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, url: `${SITE_URL}/portal-cliente/${data.portal_token}` });
}
