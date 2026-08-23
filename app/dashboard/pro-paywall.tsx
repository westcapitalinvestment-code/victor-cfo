"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Calcado del modal #m-upgrade-pro de VICTOR — Dashboard Core.html.
// Se muestra en vez del contenido real cuando un usuario Core entra a una
// sección de negocio (Cobros, Facturas, Equipo, Admin, Técnico).
//
// El botón "Activar VICTOR Pro" ya llama a Stripe Checkout de verdad (23
// agosto 2026) — el código está completo y listo. PERO solo el Price de
// Core existe hoy en Stripe (decisión de Joel: activar Pro y Enterprise
// "en lo que los creamos"), así que PRO_DISPONIBLE queda en false y el
// botón se muestra deshabilitado con "Próximamente". Cuando Joel cree el
// Price de Pro en Stripe y ponga los STRIPE_PRICE_PRO_* en Vercel, basta
// con cambiar esta constante a true para activar el cobro real — no hace
// falta tocar nada más de este archivo.
const PRO_DISPONIBLE = false;

const FEATURES = [
  "Facturar clientes y cobrar en línea",
  "Cotizaciones con depósito + balance",
  "Catálogo de servicios con 7 modalidades",
  "Múltiples entidades / corporaciones",
  "Técnicos de campo y secretaria",
  "Reportes y cuadre con SURI",
];

export default function ProPaywall() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activarPro() {
    setLoading(true);
    setError(null);

    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", ciclo: "mensual", returnTo, cancelTo: returnTo }),
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(false);
    setError(json?.error || "No se pudo iniciar el pago. Intenta de nuevo en un momento.");
  }

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <div className="overflow-hidden rounded-[20px] border border-border">
        <div className="px-5 py-6 text-center" style={{ background: "#1B3A5C" }}>
          <div className="mb-2 text-3xl">💼</div>
          <p className="mb-1 text-lg font-semibold text-white">Esta sección es para tu negocio</p>
          <p className="text-xs text-white/80">Activa VICTOR Pro y desbloquea todo</p>
        </div>

        <div className="bg-card p-5">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Con Pro puedes:</p>
          <div className="mb-4 flex flex-col gap-2">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <i className="ti ti-check flex-shrink-0 text-sm text-teal" />
                <span className="text-sm text-text">{f}</span>
              </div>
            ))}
          </div>

          <div className="mb-3.5 rounded-lg border border-teal bg-teal/[.06] p-3 text-center">
            <p className="mb-0.5 text-xs text-muted">Solo $35.00 adicional a tu plan actual</p>
            <p className="text-2xl font-semibold text-teal">
              $49.99<span className="text-sm font-normal">/mes en total</span>
            </p>
            <p className="text-xs text-muted">Cancela cuando quieras</p>
          </div>

          {error && <p className="mb-2 text-center text-xs text-red">{error}</p>}

          {PRO_DISPONIBLE ? (
            <button onClick={activarPro} className="vc-btn-primary mb-2" disabled={loading}>
              <i className="ti ti-rocket" /> {loading ? "Conectando con Stripe..." : "Activar VICTOR Pro"}
            </button>
          ) : (
            <button className="vc-btn-primary mb-2 opacity-60" disabled>
              Próximamente
            </button>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-lg border border-border bg-transparent p-3 text-sm text-muted"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
