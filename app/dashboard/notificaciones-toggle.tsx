"use client";

import { useEffect, useState } from "react";

// Toggle real de notificaciones push — vive en Configuración. iOS/Safari
// SOLO deja suscribirse a push si la app está instalada (Agregar a
// pantalla de inicio) y en iOS 16.4 o más nuevo; en un tab normal del
// navegador, el botón avisa eso en vez de fallar en silencio.

// La llave pública VAPID llega en base64url (formato que da web-push) pero
// el navegador la pide como Uint8Array — conversión estándar, no hay forma
// de saltársela.
function base64UrlAUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type Estado = "cargando" | "no_soportado" | "no_instalada" | "desactivada" | "activada" | "error";

export default function NotificacionesToggle() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    async function detectar() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEstado("no_soportado");
        return;
      }

      // display-mode "standalone" cubre Android/desktop; navigator.standalone
      // es el flag viejo específico de iOS Safari — hace falta chequear los
      // dos porque iOS no siempre reporta bien el primero.
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (!instalada) {
        setEstado("no_instalada");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub ? "activada" : "desactivada");
      } catch {
        setEstado("error");
      }
    }
    detectar();
  }, []);

  async function activar() {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado("desactivada");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Falta la llave pública VAPID.");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // "as BufferSource" — TypeScript 5.5+ distingue ArrayBuffer de
        // SharedArrayBuffer de forma más estricta que antes, y por eso
        // marca un Uint8Array normal como "incompatible" con el tipo que
        // pide el navegador para applicationServerKey, aunque en tiempo de
        // ejecución es exactamente el dato correcto que Push API espera.
        applicationServerKey: base64UrlAUint8Array(publicKey) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la suscripción.");

      setEstado("activada");
    } catch {
      setEstado("error");
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("desactivada");
    } catch {
      setEstado("error");
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === "cargando") return null;

  return (
    <div className="vc-card mb-4">
      <p className="text-sm font-semibold">Notificaciones</p>

      {estado === "no_soportado" && (
        <p className="mt-2 text-sm text-muted">Tu navegador no soporta notificaciones push todavía.</p>
      )}

      {estado === "no_instalada" && (
        <p className="mt-2 text-sm text-muted">
          Para recibir avisos (documentos por vencer, gastos sin categorizar) primero instala VICTOR CFO en tu
          celular: en Safari/Chrome toca "Compartir" → "Agregar a pantalla de inicio", y entra a la app desde ese
          ícono.
        </p>
      )}

      {estado === "error" && (
        <p className="mt-2 text-sm text-red">No se pudo activar las notificaciones. Intenta de nuevo en un momento.</p>
      )}

      {(estado === "desactivada" || estado === "activada") && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-text">
            {estado === "activada"
              ? "Activadas — te avisamos de documentos por vencer y gastos sin categorizar."
              : "Recibe un aviso cuando tengas documentos por vencer o gastos sin categorizar."}
          </p>
          <button
            onClick={estado === "activada" ? desactivar : activar}
            disabled={trabajando}
            className={`ml-3 flex-shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium ${
              estado === "activada" ? "border-border text-muted" : "border-teal text-teal"
            }`}
            style={estado === "activada" ? undefined : { background: "rgba(29,158,117,.1)" }}
          >
            {trabajando ? "..." : estado === "activada" ? "Desactivar" : "Activar"}
          </button>
        </div>
      )}
    </div>
  );
}
