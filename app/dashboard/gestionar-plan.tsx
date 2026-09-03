"use client";

import { useState } from "react";

// Botón "Gestionar mi plan" en Config — abre el Customer Portal de Stripe,
// donde el usuario puede cancelar su suscripción, cambiar su tarjeta o ver
// sus recibos. No mostramos nada de esto dentro de VICTOR mismo (evita
// duplicar UI que Stripe ya hace bien y de forma segura).
export default function GestionarPlan() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrirPortal() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(false);
    setError(json?.error || "No se pudo abrir el portal de pago. Intenta de nuevo en un momento.");
  }

  return (
    <div className="vc-card mb-4">
      <p className="mb-2 text-sm font-medium">Facturación</p>
      <p className="mb-3 text-xs text-muted">
        Cambia tu tarjeta, revisa tus recibos o cancela tu suscripción cuando quieras.
      </p>
      {error && <p className="mb-2 text-xs text-red">{error}</p>}
      <button
        onClick={abrirPortal}
        disabled={loading}
        className="w-full rounded-lg border border-teal p-3 text-sm font-medium text-teal"
        style={{ background: "rgba(29,158,117,.1)" }}
      >
        {loading ? "Abriendo..." : "Gestionar mi plan"}
      </button>
    </div>
  );
}
