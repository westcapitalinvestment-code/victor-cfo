"use client";

import { useState } from "react";

// Los errores que devuelve Stripe a veces traen una URL adentro del texto
// (ej. "...Visit your dashboard at https://dashboard.stripe.com/... to
// answer the questionnaire") — sin esto salía como texto plano y Joel tenía
// que seleccionar/copiar/pegar el link a mano (3 sept 2026, pedido de
// Joel). Esto parte el mensaje en pedazos y convierte cualquier URL en un
// link azul de verdad, abre en pestaña nueva.
function textoConLinks(texto: string) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g);
  return partes.map((parte, i) =>
    /^https?:\/\//.test(parte) ? (
      <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="text-teal underline">
        {parte}
      </a>
    ) : (
      <span key={i}>{parte}</span>
    )
  );
}

// Activación de cobro real con tarjeta vía Stripe Connect Standard
// (migración 0065, 3 sept 2026) — vive en el tab "Facturas" de EntidadForm,
// junto al checkbox "Stripe" de métodos de cobro. Solo aparece EDITANDO una
// entidad que ya existe (necesita un entityId real para crear/onboardear la
// cuenta de Stripe conectada).
export default function CobroTarjeta({
  entityId,
  cuentaId,
  chargesEnabled,
}: {
  entityId: string;
  cuentaId: string | null | undefined;
  chargesEnabled: boolean | null | undefined;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activar() {
    setCargando(true);
    setError(null);
    const res = await fetch("/api/stripe-connect/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId }),
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setCargando(false);
    setError(json?.error || "No se pudo conectar con Stripe. Intenta de nuevo en un momento.");
  }

  const estado: "sin_conectar" | "pendiente" | "activo" = chargesEnabled ? "activo" : cuentaId ? "pendiente" : "sin_conectar";

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Cobro con tarjeta (Stripe)</p>
          <p className="mt-0.5 text-xs text-muted">
            {estado === "activo" && "Activo — tus facturas pueden cobrarse con tarjeta de verdad, sin comisión extra de VICTOR."}
            {estado === "pendiente" && "Falta terminar de configurarlo en Stripe (identidad, cuenta bancaria)."}
            {estado === "sin_conectar" &&
              "Conecta o crea tu cuenta de Stripe — el dinero te cae directo a ti, VICTOR nunca lo toca ni cobra comisión."}
          </p>
        </div>
        {estado === "activo" ? (
          <span className="shrink-0 rounded-pill bg-teal/10 px-2 py-1 text-[11px] font-medium text-teal">Activo ✓</span>
        ) : (
          <button
            onClick={activar}
            disabled={cargando}
            className="shrink-0 rounded-lg border border-teal px-3 py-1.5 text-xs font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            {cargando ? "Abriendo..." : estado === "pendiente" ? "Continuar" : "Conectar Stripe"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red">{textoConLinks(error)}</p>}
    </div>
  );
}
