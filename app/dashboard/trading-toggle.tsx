"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Tarjeta "Trading" de Configuración (19 nov 2026): activa o esconde el módulo
// y, para Core sin trading, ofrece agregarlo por +$5/mes.
type Estado = { acceso: boolean; activo: boolean; plan: string | null; incluidoEnPlan: boolean; puedeAgregar: boolean };

export default function TradingToggle() {
  const router = useRouter();
  const [e, setE] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const r = await fetch("/api/config/trading").then((x) => x.json()).catch(() => null);
    if (r?.ok) setE(r);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function cambiar(activo: boolean) {
    setCargando(true);
    setError(null);
    const r = await fetch("/api/config/trading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo }) })
      .then((x) => x.json())
      .catch(() => null);
    setCargando(false);
    if (!r?.ok) return setError(r?.error ?? "No se pudo guardar.");
    await cargar();
    router.refresh();
  }

  async function agregarTrading() {
    if (!confirm("Se agrega Trading a tu plan Core por +$5 al mes. Hoy se cobra solo la diferencia por los días que quedan del ciclo. ¿Continuar?")) return;
    setCargando(true);
    setError(null);
    const actual = await fetch("/api/stripe/cambiar-plan").then((x) => x.json()).catch(() => null);
    const r = await fetch("/api/stripe/cambiar-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "core", ciclo: actual?.ciclo ?? "mensual", trading: true }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setCargando(false);
    if (!r?.ok) return setError(r?.error ?? "No se pudo agregar Trading.");
    setMsg("Listo: Trading quedó incluido en tu plan.");
    await cargar();
    router.refresh();
  }

  if (!e) return null;

  return (
    <div id="trading" className="vc-card mb-4 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            <i className="ti ti-chart-candle mr-1" />
            Trading
          </p>
          <p className="text-xs text-muted">
            Guardián para MT5 (lote automático, stop y bloqueo según tus reglas), bitácora y % ganado por día, mes y año.
          </p>
        </div>
        {e.acceso && (
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <input type="checkbox" checked={e.activo} disabled={cargando} onChange={(x) => cambiar(x.target.checked)} />
            {e.activo ? "Activado" : "Activar"}
          </label>
        )}
      </div>
      {e.acceso && e.incluidoEnPlan && <p className="mt-2 text-xs text-muted">Incluido en tu plan. Actívalo para verlo en el menú.</p>}
      {!e.acceso && (
        <div className="mt-3 rounded-lg border border-border p-3 text-sm">
          <p className="mb-2">
            <i className="ti ti-lock mr-1" />
            Trading viene en <b>Core + Trading</b> ($19.99/mes) y está incluido en <b>Pro</b> y <b>Business</b>.
          </p>
          {e.puedeAgregar ? (
            <button className="vc-btn-primary" disabled={cargando} onClick={agregarTrading}>
              {cargando ? "Agregando…" : "Agregar Trading por +$5/mes"}
            </button>
          ) : (
            <a href="/trading" className="text-sm font-medium text-teal underline">
              Ver Core + Trading
            </a>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-teal">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </div>
  );
}
