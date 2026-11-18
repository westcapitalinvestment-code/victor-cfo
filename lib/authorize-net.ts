import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";

// Cobro con tarjeta por B2B Merchant (Authorize.Net) — 18 nov 2026, pedido de
// Joel tras la reunión con B2B Merchant. Funciona igual que Stripe en VICTOR:
//   1. El negocio pone sus credenciales en Configuración (se guardan cifradas).
//   2. El link estable /api/facturas/[id]/pagar pide un token de "Accept
//      Hosted" (página de pago de Authorize.Net, PCI SAQ-A: la tarjeta nunca
//      pasa por VICTOR) y manda al cliente allí.
//   3. Authorize.Net avisa por webhook (net.authorize.payment.authcapture.created)
//      a /api/authorize-net/webhook/[entityId]; se verifica la firma, se
//      confirma la transacción con su API y se marca la factura pagada.

export type AmbienteAuthnet = "sandbox" | "produccion";

export type CredencialesAuthnet = {
  apiLoginId: string;
  transactionKey: string;
  signatureKey: string | null;
  ambiente: AmbienteAuthnet;
};

const URLS = {
  sandbox: {
    api: "https://apitest.authorize.net/xml/v1/request.api",
    rest: "https://apitest.authorize.net/rest/v1",
    pago: "https://test.authorize.net/payment/payment",
  },
  produccion: {
    api: "https://api.authorize.net/xml/v1/request.api",
    rest: "https://api.authorize.net/rest/v1",
    pago: "https://accept.authorize.net/payment/payment",
  },
} as const;

const ORIGEN = "https://www.victorcfo.com";

export function urlsAuthnet(ambiente: AmbienteAuthnet) {
  return URLS[ambiente] ?? URLS.sandbox;
}

// La API JSON de Authorize.Net responde con un BOM al principio — JSON.parse
// falla si no se quita.
async function llamarApi(ambiente: AmbienteAuthnet, cuerpo: unknown): Promise<any> {
  const res = await fetch(urlsAuthnet(ambiente).api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const texto = (await res.text()).replace(/^﻿/, "");
  return JSON.parse(texto);
}

function errorDe(respuesta: any): string {
  const m = respuesta?.messages?.message?.[0];
  return m ? `${m.code}: ${m.text}` : "Authorize.Net no respondió como se esperaba.";
}

// Verifica que el API Login ID y la Transaction Key funcionan.
export async function probarCredenciales(c: Pick<CredencialesAuthnet, "apiLoginId" | "transactionKey" | "ambiente">) {
  const r = await llamarApi(c.ambiente, {
    authenticateTestRequest: { merchantAuthentication: { name: c.apiLoginId, transactionKey: c.transactionKey } },
  });
  return r?.messages?.resultCode === "Ok" ? { ok: true as const } : { ok: false as const, error: errorDe(r) };
}

// Registra (o reusa) el webhook de pagos de esta entidad en su cuenta.
export async function registrarWebhook(c: CredencialesAuthnet, entityId: string): Promise<{ ok: true; webhookId: string } | { ok: false; error: string }> {
  const auth = "Basic " + Buffer.from(`${c.apiLoginId}:${c.transactionKey}`).toString("base64");
  const base = urlsAuthnet(c.ambiente).rest;
  const url = `${ORIGEN}/api/authorize-net/webhook/${entityId}`;
  try {
    const lista = await fetch(`${base}/webhooks`, { headers: { Authorization: auth }, cache: "no-store" });
    if (lista.ok) {
      const existentes = (await lista.json()) as Array<{ webhookId: string; url: string }>;
      const ya = Array.isArray(existentes) ? existentes.find((w) => w.url === url) : undefined;
      if (ya) return { ok: true, webhookId: ya.webhookId };
    }
    // Se intenta primero con nombre y, si Authorize.Net rechaza los campos
    // ("Field validation errors"), otra vez sin nombre — el nombre es
    // opcional y es la causa más común de ese rechazo (18 nov 2026).
    const intentos = [
      { name: "VICTOR CFO pagos", url, eventTypes: ["net.authorize.payment.authcapture.created"], status: "active" },
      { url, eventTypes: ["net.authorize.payment.authcapture.created"], status: "active" },
    ];
    let ultimoError = "";
    for (const cuerpo of intentos) {
      const res = await fetch(`${base}/webhooks`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        cache: "no-store",
      });
      const texto = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(texto);
      } catch {
        // respuesta no JSON
      }
      if (res.ok && json?.webhookId) return { ok: true, webhookId: json.webhookId };
      // Detalle completo para poder diagnosticar (no trae secretos).
      ultimoError = `${res.status} ${json?.reason || ""} ${json?.message || ""} ${texto.slice(0, 300)}`.trim();
    }
    return { ok: false, error: ultimoError || "Authorize.Net no aceptó el webhook." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo crear el webhook." };
  }
}

