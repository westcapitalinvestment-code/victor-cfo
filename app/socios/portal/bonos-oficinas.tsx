"use client";

import { useEffect, useState } from "react";

// Bonos por oficinas de contables (migración 0164) en el portal del vendedor:
// qué oficinas suyas ya tienen el portal, cuántos clientes ha traído cada una
// y cuánto cobra en el trimestre actual. Reglas: $20 una vez por oficina
// cuando su primer cliente ya pagó + $10 una vez por cada cliente que traiga.
// Se paga cada 3 meses, con la retención 1062.03 de sus demás comisiones.

type Datos = {
  trimestreActual: string;
  reglas: { activacionCentavos: number; clienteCentavos: number };
  totalPendienteNetoCentavos: number;
  totalPagadoNetoCentavos: number;
  trimestres: { trimestre: string; brutoCentavos: number; netoCentavos: number; pagadoNetoCentavos: number; pendienteNetoCentavos: number }[];
  oficinas: {
    id: string;
    nombre: string;
    pueblo: string | null;
    clientes: { n: number; plan: string; desde: string; activo: boolean; estado: string }[];
    activacion: { estado: string; centavos: number } | null;
    esperandoPrimerCliente: boolean;
    ganadoBrutoCentavos: number;
  }[];
};

function fmt(c: number) {
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function label(t: string) {
  const [y, q] = t.split("-Q");
  return `${["ene–mar", "abr–jun", "jul–sep", "oct–dic"][Number(q) - 1]} ${y}`;
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short" });
}
const PLAN: Record<string, string> = { core: "Core", pro: "Pro", proplus: "Business" };

export default function BonosOficinas() {
  const [d, setD] = useState<Datos | null>(null);

  useEffect(() => {
    fetch("/api/socios/portal/bonos")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setD(j));
  }, []);

  if (!d || d.oficinas.length === 0) return null;
  const actual = d.trimestres.find((t) => t.trimestre === d.trimestreActual);

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Bonos por tus oficinas de contables</p>
      <div className="vc-card mb-2">
        <p className="text-xs text-muted">
          Ganas {fmt(d.reglas.activacionCentavos)} una vez por cada oficina cuando su primer cliente ya pagó, más{" "}
          {fmt(d.reglas.clienteCentavos)} una vez por cada cliente que traiga. Se paga cada 3 meses.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Este trimestre ({label(d.trimestreActual)})</p>
            <p className="text-lg font-medium">{fmt(actual?.netoCentavos ?? 0)}</p>
            <p className="text-xs text-muted">neto estimado, después de retención</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Por cobrar en total</p>
            <p className="text-lg font-medium">{fmt(d.totalPendienteNetoCentavos)}</p>
            <p className="text-xs text-muted">ya cobrado {fmt(d.totalPagadoNetoCentavos)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {d.oficinas.map((o) => (
          <div key={o.id} className="vc-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{o.nombre}</p>
                <p className="text-xs text-muted">{o.pueblo ?? ""}</p>
              </div>
              <span className={`shrink-0 text-right text-xs font-medium ${o.esperandoPrimerCliente ? "text-amb" : "text-teal"}`}>
                {o.esperandoPrimerCliente ? "Esperando su primer cliente" : `${o.clientes.length} cliente${o.clientes.length === 1 ? "" : "s"} · ${fmt(o.ganadoBrutoCentavos)}`}
              </span>
            </div>
            {o.clientes.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2 text-sm text-muted">
                {o.activacion && (
                  <p>
                    Activación de la oficina: {fmt(o.activacion.centavos)} · {o.activacion.estado === "pagada" ? "pagada" : "pendiente"}
                  </p>
                )}
                {o.clientes.map((c) => (
                  <p key={c.n}>
                    Cliente {c.n} · {PLAN[c.plan] ?? c.plan} · desde {fmtFecha(c.desde)} · {fmt(d.reglas.clienteCentavos)} ·{" "}
                    {c.estado === "reversada" ? "no aplicó" : c.estado === "pagada" ? "pagado" : "pendiente"}
                    {!c.activo && c.estado === "pendiente" ? " (revisar: ya no está activo)" : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {d.trimestres.filter((t) => t.brutoCentavos > 0).length > 0 && (
        <div className="vc-card mt-2">
          <p className="mb-1 text-xs font-medium text-muted">Por trimestre (neto)</p>
          {d.trimestres
            .filter((t) => t.brutoCentavos > 0)
            .map((t) => (
              <p key={t.trimestre} className="flex justify-between text-sm">
                <span>{label(t.trimestre)}</span>
                <span>
                  {fmt(t.netoCentavos)}
                  <span className="text-muted"> · {t.pendienteNetoCentavos > 0 ? `${fmt(t.pendienteNetoCentavos)} por cobrar` : "pagado"}</span>
                </span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
