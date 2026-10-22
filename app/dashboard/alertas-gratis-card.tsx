"use client";

import { useEffect, useState } from "react";
import type { AlertaRegla } from "./alertas-patron-card";

// Alertas inteligentes del plan gratis con "Vista / Volver a ver" (22 oct 2026).
// La clave de una alerta es su texto: si cambia el monto o el mes, es una alerta
// nueva y vuelve a contar en la campanita. La campanita muestra solo las nuevas.
export const EVENTO_ALERTAS = "vc-alertas-count";

export default function AlertasGratisCard({ alertas, vistasIniciales }: { alertas: AlertaRegla[]; vistasIniciales: string[] }) {
  const [vistas, setVistas] = useState<Set<string>>(new Set(vistasIniciales));
  const [verVistas, setVerVistas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nuevas = alertas.filter((a) => !vistas.has(a.texto));
  const yaVistas = alertas.filter((a) => vistas.has(a.texto));

  // Avisa a la campanita del topbar cuántas alertas SIN ver hay.
  useEffect(() => {
    (window as unknown as { __vcAlertas?: number }).__vcAlertas = nuevas.length;
    window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS, { detail: nuevas.length }));
  }, [nuevas.length]);

  async function marcar(claves: string[], vista: boolean) {
    setError(null);
    const antes = vistas;
    const sig = new Set(vistas);
    for (const c of claves) {
      if (vista) sig.add(c);
      else sig.delete(c);
    }
    setVistas(sig);
    const res = await fetch("/api/alertas-vistas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claves, vista }),
    });
    if (!res.ok) {
      setVistas(antes);
      setError("No se pudo guardar. Intenta otra vez.");
    }
  }

  return (
    <div id="alertas-inteligentes" className="vc-card !p-0 mb-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            🔎
          </span>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Alertas inteligentes</p>
        </div>
        {nuevas.length > 1 && (
          <button type="button" className="text-[11px] font-medium text-teal" onClick={() => marcar(nuevas.map((a) => a.texto), true)}>
            Marcar todas como vistas
          </button>
        )}
      </div>

      <div className="p-4">
        {alertas.length === 0 ? (
          <p className="text-xs text-muted">Todo se ve normal este mes — sin subidas raras, sin déficit, sin metas estancadas.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {nuevas.length === 0 && <p className="text-xs text-muted">Estás al día: ya viste todas tus alertas. Si llega una nueva, te aviso aquí y en la campanita.</p>}
            {nuevas.map((a) => (
              <div key={a.texto} className="flex items-start gap-2">
                <span aria-hidden style={{ fontSize: 14, lineHeight: "18px" }}>
                  {a.icono}
                </span>
                <p className="min-w-0 flex-1 text-xs text-text">{a.texto}</p>
                <button type="button" className="shrink-0 rounded-pill border border-teal px-2.5 py-0.5 text-[11px] font-medium text-teal hover:opacity-80" onClick={() => marcar([a.texto], true)}>
                  Vista
                </button>
              </div>
            ))}

            {yaVistas.length > 0 && (
              <div className="border-t border-border pt-2">
                <button type="button" className="text-[11px] font-medium text-muted underline" onClick={() => setVerVistas(!verVistas)}>
                  {verVistas ? "Ocultar alertas vistas" : `Ver alertas vistas (${yaVistas.length})`}
                </button>
                {verVistas && (
                  <div className="mt-2 flex flex-col gap-3">
                    {yaVistas.map((a) => (
                      <div key={a.texto} className="flex items-start gap-2 opacity-60">
                        <span aria-hidden style={{ fontSize: 14, lineHeight: "18px" }}>
                          {a.icono}
                        </span>
                        <p className="min-w-0 flex-1 text-xs text-text">{a.texto}</p>
                        <button type="button" className="shrink-0 text-[11px] font-medium text-teal" onClick={() => marcar([a.texto], false)}>
                          Volver a ver
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
      </div>
    </div>
  );
}
