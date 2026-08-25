"use client";

import { useEffect, useRef, useState } from "react";

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
  const intentosFallidos = useRef(0);

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
