"use client";

import { useEffect, useRef, useState } from "react";

// El "Rango →" personalizado — antes era un <details> nativo, pero eso no
// se puede cerrar con click-afuera ni al aplicar (sigue "abierto" del
// lado del navegador aunque la URL cambie). Esto sí lo controla: cierra
// solo con click afuera, y al enviar el formulario (que navega a la nueva
// URL) el componente se vuelve a montar limpio, así que nunca queda pegado.
export default function RangoDropdown({
  activo,
  inicio,
  fin,
}: {
  activo: boolean;
  inicio: string;
  fin: string;
}) {
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
        className="rounded-pill border px-3 py-1.5 text-xs font-medium"
        style={
          activo
            ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
            : { borderColor: "var(--border)", color: "var(--muted)" }
        }
      >
        Rango →
      </button>
      {open && (
        <form
          method="GET"
          action="/dashboard/resumen"
          className="vc-card absolute right-0 top-9 z-10 flex w-64 flex-col gap-2"
        >
          <input type="hidden" name="rango" value="custom" />
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Desde</label>
            <input className="vc-input" type="date" name="desde" defaultValue={activo ? inicio : undefined} required />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hasta</label>
            <input className="vc-input" type="date" name="hasta" defaultValue={activo ? fin : undefined} required />
          </div>
          <button type="submit" className="vc-btn-primary mt-1">
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
