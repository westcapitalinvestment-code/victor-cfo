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
// Crédito para el que REFIERE (3 sept 2026, migración 0062; rediseñado 5
// sept 2026, ver app/api/stripe/webhook/route.ts case "invoice.paid"):
// cuando su referido paga su primera factura real, quien compartió el
// link se gana un crédito automático en su saldo de Stripe — asimétrico a
// propósito: el monto es un mes completo DEL PLAN QUE ENTRÓ EL REFERIDO,
// no del plan del referidor, así que traer un negocio a Pro paga ~3.3x
// más que traer a alguien a Core. Con tope anual (protección de caja, no
// un requisito de Hacienda): hasta $175/año si el referidor está en Core,
// hasta $500/año si está en Pro. El crédito es intransferible, no se
// puede cambiar por efectivo, y solo aplica contra futuras facturas de la
// plataforma — nunca es un pago en efectivo ni una comisión. Solo aplica
// si el referidor ya paga; si está en plan gratis no hay factura a la
// cual aplicarle el crédito.
// Estadísticas reales visibles en la tarjeta (8 sept 2026, pedido de Joel:
// además del correo — ver sendReferralCreditEmail en lib/email.ts — que
// también se vea aquí mismo sin tener que revisar el email, "pq mucha
// gente ni check casi el email"). Se calculan server-side en
// app/dashboard/config/page.tsx (necesita el cliente admin, referral_rewards
// no tiene políticas de RLS) y llegan ya listas como props.
export default function ReferralLink({
  userId,
  acumuladoEsteAñoCentavos,
  topeAnualCentavos,
  referidosConCredito,
}: {
  userId: string;
  acumuladoEsteAñoCentavos: number;
  topeAnualCentavos: number;
  referidosConCredito: number;
}) {
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
        🎁 Refiere y ahorra
      </p>
      <p className="mt-1 text-sm text-text">
        Comparte tu link — quien se registre con él tiene su primer mes completamente gratis, sea Core o Pro. Cuando
        empiece a pagar de verdad, tú te ganas un crédito en tu cuenta: un mes del plan al que entró — si trajiste a
        alguien a Pro, son $49.99 de crédito aunque tú estés en Core.
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

      {referidosConCredito > 0 ? (
        <div
          className="mt-3 flex items-center justify-between rounded-lg border p-2.5"
          style={{ borderColor: "#1D9E75", background: "rgba(29,158,117,.08)" }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: "#14543d" }}>
              ${(acumuladoEsteAñoCentavos / 100).toFixed(2)} ganados este año
            </p>
            <p className="text-xs text-muted">
              {referidosConCredito} {referidosConCredito === 1 ? "referido pagando" : "referidos pagando"} · de $
              {(topeAnualCentavos / 100).toFixed(2)} disponibles al año
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Todavía no tienes créditos ganados — en cuanto el primero que refieras empiece a pagar de verdad, aparece
          aquí (y te avisamos por correo).
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Puedes acumular hasta $175/año en créditos si estás en Core, o hasta $500/año si estás en Pro. El crédito se
        aplica solo, automático, a tu próxima factura — es intransferible y no se puede cambiar por efectivo.
      </p>
    </div>
  );
}
