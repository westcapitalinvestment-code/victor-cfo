import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { normalizarShopDomain, validarCredenciales, registrarWebhookOrdenPagada } from "@/lib/shopify";

// Conectar Shopify a una entidad (migración 0109, 30 sept 2026) — integración
// directa vía webhook propio, no pasa por Zapier. El dueño pega 3 cosas
// desde su Admin de Shopify (Configuración → Apps y canales de venta →
// Desarrollar apps → crear/usar un Custom App con scope read_orders,
// read_customers): el dominio de la tienda, el Admin API access token, y el
// API secret key (para verificar la firma de los webhooks entrantes).
//
// Flujo: (1) valida que las credenciales de verdad abren esa tienda, (2)
// registra el webhook orders/paid apuntando al receptor público de VICTOR,
// (3) guarda todo cifrado en la entidad. Restringido al dueño real de la
// entidad, mismo criterio que Stripe Connect y el certificado de relevo.
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
  const shopDomainRaw = typeof body?.shopDomain === "string" ? body.shopDomain : "";
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  const webhookSecret = typeof body?.webhookSecret === "string" ? body.webhookSecret.trim() : "";

  if (!entityId || !shopDomainRaw.trim() || !accessToken || !webhookSecret) {
    return NextResponse.json(
      { error: "Faltan datos — se necesita el dominio de la tienda, el access token y el webhook secret." },
      { status: 400 }
    );
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

  const shopDomain = normalizarShopDomain(shopDomainRaw);
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shopDomain)) {
    return NextResponse.json(
      { error: 'El dominio debe verse como "tu-tienda.myshopify.com".' },
      { status: 400 }
    );
  }

  const validacion = await validarCredenciales(shopDomain, accessToken);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";
  const callbackUrl = `${origin}/api/webhooks/shopify`;

  const webhook = await registrarWebhookOrdenPagada(shopDomain, accessToken, callbackUrl);
  if (!webhook.ok) {
    return NextResponse.json({ error: webhook.error }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("business_entities")
    .update({
      shopify_shop_domain: shopDomain,
      shopify_access_token: encryptSecret(accessToken),
      shopify_webhook_secret: encryptSecret(webhookSecret),
      shopify_conectado: true,
      shopify_conectado_en: new Date().toISOString(),
    })
    .eq("id", entityId);

  if (updateError) {
    // El dominio es UNIQUE — si ya está conectado a otra entidad/cuenta,
    // Postgres devuelve un error de constraint que el usuario debe entender.
    const mensaje = updateError.message.includes("duplicate")
      ? "Esa tienda de Shopify ya está conectada a otra cuenta de VICTOR CFO."
      : updateError.message;
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tienda: validacion.nombreTienda });
}
