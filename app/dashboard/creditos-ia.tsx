"use client";

import { useState } from "react";

// Créditos extra de IA — 3 sept 2026, migración 0064, pedido de Joel: "ese
// limite lo podemos resolver poniendo un addon de creditos de AI como hace
// Anthropic". A diferencia de GestionarPlan (que abre el Customer Portal),
// esto crea una Stripe Checkout Session en modo "payment" (pago único, no
// suscripción) y redirige ahí — igual que el flujo de compra de un plan,
// pero sin subscription_data. El crédito aplica solo al ciclo de
// facturación actual (ver lib/ciclo-uso.ts).
//
// 8 sept 2026 — se añade un segundo pack ($20) además del original de $10.
// El de $20 no es solo el doble limpio — trae un 5% extra de microtokens
// como incentivo por llevar el pack grande (ver lib/stripe.ts,
// CREDITO_IA_CENTAVOS_POR_COMPRA_20).
//
// 9 sept 2026 — pedido de Joel: "quitale los microtokens... no lo pongas
// visible en Config, solo deja lo de 'Mejor valor - 5% de bono'". El
// número de microtokens dejó de mostrarse en la tarjeta (solo el precio y
// la nota de "Mejor valor"), pero VICTOR SÍ puede seguir hablando de
// microtokens en el chat si el usuario pregunta directamente — eso vive
// en lib/victor/tools.ts (verificar_uso_ia), no aquí. El campo
// `microtokens` de PAQUETES se queda declarado (era solo cosmético, el
// crédito real que aplica lo decide el backend en
// /api/stripe/checkout-creditos-ia vía configPaqueteCreditosIA(), no este
// número) aunque ya no se pinte en pantalla.
const PAQUETES = [
  { id: "10" as const, precioLabel: "$10", microtokens: 7_000_000, nota: null as string | null },
  { id: "20" as const, precioLabel: "$20", microtokens: 14_700_000, nota: "Mejor valor — 5% de bono" },
];

export default function CreditosIA() {
  const [loading, setLoading] = useState<"10" | "20" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function comprarCreditos(paquete: "10" | "20") {
    setLoading(paquete);
    setError(null);

    const res = await fetch("/api/stripe/checkout-creditos-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paquete }),
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(null);
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
      <div className="grid grid-cols-2 gap-2">
        {PAQUETES.map((p) => (
          <button
            key={p.id}
            onClick={() => comprarCreditos(p.id)}
            disabled={loading !== null}
            className="rounded-lg border border-teal p-3 text-center text-sm font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            <span className="block text-base font-semibold">{p.precioLabel}</span>
            {p.nota && <span className="mt-1 block text-[11px] font-normal">{p.nota}</span>}
            {loading === p.id && <span className="block text-[11px] font-normal">Abriendo...</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
