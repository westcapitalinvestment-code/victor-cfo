"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Arranque de capacidades nativas (30 sept 2026, app empacada con
// Capacitor para App Store/Google Play). Vive en app/dashboard/layout.tsx,
// junto a PinGate/SessionTimeoutGate — corre en TODAS las pantallas del
// dashboard, pero Capacitor.isNativePlatform() es false cuando VICTOR CFO
// corre en el navegador/PWA normal, así que este componente no hace nada
// (ni un import extra pesa) fuera de la app nativa.
//
// Aparte del toggle de Web Push en Configuración (notificaciones-toggle.tsx,
// que sigue sirviendo para la PWA instalada) — aquí no hay toggle, se pide
// el permiso nativo una sola vez al entrar al dashboard, como espera
// cualquier app de verdad (y como exige Apple para pasar review 4.2: uso
// real de push nativo, no solo web push envuelto).
export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelado = false;

    async function registrar() {
      try {
        const permiso = await PushNotifications.checkPermissions();
        let estado = permiso.receive;
        if (estado === "prompt" || estado === "prompt-with-rationale") {
          const pedido = await PushNotifications.requestPermissions();
          estado = pedido.receive;
        }
        if (estado !== "granted" || cancelado) return;

        await PushNotifications.register();
      } catch {
        // Best-effort — si el usuario niega el permiso o algo falla, la app
        // sigue funcionando normal, solo sin push nativo.
      }
    }

    const listenerRegistro = PushNotifications.addListener("registration", async (token) => {
      try {
        await fetch("/api/push/subscribe-nativo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: Capacitor.getPlatform(), token: token.value }),
        });
      } catch {
        // Best-effort, igual que arriba.
      }
    });

    registrar();

    return () => {
      cancelado = true;
      listenerRegistro.then((l) => l.remove());
    };
  }, []);

  return null;
}
