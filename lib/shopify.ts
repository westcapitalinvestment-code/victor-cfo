import crypto from "crypto";

// Helpers de la integración directa con Shopify (migración 0109, 30 sept
// 2026, pedido de Joel: webhook propio, NO vía Zapier). Dos cosas viven
// aquí: (1) verificar que un webhook entrante de verdad viene de Shopify
// (HMAC), y (2) hablar con el Admin REST API de Shopify para validar las
// credenciales que el dueño pega en Configuración y registrar el webhook
// de "orden pagada".

// Shopify firma cada webhook con HMAC-SHA256 usando el "API secret key" del
// Custom App (Configuración → Apps y canales de venta → Desarrollar apps →
// tu app → API credentials), en base64, sobre el CUERPO CRUDO del POST —
// nunca sobre el JSON ya parseado (reordenar/reserializar las llaves
// rompería la firma). header: X-Shopify-Hmac-Sha256.
export function verificarFirmaWebhook(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  // Comparación a tiempo constante — evita timing attacks en el compare.
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// El shop domain se guarda/compara siempre como "xxxx.myshopify.com" — el
// dueño a veces pega la URL completa (https://...) o con espacios.
export function normalizarShopDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

type ShopifyApiError = { error: string };

// Confirma que el shop domain + access token son válidos y pertenecen a la
// misma tienda — se llama una vez al conectar, antes de guardar nada.
export async function validarCredenciales(
  shopDomain: string,
  accessToken: string
): Promise<{ ok: true; nombreTienda: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "El Admin API access token no es válido para esta tienda." };
      }
      if (res.status === 404) {
        return { ok: false, error: "No se encontró una tienda de Shopify con ese dominio." };
      }
      return { ok: false, error: `Shopify respondió con error (${res.status}).` };
    }
    const json = (await res.json()) as { shop?: { name?: string } };
    return { ok: true, nombreTienda: json.shop?.name ?? shopDomain };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo conectar con Shopify." };
  }
}

// Registra (o confirma que ya existe) el webhook orders/paid apuntando al
// receptor público de VICTOR. Shopify no deja registrar el mismo topic+url
// dos veces — si ya existe uno igual, lo dejamos tal cual en vez de fallar.
export async function registrarWebhookOrdenPagada(
  shopDomain: string,
  accessToken: string,
  callbackUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const existentesRes = await fetch(`https://${shopDomain}/admin/api/2024-10/webhooks.json?topic=orders/paid`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (existentesRes.ok) {
      const existentes = (await existentesRes.json()) as { webhooks?: { address?: string }[] };
      const yaExiste = (existentes.webhooks ?? []).some((w) => w.address === callbackUrl);
      if (yaExiste) return { ok: true };
    }

    const res = await fetch(`https://${shopDomain}/admin/api/2024-10/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook: { topic: "orders/paid", address: callbackUrl, format: "json" },
      }),
    });
    if (!res.ok) {
      const detalle = (await res.json().catch(() => null)) as ShopifyApiError | null;
      return { ok: false, error: detalle?.error ?? `No se pudo registrar el webhook (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo registrar el webhook." };
  }
}

// Forma mínima de lo que trae el payload real de orders/paid que este
// receptor usa — Shopify manda muchos más campos, solo tipamos lo que
// consumimos.
export type ShopifyOrderPaidPayload = {
  id: number | string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  created_at: string;
  customer?: {
    id: number | string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  email?: string | null;
  line_items?: { title: string; quantity: number; price: string }[];
};
