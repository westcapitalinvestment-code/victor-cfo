"use client";

import { useState } from "react";

// Créditos extra de IA — 3 sept 2026, migración 0064, pedido de Joel: "ese
// limite lo podemos resolver poniendo un addon de creditos de AI como hace
// Anthropic". A diferencia de GestionarPlan (que abre el Customer Portal),
// esto crea una Stripe Checkout Session en modo "payment" (pago único, no
// suscripción) y redirige ahí — igual que el flujo de compra de un plan,
// pero sin subscription_data. El crédito aplica solo al ciclo de
// facturación actual (ver lib/ciclo-uso.ts).
export default function CreditosIA() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function comprarCreditos() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stripe/checkout-creditos-ia", { method: "POST" });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(false);
    setError(json?.error || "No se pudo iniciar la compra. Intenta de nuevo en un momento.");
  }

  return (
    <div className="vc-card mb-4">
      <p className="mb-2 text-sm font-medium">Créditos extra de IA</p>
      <p className="mb-3 text-xs text-muted">
        ¿Se te acabó el límite de IA de este mes? Compra créditos extra para seguir hablando con VICTOR. Lo que no
        uses no se pierde — pasa automáticamente a tu próximo ciclo.
      </p>
      {error && <p className="mb-2 text-xs text-red">{error}</p>}
      <button
        onClick={comprarCreditos}
        disabled={loading}
        className="w-full rounded-lg border border-teal p-3 text-sm font-medium text-teal"
        style={{ background: "rgba(29,158,117,.1)" }}
      >
        {loading ? "Abriendo..." : "Comprar créditos de IA"}
      </button>
    </div>
  );
}
