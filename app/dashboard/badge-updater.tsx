"use client";

import { useEffect } from "react";

// Componente invisible (igual que PwaRegister) que pone/quita el numerito
// rojo sobre el ícono de la app instalada — Badging API, soportada en
// iOS 16.4+ pero SOLO cuando la PWA está instalada (no en un tab normal
// de Safari). Se recalcula cada vez que el dashboard carga y cada vez que
// el usuario vuelve a la pestaña/app (ej. la reabre desde el ícono) —
// así el número baja apenas categoriza algo, sin esperar a la próxima
// sincronización nocturna.
export default function BadgeUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("setAppBadge" in navigator)) return;

    async function actualizar() {
      try {
        const res = await fetch("/api/badge-count");
        if (!res.ok) return;
        const { count } = await res.json();
        if (count > 0) {
          await (navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
        } else {
          await (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
        }
      } catch {
        // Silencioso — el badge es un "nice to have", nunca debe tumbar el
        // resto de la app si falla el fetch o la API no está disponible.
      }
    }

    actualizar();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") actualizar();
    });
  }, []);

  return null;
}
