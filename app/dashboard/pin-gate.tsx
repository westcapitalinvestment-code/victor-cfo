"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { EVENTO_BLOQUEAR_POR_INACTIVIDAD } from "./session-timeout-gate";

// Bloqueo rápido de la app con PIN de 4 dígitos — envuelve TODO el
// contenido del dashboard (ver app/dashboard/layout.tsx). Si el usuario no
// ha activado un PIN en Configuración (app/dashboard/pin-config.tsx), esto
// no hace nada y pasa directo.
//
// Si sí lo activó, se bloquea:
//   1. Cada vez que la app carga de cero (abrir el ícono, recargar).
//   2. Cada vez que pasa a segundo plano y vuelve (cambiar de app, apagar
//      pantalla, minimizar) — vía el evento visibilitychange.
//
// OJO — alcance real de esto: el PIN NO reemplaza la sesión de Supabase,
// que sigue siendo la que de verdad protege los datos (RLS). Esto es una
// traba visual para que alguien que agarre el celular ya desbloqueado no
// pueda hojear datos financieros sin escribir el PIN primero — el mismo
// nivel de protección que el "app lock" de la mayoría de apps bancarias.

const MAX_INTENTOS = 5;
const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

type Estado = "cargando" | "sin_pin" | "bloqueado" | "desbloqueado";

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [digitos, setDigitos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [bloqueadoPorIntentos, setBloqueadoPorIntentos] = useState(false);
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [probandoBiometria, setProbandoBiometria] = useState(false);
  const intentosFallidos = useRef(0);
  const yaIntentoBiometriaAuto = useRef(false);

  useEffect(() => {
    fetch("/api/pin")
      .then((r) => r.json())
      .then((data) => setEstado(data?.configurado ? "bloqueado" : "sin_pin"))
      .catch(() => setEstado("sin_pin")); // si el chequeo falla, no dejamos a nadie afuera de su propia app
  }, []);

  useEffect(() => {
    if (estado === "sin_pin" || estado === "cargando") return;
    function alCambiarVisibilidad() {
      if (document.visibilityState === "hidden") {
        setEstado((actual) => (actual === "desbloqueado" ? "bloqueado" : actual));
        setDigitos("");
      }
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [estado]);

  // session-timeout-gate.tsx manda este evento tras X minutos sin
  // actividad — re-bloquea la pantalla sin tocar la sesión de Supabase
  // (un logout real no sirve de nada si el navegador tiene el
  // email/password guardados con autocompletar).
  useEffect(() => {
    if (estado === "sin_pin" || estado === "cargando") return;
    function alBloquearPorInactividad() {
      setEstado((actual) => (actual === "desbloqueado" ? "bloqueado" : actual));
      setDigitos("");
    }
    window.addEventListener(EVENTO_BLOQUEAR_POR_INACTIVIDAD, alBloquearPorInactividad);
    return () => window.removeEventListener(EVENTO_BLOQUEAR_POR_INACTIVIDAD, alBloquearPorInactividad);
  }, [estado]);

  async function intentarDesbloquear(pinCompleto: string) {
    setVerificando(true);
    setError(null);
    try {
      const res = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinCompleto }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        setEstado("desbloqueado");
        setDigitos("");
        intentosFallidos.current = 0;
      } else {
        intentosFallidos.current += 1;
        setDigitos("");
        if (intentosFallidos.current >= MAX_INTENTOS) {
          setBloqueadoPorIntentos(true);
          setError("Demasiados intentos. Cierra sesión y entra de nuevo con tu contraseña.");
        } else {
          setError(`PIN incorrecto (intento ${intentosFallidos.current} de ${MAX_INTENTOS}).`);
        }
      }
    } catch {
      setError("No se pudo verificar el PIN. Intenta de nuevo.");
      setDigitos("");
    } finally {
      setVerificando(false);
    }
  }

  // Face ID / Touch ID (30 sept 2026, app empacada con Capacitor) — solo
  // tiene sentido DENTRO de la app nativa; en el navegador/PWA no existe
  // este plugin. Ojo importante: la biometría solo confirma "esta es la
  // misma persona que ya tenía el celular desbloqueado" — NO reemplaza la
  // verificación del servidor. Por eso, tras un OK biométrico, igual se
  // hace un ping liviano a /api/pin (requiere sesión de Supabase viva)
  // antes de desbloquear — si la sesión expiró, la biometría sola no basta.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    BiometricAuth.checkBiometry()
      .then((r) => setBiometriaDisponible(r.isAvailable))
      .catch(() => setBiometriaDisponible(false));
  }, []);

  async function desbloquearConBiometria() {
    if (probandoBiometria || verificando || bloqueadoPorIntentos) return;
    setProbandoBiometria(true);
    setError(null);
    try {
      await BiometricAuth.authenticate({
        reason: "Desbloquea VICTOR CFO",
        cancelTitle: "Usar PIN",
        allowDeviceCredential: true,
      });
      const res = await fetch("/api/pin");
      if (!res.ok) throw new Error("sesión no válida");
      setEstado("desbloqueado");
      setDigitos("");
      intentosFallidos.current = 0;
    } catch {
      // Cancelado por el usuario, no disponible, o sesión inválida — se
      // queda en la pantalla de PIN normal, sin contar como intento fallido
      // (eso es solo para PINs incorrectos, no para biometría cancelada).
    } finally {
      setProbandoBiometria(false);
    }
  }

  // Intento automático UNA vez al entrar a la pantalla de bloqueo — así el
  // usuario no tiene que tocar nada si su celular ya reconoce su cara/huella,
  // igual que cualquier app nativa de verdad. Se resetea cada vez que se
  // vuelve a "bloqueado" (nuevo ciclo de bloqueo) para volver a intentar.
  useEffect(() => {
    if (estado !== "bloqueado" || !biometriaDisponible) {
      if (estado !== "bloqueado") yaIntentoBiometriaAuto.current = false;
      return;
    }
    if (yaIntentoBiometriaAuto.current) return;
    yaIntentoBiometriaAuto.current = true;
    desbloquearConBiometria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, biometriaDisponible]);

  function tocarDigito(d: string) {
    if (verificando || bloqueadoPorIntentos) return;
    const nuevo = (digitos + d).slice(0, 4);
    setDigitos(nuevo);
    if (nuevo.length === 4) intentarDesbloquear(nuevo);
  }

  function borrar() {
    if (verificando || bloqueadoPorIntentos) return;
    setDigitos((d) => d.slice(0, -1));
  }

  // Teclado físico (desktop) — antes solo se podía tocar los botones con
  // el mouse/touch. Escucha dígitos 0-9 y Backspace mientras la pantalla
  // de bloqueo está activa.
  useEffect(() => {
    if (estado !== "bloqueado") return;
    function alPresionarTecla(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        tocarDigito(e.key);
      } else if (e.key === "Backspace") {
        borrar();
      }
    }
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, digitos, verificando, bloqueadoPorIntentos]);

  if (estado === "cargando") {
    // Blanco/vacío mientras se sabe si hay PIN — evita el flash de un
    // segundo del contenido antes de decidir si hay que bloquear.
    return <div className="fixed inset-0 z-50 bg-bg" />;
  }

  if (estado === "sin_pin" || estado === "desbloqueado") {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
        <p className="mb-1 text-sm text-muted">VICTOR CFO está bloqueado</p>
        <p className="mb-6 text-lg font-medium">Escribe tu PIN</p>

        <div className="mb-6 flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-3.5 w-3.5 rounded-full border border-teal ${i < digitos.length ? "bg-teal" : ""}`} />
          ))}
        </div>

        {error && <p className="mb-4 max-w-xs text-center text-xs text-red">{error}</p>}

        {biometriaDisponible && !bloqueadoPorIntentos && (
          <button
            onClick={desbloquearConBiometria}
            disabled={probandoBiometria || verificando}
            className="mb-6 rounded-pill border border-teal px-4 py-2 text-sm font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            {probandoBiometria ? "Verificando..." : "Usar Face ID / Touch ID"}
          </button>
        )}

        {bloqueadoPorIntentos ? (
          <a href="/login" className="rounded-pill border border-teal px-4 py-2 text-sm font-medium text-teal">
            Ir a iniciar sesión
          </a>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {TECLAS.map((n, i) =>
              n === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => (n === "⌫" ? borrar() : tocarDigito(n))}
                  disabled={verificando}
                  className="h-14 w-14 rounded-full border border-border text-lg font-medium text-text active:bg-card"
                >
                  {n}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
