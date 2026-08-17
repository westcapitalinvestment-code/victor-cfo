"use client";

import { useRouter } from "next/navigation";

// Calcado del modal #m-upgrade-pro de VICTOR — Dashboard Core.html.
// Se muestra en vez del contenido real cuando un usuario Core entra a una
// sección de negocio (Cobros, Facturas, Equipo, Admin, Técnico). El botón
// "Activar VICTOR Pro" hace lo mismo que en el mockup: te manda a Config
// (ahí es donde vivirá el checkout de Stripe cuando se conecte — todavía
// no está integrado).
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
            <p className="mb-0.5 text-xs text-muted">Solo</p>
            <p className="text-2xl font-semibold text-teal">
              $49.99<span className="text-sm font-normal">/mes</span>
            </p>
            <p className="text-xs text-muted">Cancela cuando quieras</p>
          </div>

          <button
            onClick={() => router.push("/dashboard/config")}
            className="vc-btn-primary mb-2"
          >
            <i className="ti ti-rocket" /> Activar VICTOR Pro
          </button>
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
