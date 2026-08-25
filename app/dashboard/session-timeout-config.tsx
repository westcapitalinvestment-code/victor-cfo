"use client";

import { useEffect, useState } from "react";

// Selector de "cerrar sesión tras X minutos de inactividad" — ver
// app/dashboard/session-timeout-gate.tsx, que es quien de verdad aplica
// esto. Vive en Configuración, mismo patrón que NotificacionesToggle/PinConfig.

const OPCIONES: { valor: number; etiqueta: string }[] = [
  { valor: 15, etiqueta: "15 minutos" },
  { valor: 30, etiqueta: "30 minutos" },
  { valor: 60, etiqueta: "1 hora" },
  { valor: 240, etiqueta: "4 horas" },
  { valor: 0, etiqueta: "Nunca" },
];

export default function SessionTimeoutConfig() {
  const [minutos, setMinutos] = useState<number | null>(null); // null = cargando
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session-timeout")
      .then((r) => r.json())
      .then((data) => setMinutos(typeof data?.minutos === "number" ? data.minutos : 15))
      .catch(() => setMinutos(15));
  }, []);

  async function cambiar(nuevoValor: number) {
    setGuardando(true);
    setError(null);
    const anterior = minutos;
    setMinutos(nuevoValor); // optimista — se revierte si falla
    try {
      const res = await fetch("/api/session-timeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutos: nuevoValor }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMinutos(anterior);
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (minutos === null) return null;

  return (
    <div className="vc-card mb-4">
      <p className="text-xs uppercase tracking-wide text-muted">Cerrar sesión por inactividad</p>
      <p className="mt-1 text-sm text-text">
        Si no usas la app por este tiempo, cierra la sesión de verdad y hay que entrar de nuevo con tu contraseña
        (más fuerte que el PIN).
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {OPCIONES.map((op) => (
          <button
            key={op.valor}
            onClick={() => cambiar(op.valor)}
            disabled={guardando}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium ${
              minutos === op.valor ? "border-teal text-teal" : "border-border text-muted"
            }`}
            style={minutos === op.valor ? { background: "rgba(29,158,117,.1)" } : undefined}
          >
            {op.etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red">{error}</p>}
    </div>
  );
}
