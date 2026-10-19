"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Pantalla de upsell del addon Nómina ($24.99/mes, migración 0167, 19 oct
// 2026) — mismo patrón que AddonPagosGate. Bloquea el módulo entero hasta que
// el addon esté activo.
export default function AddonNominaGate({
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
    const res = await fetch("/api/stripe/addon-nomina/activar", { method: "POST" });
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
      <Link href={volverHref} className="vc-btn-back">
        ← Atrás
      </Link>
      <div
        className="rounded-2xl border p-5 text-center"
        style={{ borderColor: "#1D9E75", background: "rgba(29,158,117,.06)" }}
      >
        <div className="mb-2 text-2xl">🧾</div>
        <p className="mb-1 text-base font-semibold">Add-on Nómina — $24.99/mes</p>
        <p className="mb-4 text-sm text-muted">
          Calcula la nómina de tus empleados en Puerto Rico: retención de Hacienda, Seguro Social, Medicare y SINOT,
          el costo real para tu corporación (FICA patronal, SUTA, FUTA y provisión de CFSE), el recibo de cada
          empleado, los montos a depositar con su fecha estimada y el asiento contable de cada corrida. VICTOR calcula;
          tú (o tu contable) radicas y depositas.
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
