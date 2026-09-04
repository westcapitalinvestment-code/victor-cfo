"use client";

import { useState } from "react";

// Sistema de referidos (30 agosto 2026, migración 0031): el link usa el
// uuid real de users.id como ?ref= — decisión deliberada de no generar un
// código corto aparte (sin lógica de colisiones/unicidad que mantener).
// Quien se registre con este link entra con referred_by apuntando a este
// usuario — ver /registro y la migración 0031.
//
// Mes gratis para el referido, Core y Pro por igual (4 sept 2026, pedido
// de Joel: "que los 2 sean iguales"). Antes Core pagaba un precio con
// descuento permanente ($12.99 en vez de $14.99, para siempre) mientras
// Pro tenía 30 días gratis — ahora los dos funcionan igual: primer mes
// completamente gratis (trial de 30 días en
// app/api/stripe/checkout/route.ts), y de ahí en adelante el precio
// normal de cada plan.
//
// Crédito para el que REFIERE (3 sept 2026, migración 0062): cuando su
// referido paga su primera factura real, quien compartió el link se gana
// un mes gratis de SU propio plan (crédito automático en Stripe, sin
// tope — puede acumular varios). Solo aplica si el referidor ya paga; si
// está en plan gratis no hay factura a la cual aplicarle el crédito.
export default function ReferralLink({ userId }: { userId: string }) {
  const [copiado, setCopiado] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/registro?ref=${userId}`
      : `https://www.victorcfo.com/registro?ref=${userId}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (raro, pero pasa en algunos navegadores
      // in-app) — el link ya está seleccionable a mano en el input de abajo.
    }
  }

  return (
    <div
      id="referidos"
      className="mb-4 scroll-mt-20 rounded-lg border p-3"
      style={{ borderColor: "#D97706", background: "rgba(217,119,6,.1)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#B45309" }}>
        🎁 Invita y ganen los dos
      </p>
      <p className="mt-1 text-sm text-text">
        Comparte tu link — quien se registre con él tiene su primer mes completamente gratis, sea Core o Pro. Y
        cuando empiece a pagar de verdad, tú te ganas un mes gratis de tu propio plan también.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="vc-input flex-1 !py-2 text-xs"
        />
        <button
          onClick={copiar}
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{ borderColor: "#D97706", background: "rgba(217,119,6,.15)", color: "#B45309" }}
        >
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
