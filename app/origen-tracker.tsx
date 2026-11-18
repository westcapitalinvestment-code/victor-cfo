"use client";

import { useEffect } from "react";

// Guarda de dónde llegó la persona (18 nov 2026, pedido de Joel: comparar
// los anuncios "gratis", "Core" y "negocio", y luego los enlaces por
// cooperativa). Si la URL trae utm_* o ?coop=, se guarda en una cookie
// propia de VICTOR por 30 días — solo el PRIMER toque: si la cookie ya
// existe no se pisa. Al crear la cuenta, el servidor la lee una vez y la
// copia a users.origen (lib/origen-registro.ts). No es un cookie de
// terceros ni se comparte con nadie.
const CLAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "coop"] as const;
const COOKIE = "vc_origen";

export default function OrigenTracker() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) return;
      const params = new URLSearchParams(window.location.search);
      const origen: Record<string, string> = {};
      for (const k of CLAVES) {
        const v = params.get(k);
        if (v) origen[k] = v.slice(0, 100);
      }
      if (Object.keys(origen).length === 0) return;
      origen.landing = window.location.pathname.slice(0, 100);
      if (document.referrer) {
        try {
          origen.referrer = new URL(document.referrer).hostname.slice(0, 100);
        } catch {
          // referrer raro — se ignora
        }
      }
      origen.capturado_en = new Date().toISOString();
      const valor = encodeURIComponent(JSON.stringify(origen));
      document.cookie = `${COOKIE}=${valor}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax; Secure`;
    } catch {
      // Silencioso a propósito: nunca debe romper la página.
    }
  }, []);

  return null;
}
