import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Desconectar Shopify de una entidad — no borra el webhook del lado de
// Shopify (requeriría guardar el webhook id; total, si el dueño reconecta
// más adelante registrarWebhookOrdenPagada() detecta que ya existe y no
// duplica). Solo limpia las credenciales guardadas en VICTOR, así que
// aunque el webhook de Shopify siga llamando, el receptor ya no encuentra
// una entidad shopify_conectado=true para ese dominio y lo ignora.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const entityId = typeof body?.entityId === "string" ? body.entityId : null;
  if (!entityId) {
    return NextResponse.json({ error: "Falta el ID de la entidad." }, { status: 400 });
  }

  const { data: entidad, error: errorEntidad } = await supabase
    .from("business_entities")
    .select("id")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (errorEntidad || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("business_entities")
    .update({
      shopify_shop_domain: null,
      shopify_access_token: null,
      shopify_webhook_secret: null,
      shopify_conectado: false,
    })
    .eq("id", entityId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
