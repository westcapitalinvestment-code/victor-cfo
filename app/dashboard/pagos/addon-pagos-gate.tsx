"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Pantalla de upsell del addon Pagos ($24.99/mes, migración 0134, 2 oct
// 2026) — reemplaza TODO el portal de Pagos (contratistas, corrida de pago,
// reportes 480.6SP) hasta que el addon esté activo. A diferencia del addon
// Equipo/Técnicos (que deja ver la pantalla y solo bloquea crear técnicos),
// Pagos se bloquea entero porque antes era parte de Pro y ahora es un
// módulo completo aparte — no tiene sentido mostrar contratistas/
// retenciones a medias sin el addon.
//
// puedeActivar=false cuando lo abre un Administrador vía /admin/[entityId]/
// pagos — la suscripción es del DUEÑO, no del admin, así que acá solo se
// explica y se le pide que le avise al dueño (mismo criterio que el resto
// de los addons "por seat", que tampoco dejan activar/desactivar desde el
// portal de Admin).
export default function AddonPagosGate({
  puedeActivar,
  volverHref = "/dashboard",
}: {
  puedeActivar: boolean;
  volverHref?: string;
}) {
  const router = useRouter();
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activar() {
    setActivando(true);
    setError(null);
    const res = await fetch("/api/stripe/addon-pagos/activar", { method: "POST" });
    const data = await res.json().catch(() => null);
    setActivando(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo activar el addon.");
      return;
    }
    // Cliente de Firma Accountant sin suscripción propia (4 oct 2026) — lo
    // manda a Stripe a poner su tarjeta, solo para este addon.
    if (data.requierePago && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <Link href={volverHref} className="mb-4 inline-block text-sm text-muted hover:opacity-80">
        ← VICTOR
      </Link>
      <div
        className="rounded-2xl border p-5 text-center"
        style={{ borderColor: "#1D9E75", background: "rgba(29,158,117,.06)" }}
      >
        <div className="mb-2 text-2xl">💳</div>
        <p className="mb-1 text-base font-semibold">Add-on Pagos — $24.99/mes</p>
        <p className="mb-4 text-sm text-muted">
          Paga contratistas con retención automática (10% / 6%), control mensual del depósito para que nunca se te
          pase la fecha, exportación directa de la 480.6SP al cierre fiscal, Certificado de Relevo por contratista y
          archivo ACH/NACHA listo para subir al banco.
        </p>
        {error && <p className="mb-3 text-xs text-red">{error}</p>}
        {puedeActivar ? (
          <button className="vc-btn-primary" disabled={activando} onClick={activar}>
            {activando ? "Activando..." : "Activar addon"}
          </button>
        ) : (
          <p className="text-xs text-muted">
            Este addon lo activa el dueño de la cuenta desde su Suscripción — pídele que lo active para poder
            trabajar aquí.
          </p>
        )}
      </div>
    </div>
  );
}
