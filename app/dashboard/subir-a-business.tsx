"use client";

import { useEffect, useState } from "react";

// Atajo "Subir a Business" (18 oct 2026, pedido de Joel): quien está en Core o
// Pro y entra a un addon (Técnicos, Pagos, Nómina, Administrador/Secretaria) solo veía
// "Activar addon". Business ya incluye todos, así que aquí se le ofrece subir
// de plan con un botón. Usa el mismo endpoint de cambio de plan (cobra hoy la
// diferencia prorrateada y quita los addons que Business incluye). No se
// muestra si no tiene suscripción propia, si ya es Business o si la paga una firma.
export default function SubirABusiness({ compacto = false }: { compacto?: boolean }) {
  const [info, setInfo] = useState<{
    plan?: string;
    ciclo?: string | null;
    puedeCambiar?: boolean;
    disponibles?: { proplus?: boolean };
  } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stripe/cambiar-plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => {});
  }, []);

  if (!info?.puedeCambiar || !info.plan || info.plan === "proplus") return null;
  // Business sin Price en Stripe todavía: no se ofrece (evita un botón que falla).
  if (info.disponibles && !info.disponibles.proplus) return null;

  const ciclo = info.ciclo === "anual" ? "anual" : "mensual";
  const precio = ciclo === "anual" ? "$1,099/año" : "$99.99/mes";

  async function subir() {
    if (
      !window.confirm(
        "Vas a subir a Business. Se te cobra hoy la diferencia prorrateada por los días que quedan de tu ciclo y tienes acceso de inmediato. Los addons que Business ya incluye (Técnicos, Pagos, Nómina, Administrador y Secretaria) dejan de cobrarse. ¿Continuar?",
      )
    )
      return;
    setTrabajando(true);
    setError(null);
    const r = await fetch("/api/stripe/cambiar-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "proplus", ciclo }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setTrabajando(false);
      setError(j?.error || "No se pudo subir de plan. Intenta de nuevo.");
      return;
    }
    window.location.reload();
  }

  return (
    <div
      className={`rounded-xl border text-left ${compacto ? "mt-3 p-3" : "mb-4 p-4"}`}
      style={{ borderColor: "#1B3A5C", background: "rgba(27,58,92,.06)" }}
    >
      <p className="text-sm font-medium">¿Vas a usar varios addons? Sube a Business · {precio}</p>
      <p className="mb-2 mt-0.5 text-xs text-muted">
        Incluye Técnicos, Pagos, Nómina, Administrador y Secretaria sin cobrarlos aparte. Se cobra solo la diferencia de tu plan actual.
      </p>
      {error && <p className="mb-2 text-xs text-red">{error}</p>}
      <button className="vc-btn-primary" disabled={trabajando} onClick={subir}>
        {trabajando ? "Procesando..." : "Subir a Business"}
      </button>
    </div>
  );
}
