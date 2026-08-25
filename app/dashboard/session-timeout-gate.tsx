"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Reacciona a X minutos sin actividad. Configurable en Configuración
// (session-timeout-config.tsx), 15 min por defecto.
//
// Comportamiento (24 agosto 2026, ajustado a pedido de Joel): si el
// usuario tiene PIN activo (pin-gate.tsx), esto SOLO re-bloquea la
// pantalla con el PIN — no cierra la sesión de Supabase. Un
// supabase.auth.signOut() real no protege nada en la práctica cuando el
// navegador/PWA tiene el email y password guardados con autocompletar:
// cualquiera que agarre el celular puede tocar "Entrar" con los campos ya
// llenos y pasar sin escribir nada. El PIN si obliga a escribir algo. Solo
// si el usuario NO tiene PIN activo, esto cae al signOut real como único
// mecanismo de protección disponible.
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

// pin-gate.tsx escucha este evento para re-bloquear la pantalla sin tocar
// la sesión de Supabase.
export const EVENTO_BLOQUEAR_POR_INACTIVIDAD = "victor:bloquear-por-inactividad";

export default function SessionTimeoutGate() {
  const router = useRouter();
  const minutosRef = useRef<number | null>(null); // null = "Nunca" (o todavía no se sabe)
  const pinActivoRef = useRef(false);

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

  function reaccionarAInactividad() {
    if (pinActivoRef.current) {
      // Con PIN activo, solo re-bloqueamos la pantalla — la sesión sigue
      // viva. Reiniciamos la marca de actividad para no disparar esto de
      // nuevo en cada chequeo mientras la pantalla de PIN está mostrada.
      marcarActividad();
      window.dispatchEvent(new Event(EVENTO_BLOQUEAR_POR_INACTIVIDAD));
    } else {
      cerrarSesionPorInactividad();
    }
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
      reaccionarAInactividad();
    }
  }

  // Carga la preferencia de tiempo Y si hay PIN activo, y revisa de una vez
  // (por si la app estuvo cerrada/congelada más tiempo del permitido).
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      fetch("/api/session-timeout").then((r) => r.json()),
      fetch("/api/pin").then((r) => r.json()),
    ])
      .then(([datosTimeout, datosPin]) => {
        if (cancelado) return;
        minutosRef.current =
          typeof datosTimeout?.minutos === "number" && datosTimeout.minutos > 0 ? datosTimeout.minutos : null;
        pinActivoRef.current = !!datosPin?.configurado;
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
