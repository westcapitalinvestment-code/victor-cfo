"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Bono de productividad (21 oct 2026). Regla que el patrono configura en Tasas:
// porcentaje sobre un resultado (ventas, producción, lo que mida), meta mínima
// opcional y tope opcional. Se escribe el resultado de cada empleado, VICTOR calcula
// el bono sugerido y el patrono puede ajustarlo antes de pasarlo a la corrida.
// Si no hay porcentaje configurado, se escribe el monto directo.

export interface ReglaProd {
  pct: number | null; // fracción (0.05 = 5 %)
  meta: number | null;
  tope: number | null;
}

export function calcularProd(base: number, r: ReglaProd): number {
  if (!(base > 0) || r.pct == null) return 0;
  if (r.meta != null && base < r.meta) return 0;
  const m = base * r.pct;
  return Math.round((r.tope != null ? Math.min(m, r.tope) : m) * 100) / 100;
}

export default function BonoProductividad({
  empleados,
  regla,
  onAplicar,
}: {
  empleados: { id: string; nombre: string }[];
  regla: ReglaProd;
  onAplicar: (montos: Record<string, number>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [bases, setBases] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const conRegla = regla.pct != null;

  const monto = (id: string): number => {
    if (ajustes[id] !== undefined && ajustes[id] !== "") return Number(ajustes[id]) || 0;
    return conRegla ? calcularProd(Number(bases[id]) || 0, regla) : 0;
  };

  function aplicar() {
    const out: Record<string, number> = {};
    for (const e of empleados) {
      const m = monto(e.id);
      if (m > 0) out[e.id] = m;
    }
    onAplicar(out);
  }

  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="text-sm font-medium">Bono de productividad</span>
        <span className="text-teal">{abierto ? "−" : "+"}</span>
      </button>
      {abierto && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] text-muted">
            {conRegla ? (
              <>
                Regla de Tasas: <b>{+(Number(regla.pct) * 100).toFixed(2)}%</b> del resultado
                {regla.meta != null ? <> a partir de <b>{formatMoney(regla.meta)}</b></> : null}
                {regla.tope != null ? <>, tope <b>{formatMoney(regla.tope)}</b> por empleado</> : null}. Escribe el resultado de cada empleado (ventas, producción, etc.) y puedes
                ajustar el bono antes de aplicarlo.
              </>
            ) : (
              <>No hay una regla configurada en Tasas; escribe el monto del bono de cada empleado. Si quieres que VICTOR lo calcule, configura el porcentaje en Tasas.</>
            )}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-left font-medium">Empleado</th>
                {conRegla && <th className="px-1 text-right font-medium">Resultado ($)</th>}
                <th className="px-1 text-right font-medium">Bono ($)</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="py-1">{e.nombre}</td>
                  {conRegla && (
                    <td className="px-1 text-right">
                      <input type="number" min="0" step="0.01" className="vc-input w-24 text-right" value={bases[e.id] ?? ""} onChange={(ev) => { setBases((p) => ({ ...p, [e.id]: ev.target.value })); setAjustes((p) => ({ ...p, [e.id]: "" })); }} />
                    </td>
                  )}
                  <td className="px-1 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="vc-input w-24 text-right"
                      value={ajustes[e.id] !== undefined && ajustes[e.id] !== "" ? ajustes[e.id] : monto(e.id) > 0 ? String(monto(e.id)) : ""}
                      onChange={(ev) => setAjustes((p) => ({ ...p, [e.id]: ev.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="vc-btn-primary" onClick={aplicar}>Aplicar bonos de productividad a esta corrida</button>
        </div>
      )}
    </div>
  );
}
