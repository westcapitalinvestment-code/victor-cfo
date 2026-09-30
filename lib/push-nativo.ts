import crypto from "crypto";
import http2 from "http2";
import type { PayloadNotificacion } from "@/lib/push";

// Envío de push NATIVO (APNs para iOS, FCM v1 para Android) — migración
// 0111, 30 sept 2026, app empacada con Capacitor para App Store/Google
// Play. Aparte de lib/push.ts (Web Push/VAPID, que sigue sirviendo para la
// PWA en el navegador).
//
// Deliberadamente sin SDKs pesados (firebase-admin, node-apn) — ambos
// protocolos son JWT + HTTPS, y Node ya trae `crypto` y `http2` de fábrica.
// Si las credenciales (env vars de abajo) no están configuradas todavía,
// cada función simplemente no manda nada — mismo criterio que el resto de
// integraciones de VICTOR (Plaid, R2, Stripe): el código queda listo, se
// activa el día que Joel pega las credenciales reales.

// ============================================================================
// Android — Firebase Cloud Messaging, HTTP v1 API (OAuth2 vía service account)
// ============================================================================

type TokenCache = { accessToken: string; expiraEn: number } | null;
let cacheTokenFCM: TokenCache = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function obtenerAccessTokenFCM(): Promise<string | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  if (cacheTokenFCM && cacheTokenFCM.expiraEn > Date.now() + 60_000) {
    return cacheTokenFCM.accessToken;
  }

  const cuenta = JSON.parse(raw) as { client_email: string; private_key: string };
  const ahora = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: cuenta.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: ahora + 3600,
      iat: ahora,
    })
  );
  const firma = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), cuenta.private_key);
  const jwt = `${header}.${claims}.${base64Url(firma)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cacheTokenFCM = { accessToken: json.access_token, expiraEn: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function enviarPushAndroid(
  token: string,
  payload: PayloadNotificacion
): Promise<{ ok: boolean; expirada: boolean }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!raw || !projectId) return { ok: false, expirada: false }; // no configurado — no-op silencioso

  const accessToken = await obtenerAccessTokenFCM();
  if (!accessToken) return { ok: false, expirada: false };

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? "/dashboard" },
      },
    }),
  });

  if (res.ok) return { ok: true, expirada: false };
  const detalle = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
  const expirada = detalle?.error?.status === "UNREGISTERED" || detalle?.error?.status === "NOT_FOUND";
  return { ok: false, expirada };
}

// ============================================================================
// iOS — Apple Push Notification service (APNs), HTTP/2 + token JWT (ES256)
// ============================================================================

let cacheJwtAPNs: { jwt: string; creadoEn: number } | null = null;

function obtenerJwtAPNs(): string | null {
  const key = process.env.APNS_AUTH_KEY; // contenido del archivo .p8, con los \n reales
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;

  // Apple recomienda reusar el mismo JWT hasta ~55 min (máximo permitido: 1h).
  if (cacheJwtAPNs && Date.now() - cacheJwtAPNs.creadoEn < 55 * 60_000) return cacheJwtAPNs.jwt;

  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const firma = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363", // APNs espera la firma ES256 "raw" (r||s), no DER
  });
  const jwt = `${header}.${claims}.${base64Url(firma)}`;
  cacheJwtAPNs = { jwt, creadoEn: Date.now() };
  return jwt;
}

async function enviarPushIOS(
  token: string,
  payload: PayloadNotificacion
): Promise<{ ok: boolean; expirada: boolean }> {
  const bundleId = process.env.APNS_BUNDLE_ID || "com.victorcfo.app";
  const host = process.env.APNS_HOST || "api.push.apple.com"; // api.sandbox.push.apple.com en desarrollo
  const jwt = obtenerJwtAPNs();
  if (!jwt) return { ok: false, expirada: false }; // no configurado — no-op silencioso

  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", () => resolve({ ok: false, expirada: false }));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("end", () => {
      client.close();
      const expirada = status === 410 || status === 400; // 410 = token viejo, 400 suele ser BadDeviceToken
      resolve({ ok: status === 200, expirada });
    });
    req.on("error", () => {
      client.close();
      resolve({ ok: false, expirada: false });
    });

    req.end(
      JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
        url: payload.url ?? "/dashboard",
      })
    );
  });
}

// ============================================================================
// Entrypoint único — dispatcha por plataforma
// ============================================================================

export async function enviarPushNativo(
  platform: "ios" | "android",
  token: string,
  payload: PayloadNotificacion
): Promise<{ ok: boolean; expirada: boolean }> {
  try {
    return platform === "ios" ? await enviarPushIOS(token, payload) : await enviarPushAndroid(token, payload);
  } catch {
    return { ok: false, expirada: false };
  }
}
