import webpush from "web-push";

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
