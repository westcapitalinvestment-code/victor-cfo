import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";

// Helper único para mandar notificaciones push de verdad (Web Push /
// VAPID) — lo usa tanto el cron diario (lib/push.ts → notificaciones-push)
// como cualquier ruta futura que quiera avisarle algo urgente al usuario
// en su celular, sin tener que abrir la app.
//
// VAPID = las "credenciales" del servidor para poder mandar push sin
// depender de Firebase/Apple directamente — el navegador (o iOS/Safari)
// verifica que el push venga de nosotros usando la llave pública que el
// celular ya guardó al suscribirse.

let vapidConfigurado = false;

function asegurarVapid() {
  if (vapidConfigurado) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:soporte@victorcfo.app";

  if (!publicKey || !privateKey) {
    throw new Error("Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY para mandar notificaciones push.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
}

export type SuscripcionPush = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PayloadNotificacion = {
  title: string;
  body: string;
  url?: string; // a dónde llevar al usuario si toca la notificación — default "/dashboard"
};

// Resultado por suscripción — el llamador (el cron) usa `expirada` para
// saber cuáles borrar de push_subscriptions (el navegador/iOS revoca
// suscripciones viejas todo el tiempo — un 404/410 del propio servicio de
// push es la señal estándar de "esta ya no sirve, bórrala").
export async function enviarPush(
  sub: SuscripcionPush,
  payload: PayloadNotificacion
): Promise<{ ok: boolean; expirada: boolean; error?: string }> {
  asegurarVapid();

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({ ...payload, url: payload.url ?? "/dashboard" })
    );
    return { ok: true, expirada: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const expirada = statusCode === 404 || statusCode === 410;
    return {
      ok: false,
      expirada,
      error: err instanceof Error ? err.message : "Error desconocido enviando push.",
    };
  }
}

// Avisarle a Joel (el founder) por push a su celular — pensado para cosas
// que no pueden esperar a que revise su correo, como una escalación del
// agente de soporte de VICTOR (21 sept 2026: "necesito algo que me avise
// que llego un email de un cliente de Victor"). Reusa el mismo
// push_subscriptions/VAPID que ya tiene la PWA para sus propios avisos
// diarios — si Joel nunca activó notificaciones en su celular, esto
// simplemente no manda nada (best-effort, nunca lanza).
export async function notificarFounder(payload: PayloadNotificacion): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: usuarios } = await admin.from("users").select("id, email");
    const founderId = usuarios?.find((u) => esFounder(u.email))?.id;
    if (!founderId) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("owner_id", founderId);
    if (!subs || subs.length === 0) return;

    for (const sub of subs) {
      const resultado = await enviarPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload
      );
      if (resultado.expirada) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  } catch {
    // Best-effort — un fallo aquí nunca debe tumbar el flujo que lo llamó
    // (ej. el webhook de soporte, que ya mandó el correo de escalación).
  }
}
