"use client";

import { useEffect, useState } from "react";

// Deja al usuario activar/cambiar/quitar el PIN de bloqueo rápido (ver
// app/dashboard/pin-gate.tsx). Vive en Configuración. Mismo patrón que
// NotificacionesToggle: fetch a un API route, sin guardar el PIN en
// ningún lado del cliente más allá de la memoria de este componente
// mientras se pide la confirmación de 2 pasos.

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

type Estado = "cargando" | "sin_pin" | "activo" | "creando" | "confirmando";

export default function PinConfig() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [primerPin, setPrimerPin] = useState("");
  const [digitos, setDigitos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/pin")
      .then((r) => r.json())
      .then((data) => setEstado(data?.configurado ? "activo" : "sin_pin"))
      .catch(() => setEstado("sin_pin"));
  }, []);

  function empezarCreacion() {
    setPrimerPin("");
    setDigitos("");
    setError(null);
    setEstado("creando");
  }

  function tocarDigito(d: string) {
    if (guardando) return;
    const nuevo = (digitos + d).slice(0, 4);
    setDigitos(nuevo);
    if (nuevo.length !== 4) return;

    if (estado === "creando") {
      setPrimerPin(nuevo);
      setDigitos("");
      setEstado("confirmando");
      return;
    }

    if (estado === "confirmando") {
      if (nuevo !== primerPin) {
        setError("Los PIN no coinciden. Empecemos de nuevo.");
        setDigitos("");
        setPrimerPin("");
        setEstado("creando");
        return;
      }
      guardarPin(nuevo);
    }
  }

  function borrar() {
    if (guardando) return;
    setDigitos((d) => d.slice(0, -1));
  }

  async function guardarPin(pin: string) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) throw new Error();
      setEstado("activo");
      setDigitos("");
      setPrimerPin("");
    } catch {
      setError("No se pudo guardar el PIN. Intenta de nuevo.");
      setEstado("sin_pin");
    } finally {
      setGuardando(false);
    }
  }

  async function quitarPin() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/pin", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEstado("sin_pin");
    } catch {
      setError("No se pudo quitar el PIN. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (estado === "cargando") return null;

  return (
    <div className="vc-card mb-4">
      <p className="text-xs uppercase tracking-wide text-muted">Bloqueo con PIN</p>

      {(estado === "sin_pin" || estado === "activo") && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-text">
            {estado === "activo"
              ? "Activado — te lo pide cada vez que abres o regresas a la app."
              : "Pide un PIN de 4 dígitos para abrir la app, aunque la sesión siga activa."}
          </p>
          <button
            onClick={estado === "activo" ? quitarPin : empezarCreacion}
            disabled={guardando}
            className={`ml-3 flex-shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium ${
              estado === "activo" ? "border-border text-muted" : "border-teal text-teal"
            }`}
            style={estado === "activo" ? undefined : { background: "rgba(29,158,117,.1)" }}
          >
            {guardando ? "..." : estado === "activo" ? "Desactivar" : "Activar"}
          </button>
        </div>
      )}

      {(estado === "creando" || estado === "confirmando") && (
        <div className="mt-3 flex flex-col items-center">
          <p className="mb-3 text-sm text-text">
            {estado === "creando" ? "Escribe un PIN nuevo de 4 dígitos" : "Escríbelo otra vez para confirmar"}
          </p>

          <div className="mb-4 flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-3 w-3 rounded-full border border-teal ${i < digitos.length ? "bg-teal" : ""}`} />
            ))}
          </div>

          {error && <p className="mb-3 text-xs text-red">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {TECLAS.map((n, i) =>
              n === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => (n === "⌫" ? borrar() : tocarDigito(n))}
                  disabled={guardando}
                  className="h-12 w-12 rounded-full border border-border text-base font-medium text-text active:bg-bg"
                >
                  {n}
                </button>
              )
            )}
          </div>

          <button onClick={() => setEstado("sin_pin")} className="mt-3 text-xs text-muted underline">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
