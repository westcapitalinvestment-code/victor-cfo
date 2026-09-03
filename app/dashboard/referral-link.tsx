"use client";

import { useState } from "react";

// Sistema de referidos (30 agosto 2026, migración 0031): el link usa el
// uuid real de users.id como ?ref= — decisión deliberada de no generar un
// código corto aparte (sin lógica de colisiones/unicidad que mantener).
// Quien se registre con este link entra con referred_by apuntando a este
// usuario, y paga Core con descuento ($12.99 en vez de $14.99) si decide
// pagar en vez de empezar gratis — ver /registro y la migración 0031.
//
// Referido en Pro (3 sept 2026): si el referido elige Pro directamente,
// no paga descuento — le regalamos el primer mes completo (trial de 30
// días en app/api/stripe/checkout/route.ts), sin tocar el precio normal
// de $49.99/mes de ahí en adelante.
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
    <div className="vc-card mb-4">
      <p className="text-xs uppercase tracking-wide text-muted">Invita y ganen los dos</p>
      <p className="mt-1 text-sm text-text">
        Comparte tu link — quien se registre con él paga Core con descuento ($12.99/mes en vez de $14.99), o si
        elige Pro directamente, el primer mes le sale gratis. Y cuando empiece a pagar de verdad, tú te ganas un
        mes gratis también.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="vc-input flex-1 !py-2 text-xs"
        />
        <button onClick={copiar} className="rounded-lg border border-teal px-3 py-2 text-xs font-medium text-teal">
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
