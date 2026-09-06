"use client";

import { useEffect, useRef, useState } from "react";

type Rango = { label: string; desde?: string; hasta?: string };

// Colapsa lo que antes era una fila entera de botones de descarga
// (Este mes, Mes anterior, Trimestre, YTD, Año pasado, Todo) más el
// dropdown separado de "Rango personalizado" en un solo menú "Reporte para
// tu contable ▾" — Joel pidió esto explícitamente para despejar la
// pantalla, con el reporte del BPPR como referencia (ellos también
// esconden las opciones de descarga detrás de un solo control).
// entityId (1 sept 2026) — reusado por Gastos de negocio, para que el CSV
// salga filtrado a esa entidad en vez del historial personal.
export default function ReporteContableDropdown({ rangos, entityId }: { rangos: Rango[]; entityId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-pill border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80"
        style={{ borderColor: "var(--border)" }}
      >
        ↓ Reporte para tu contable ▾
      </button>
      {open && (
        <div className="vc-card absolute left-0 top-9 z-10 flex w-80 flex-col gap-1">
          {rangos.map((r) => {
            const params = new URLSearchParams();
            if (r.desde) params.set("desde", r.desde);
            if (r.hasta) params.set("hasta", r.hasta);
            if (entityId) params.set("entityId", entityId);
            const qs = params.toString();
            return (
              <div key={r.label} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-teal/[.08]">
                <span>↓ {r.label}</span>
                <span className="flex flex-shrink-0 gap-2">
                  <a href={`/api/transacciones/exportar/excel${qs ? `?${qs}` : ""}`} className="font-medium hover:text-teal">
                    Excel
                  </a>
                  <a href={`/api/transacciones/exportar/pdf${qs ? `?${qs}` : ""}`} className="font-medium hover:text-teal">
                    PDF
                  </a>
                </span>
              </div>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <form method="GET" action="/api/transacciones/exportar/excel" className="flex flex-col gap-2 px-2 pb-1">
            {entityId && <input type="hidden" name="entityId" value={entityId} />}
            <p className="text-xs uppercase tracking-wide text-muted">Rango personalizado</p>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Desde</label>
              <input className="vc-input" type="date" name="desde" required />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hasta</label>
              <input className="vc-input" type="date" name="hasta" required />
            </div>
            <div className="mt-1 flex gap-2">
              <button type="submit" formAction="/api/transacciones/exportar/excel" className="vc-btn-primary flex-1">
                Excel
              </button>
              <button type="submit" formAction="/api/transacciones/exportar/pdf" className="flex-1 rounded-lg border border-border text-xs font-medium text-muted hover:opacity-80">
                PDF
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
