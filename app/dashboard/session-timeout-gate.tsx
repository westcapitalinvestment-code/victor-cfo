"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cierra la sesión DE VERDAD (supabase.auth.signOut(), no solo el PIN —
// ver pin-gate.tsx) después de X minutos sin actividad. Configurable en
// Configuración (session-timeout-config.tsx), 15 min por defecto. Esta es
// la capa de seguridad más fuerte: el PIN es una traba rápida de pantalla
// que no toca la sesión; esto sí obliga a volver a entrar con contraseña.
//
// Por qué localStorage y no un simple setTimeout: en el celular, el
// navegador puede congelar el JavaScript de la pestaña/PWA en segundo
// plano — un timer normal no correría mientras la app está minimizada. En
// cambio, guardar la marca de "última actividad" y comparar contra "ahora"
// SÍ funciona sin importar cuánto tiempo estuvo congelada la app, porque
// la comparación se hace justo cuando vuelve a primer plano.

const CLAVE_ULTIMA_ACTIVIDAD = "victor_ultima_actividad";
const EVENTOS_ACTIVIDAD = ["mousedown", "keydown", "touchstart", "scroll"];
const INTERVALO_CHEQUEO_MS = 60 * 1000; // revisa cada minuto mientras está abierta y visible

export default function SessionTimeoutGate() {
  const router = useRouter();
  const minutosRef = useRef<number | null>(null); // null = "Nunca" (o todavía no se sabe)

  function marcarActividad() {
    try {
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));
    } catch {}
  }

  async function cerrarSesionPorInactividad() {
    try {
      localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
    } catch {}
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?motivo=inactividad");
    router.refresh();
  }

  function verificarInactividad() {
    const minutos = minutosRef.current;
    if (!minutos) return; // "Nunca" — no se revisa nada

    let ultima: number | null = null;
    try {
      const guardado = localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD);
      ultima = guardado ? Number(guardado) : null;
    } catch {}

    if (ultima === null) {
      marcarActividad(); // primera vez que corre en este dispositivo, nada que comparar todavía
      return;
    }

    if (Date.now() - ultima >= minutos * 60 * 1000) {
      cerrarSesionPorInactividad();
    }
  }

  // Carga la preferencia guardada y revisa de una vez (por si la app
  // estuvo cerrada/congelada más tiempo del permitido).
  useEffect(() => {
    let cancelado = false;
    fetch("/api/session-timeout")
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        minutosRef.current = typeof data?.minutos === "number" && data.minutos > 0 ? data.minutos : null;
        verificarInactividad();
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actividad real del usuario reinicia el reloj. El chequeo periódico y el
  // de volver a primer plano SOLO comparan — nunca reinician el reloj por
  // sí solos, o nunca se cerraría la sesión de alguien que deja la app
  // abierta e inactiva en la pantalla.
  useEffect(() => {
    EVENTOS_ACTIVIDAD.forEach((ev) => document.addEventListener(ev, marcarActividad, { passive: true }));

    function alCambiarVisibilidad() {
      if (document.visibilityState === "visible") verificarInactividad();
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") verificarInactividad();
    }, INTERVALO_CHEQUEO_MS);

    return () => {
      EVENTOS_ACTIVIDAD.forEach((ev) => document.removeEventListener(ev, marcarActividad));
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
