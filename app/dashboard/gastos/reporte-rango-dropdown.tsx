"use client";

import { useEffect, useRef, useState } from "react";

// Mismo patrón que RangoDropdown de /dashboard/resumen (click-afuera real,
// sin quedarse pegado) pero para elegir el rango de fechas del reporte CSV
// en vez de filtrar la pantalla — el formulario apunta directo a la ruta
// de exportar, así que "Descargar" dispara la descarga sin navegar la app.
export default function ReporteRangoDropdown() {
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
        Rango personalizado →
      </button>
      {open && (
        <form
          method="GET"
          action="/api/transacciones/exportar"
          className="vc-card absolute right-0 top-9 z-10 flex w-64 flex-col gap-2"
        >
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Desde</label>
            <input className="vc-input" type="date" name="desde" required />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hasta</label>
            <input className="vc-input" type="date" name="hasta" required />
          </div>
          <button type="submit" className="vc-btn-primary mt-1">
            Descargar
          </button>
        </form>
      )}
    </div>
  );
}
