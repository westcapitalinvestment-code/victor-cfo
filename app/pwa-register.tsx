"use client";

import { useEffect } from "react";

// Registra el service worker (public/sw.js) apenas carga la app — sin esto
// el navegador nunca considera instalable la PWA, aunque ya tenga el
// manifest.json y los íconos listos. Componente cliente aparte porque el
// layout raíz es un Server Component y no puede tener sus propios efectos.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silencioso a propósito — si falla (ej. navegador viejo, modo
      // incógnito con restricciones), la app sigue funcionando normal,
      // solo sin el beneficio de instalarse como PWA.
    });
  }, []);

  return null;
}
