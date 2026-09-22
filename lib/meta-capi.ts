import crypto from "crypto";
import { META_PIXEL_ID } from "@/lib/fbpixel";

// Meta Conversions API — el evento de "Purchase" que faltaba (22 sept 2026,
// pedido de Joel: "lo que haga falta para optimizar y coger más clientes").
// El Pixel del navegador (lib/fbpixel.ts) ya mandaba PageView/Lead/
// CompleteRegistration, pero nunca le avisaba a Meta cuando alguien de
// verdad PAGABA — sin esa señal, el algoritmo de Meta optimiza la campaña
// a ciegas (no puede aprender a quién mostrarle el anuncio para conseguir
// clientes reales, solo leads). Este archivo es server-only a propósito
// (usa `crypto` de Node) — nunca se importa desde un componente de cliente.
//
// Documentación: https://developers.facebook.com/docs/marketing-api/conversions-api

function sha256(valor: string): string {
  return crypto.createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}

type EventoCAPI = "Purchase" | "Lead" | "CompleteRegistration" | "StartTrial" | "InitiateCheckout";

export async function enviarEventoCAPI(params: {
  eventName: EventoCAPI;
  eventId?: string;
  eventSourceUrl?: string;
  email?: string | null;
  phone?: string | null;
  // Cookies _fbp/_fbc del navegador — capturadas en el momento del checkout
  // (app/api/stripe/checkout/route.ts) y guardadas en session.metadata,
  // porque para cuando Stripe llama al webhook ya no hay request del
  // navegador del que leerlas. Sin esto el evento igual se manda (Meta lo
  // acepta con solo el email hasheado), pero con peor calidad de match.
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  value?: number;
  currency?: string;
  customData?: Record<string, unknown>;
}) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    // Silencioso a propósito — igual que el pixel del navegador, esto nunca
    // debe tumbar un webhook de Stripe ni bloquear la activación de una
    // cuenta real solo porque falta configurar el tracking de anuncios.
    console.error("Meta CAPI: falta META_CAPI_ACCESS_TOKEN — evento no enviado:", params.eventName);
    return;
  }

  const userData: Record<string, unknown> = {};
  if (params.email) userData.em = [sha256(params.email)];
  if (params.phone) userData.ph = [sha256(params.phone.replace(/\D/g, ""))];
  if (params.fbp) userData.fbp = params.fbp;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.clientIp) userData.client_ip_address = params.clientIp;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  const customData: Record<string, unknown> = { ...params.customData };
  if (params.value !== undefined) {
    customData.value = params.value;
    customData.currency = params.currency || "usd";
  }

  const body = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: "website",
        event_source_url: params.eventSourceUrl || "https://www.victorcfo.com",
        user_data: userData,
        custom_data: customData,
      },
    ],
    // Código de prueba de Events Manager → pixel → "Test Events" — se deja
    // vacío en producción; Joel lo pone temporal en .env cuando quiera ver
    // los eventos llegando en vivo mientras prueba, sin tocar código.
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error("Meta CAPI respondió error:", res.status, texto);
    }
  } catch (err) {
    console.error("Meta CAPI: fallo de red al enviar evento:", err);
  }
}