export async function credencialesDeEntidad(entityId: string): Promise<CredencialesAuthnet | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("business_entities")
    .select("authnet_api_login_id, authnet_transaction_key_enc, authnet_signature_key_enc, authnet_ambiente, authnet_activo")
    .eq("id", entityId)
    .maybeSingle();
  if (!data?.authnet_activo || !data.authnet_api_login_id || !data.authnet_transaction_key_enc) return null;
  return {
    apiLoginId: data.authnet_api_login_id,
    transactionKey: decryptSecret(data.authnet_transaction_key_enc),
    signatureKey: data.authnet_signature_key_enc ? decryptSecret(data.authnet_signature_key_enc) : null,
    ambiente: (data.authnet_ambiente as AmbienteAuthnet) || "sandbox",
  };
}

// Firma del webhook: X-ANET-Signature = "sha512=<HMAC-SHA512 del cuerpo>"
// con la Signature Key. Se acepta la llave como texto o como bytes hex
// (los ejemplos de Authorize.Net usan las dos formas).
export function firmaValida(cuerpo: string, encabezado: string | null, signatureKey: string): boolean {
  if (!encabezado) return false;
  const recibido = encabezado.replace(/^sha512=/i, "").trim().toUpperCase();
  const candidatos = [crypto.createHmac("sha512", signatureKey).update(cuerpo).digest("hex").toUpperCase()];
  if (/^[0-9a-fA-F]+$/.test(signatureKey) && signatureKey.length % 2 === 0) {
    candidatos.push(crypto.createHmac("sha512", Buffer.from(signatureKey, "hex")).update(cuerpo).digest("hex").toUpperCase());
  }
  return candidatos.some((c) => c.length === recibido.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(recibido)));
}

export async function detalleTransaccion(c: CredencialesAuthnet, transId: string): Promise<any | null> {
  const r = await llamarApi(c.ambiente, {
    getTransactionDetailsRequest: {
      merchantAuthentication: { name: c.apiLoginId, transactionKey: c.transactionKey },
      transId,
    },
  });
  return r?.messages?.resultCode === "Ok" ? r.transaction ?? null : null;
}

// Página intermedia que manda al cliente a la página de pago de
// Authorize.Net. Accept Hosted exige un POST con el token (no un link GET),
// así que se responde un formulario que se envía solo.
export async function paginaPagoAuthnet(facturaId: string): Promise<
  { ok: true; html: string } | { ok: false; error: string; status: number } | { ok: "no-configurado" }
> {
  const admin = createAdminClient();
  const { data: factura } = await admin
    .from("invoices")
    .select("id, numero, total, estado, entity_id, authnet_ref, business_entities(name, authnet_activo)")
    .eq("id", facturaId)
    .maybeSingle();
  if (!factura) return { ok: false, error: "Factura no encontrada.", status: 404 };

  const entidad = (factura as any).business_entities as { name: string; authnet_activo: boolean } | null;
  if (!entidad?.authnet_activo) return { ok: "no-configurado" };
  if (factura.estado === "pagada") return { ok: false, error: "Esta factura ya está pagada.", status: 400 };

  const total = Number((factura as any).total ?? 0);
  if (!(total > 0)) return { ok: false, error: "La factura no tiene un total válido para cobrar.", status: 400 };

  const c = await credencialesDeEntidad((factura as any).entity_id);
  if (!c) return { ok: "no-configurado" };

  // Referencia corta (20 caracteres) para casar el pago en el webhook.
  const ref = (factura as any).authnet_ref || factura.id.replace(/-/g, "").slice(0, 20);
  if (!(factura as any).authnet_ref) {
    await admin.from("invoices").update({ authnet_ref: ref }).eq("id", factura.id);
  }

  const volver = `${ORIGEN}/cobro/${factura.id}`;
  const r = await llamarApi(c.ambiente, {
    getHostedPaymentPageRequest: {
      merchantAuthentication: { name: c.apiLoginId, transactionKey: c.transactionKey },
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: total.toFixed(2),
        order: {
          invoiceNumber: ref,
          description: `Factura ${(factura as any).numero ?? ""} - ${entidad.name ?? ""}`.slice(0, 255),
        },
      },
      hostedPaymentSettings: {
        setting: [
          {
            settingName: "hostedPaymentReturnOptions",
            settingValue: JSON.stringify({
              showReceipt: true,
              url: `${volver}?b2b=1`,
              urlText: "Volver",
              cancelUrl: volver,
              cancelUrlText: "Cancelar",
            }),
          },
          { settingName: "hostedPaymentButtonOptions", settingValue: JSON.stringify({ text: "Pagar" }) },
          { settingName: "hostedPaymentOrderOptions", settingValue: JSON.stringify({ show: true, merchantName: entidad.name ?? "" }) },
          {
            settingName: "hostedPaymentPaymentOptions",
            settingValue: JSON.stringify({ cardCodeRequired: true, showCreditCard: true, showBankAccount: false }),
          },
        ],
      },
    },
  });

  if (r?.messages?.resultCode !== "Ok" || !r.token) {
    return { ok: false, error: `No se pudo abrir el pago con B2B Merchant (${errorDe(r)}).`, status: 502 };
  }

  const accion = urlsAuthnet(c.ambiente).pago;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Abriendo el pago…</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#444">
<form id="f" method="post" action="${accion}"><input type="hidden" name="token" value="${r.token}"/><noscript><button type="submit">Continuar al pago</button></noscript></form>
<p>Abriendo la página de pago segura…</p>
<script>document.getElementById('f').submit();</script></body></html>`;
  return { ok: true, html };
}
