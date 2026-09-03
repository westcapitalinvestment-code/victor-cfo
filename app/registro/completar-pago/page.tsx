"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { esPlanValido, esCicloValido, type PlanId, type Ciclo } from "@/lib/stripe";

// Página de respaldo del gate de pago. Un usuario cae aquí en 3 casos:
// (1) el checkout automático de /registro falló (ej. Price ID mal
// configurado) y lo mandamos aquí para que reintente; (2) canceló el
// Stripe Checkout desde el paso de pago (cancel_url apunta acá); (3) tiene
// sesión pero plan_status = 'incomplete' o 'cancelled' y el middleware lo
// interceptó al intentar entrar a /dashboard (ej. confirmó el correo días
// después y nunca había pagado, o se le canceló la suscripción).
//
// A diferencia de /registro, aquí el usuario YA tiene sesión de Supabase
// (si no la tuviera, el middleware ya lo hubiera mandado a /login antes de
// llegar a /dashboard) — así que el botón puede llamar al checkout directo.
// disponible: false → Enterprise (proplus) sigue bloqueado — no es
// autoservicio, es el nivel que Joel vende a mano por fuera. Core y Pro ya
// tienen sus Price ID reales en Stripe (Pro destapado el 3 sept 2026), así
// que ambos son comprables aquí (mismo criterio que app/landing-pricing.tsx
// y app/dashboard/pro-paywall.tsx).
const PLANES: { id: PlanId; nombre: string; precioMensual: string; precioAnual: string; disponible: boolean }[] = [
  { id: "core", nombre: "VICTOR Core", precioMensual: "$14.99/mes", precioAnual: "$164/año", disponible: true },
  { id: "pro", nombre: "VICTOR Pro", precioMensual: "$49.99/mes", precioAnual: "$549/año", disponible: true },
  { id: "proplus", nombre: "VICTOR Enterprise", precioMensual: "$99.99/mes", precioAnual: "$1,099/año", disponible: false },
];

function CompletarPagoForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const planQuery = searchParams.get("plan");
  const cicloQuery = searchParams.get("ciclo");

  // Si alguien llega con ?plan=proplus (Enterprise, no autoservicio), lo
  // dejamos en Core en vez de "seleccionado" en un plan que el botón de
  // pagar no puede procesar. Core y Pro sí pasan directo.
  const planInicial = esPlanValido(planQuery) && PLANES.find((p) => p.id === planQuery)?.disponible ? planQuery : "core";
  const [plan, setPlan] = useState<PlanId>(planInicial);
  const [ciclo, setCiclo] = useState<Ciclo>(esCicloValido(cicloQuery) ? cicloQuery : "mensual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pagar() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, ciclo, returnTo: "/onboarding", cancelTo: "/registro/completar-pago" }),
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(false);
    setError(json?.error || "No se pudo iniciar el pago. Intenta de nuevo en un momento.");
  }

  async function cerrarSesion() {
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <div className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Completa tu pago para entrar</h1>
          <p className="mb-1 text-xs text-muted">
            Tu cuenta ya existe — solo falta activar tu plan para desbloquear el dashboard.
          </p>

          <div className="flex flex-col gap-2">
            {PLANES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.disponible && setPlan(p.id)}
                disabled={!p.disponible}
                className={`rounded-lg border p-3 text-left text-sm ${
                  !p.disponible
                    ? "cursor-not-allowed border-border opacity-50"
                    : plan === p.id
                      ? "border-teal bg-teal/[.06]"
                      : "border-border"
                }`}
              >
                <p className="font-medium text-text">
                  {p.nombre} {!p.disponible && <span className="text-xs text-muted">(Próximamente)</span>}
                </p>
                <p className="text-xs text-muted">{ciclo === "mensual" ? p.precioMensual : p.precioAnual}</p>
              </button>
            ))}
          </div>

          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCiclo("mensual")}
              className={`flex-1 rounded-lg border p-2 ${ciclo === "mensual" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setCiclo("anual")}
              className={`flex-1 rounded-lg border p-2 ${ciclo === "anual" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Anual (1 mes gratis)
            </button>
          </div>

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="button" onClick={pagar} className="vc-btn-primary mt-2" disabled={loading}>
            {loading ? "Conectando con Stripe..." : "Continuar al pago"}
          </button>
          <button type="button" onClick={cerrarSesion} className="text-center text-xs text-muted">
            Prefiero salir por ahora
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompletarPagoPage() {
  return (
    <Suspense fallback={null}>
      <CompletarPagoForm />
    </Suspense>
  );
}
