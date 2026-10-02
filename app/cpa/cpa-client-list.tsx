"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

// Lista de clientes del Portal CPA, como componente aparte (2 oct 2026,
// pedido de Joel: "un contable con 45 clientes ve un número ahí de
// $258,352.72 y eso crea un chaos emocional" — la página /cpa dejó de
// mostrar $ sumados de todo el portafolio; ahora es buscador + tabs +
// lista, con el detalle de cada cliente a un click, igual que haría
// cualquier portal de verdad con muchos clientes).
export type ClienteCpa = {
  id: string;
  name: string;
  entityType: string | null;
  ein: string | null;
  ownerName: string | null;
  alertCount: number;
  ivu: { status: "depositado" | "overdue" | "pendiente"; monto: number } | null;
};

export default function CpaClientList({ clientes }: { clientes: ClienteCpa[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"todos" | "alertas">("todos");

  const conAlertas = clientes.filter((c) => c.alertCount > 0);

  const filtrados = useMemo(() => {
    const base = tab === "alertas" ? conAlertas : clientes;
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ein ?? "").toLowerCase().includes(q) ||
        (c.ownerName ?? "").toLowerCase().includes(q),
    );
  }, [clientes, conAlertas, tab, busqueda]);

  return (
    <div className="vc-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Tus clientes ({clientes.length})</p>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por entidad, dueño o EIN..."
            className="w-full rounded-lg border border-border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTab("todos")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "todos" ? "bg-teal text-white" : "text-muted hover:text-text"
            }`}
          >
            Todos ({clientes.length})
          </button>
          <button
            onClick={() => setTab("alertas")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "alertas" ? "bg-teal text-white" : "text-muted hover:text-text"
            }`}
          >
            Con alertas ({conAlertas.length})
          </button>
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="text-xs text-muted">
          Todavía no tienes clientes conectados. En cuanto un dueño te invite y aceptes, aparecerán aquí.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-muted">
          {tab === "alertas" ? "Ningún cliente tiene alertas pendientes ahora mismo." : "No hay clientes que coincidan con esa búsqueda."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {filtrados.map((c) => (
            <Link key={c.id} href={`/cpa/${c.id}`} className="flex items-center justify-between py-3 hover:opacity-80">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted">
                  {c.entityType} {c.ein ? `· EIN ${c.ein}` : ""}
                  {c.ownerName ? ` · de ${c.ownerName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.alertCount > 0 && (
                  <span className="rounded-full bg-red/10 px-2 py-1 text-[10px] font-medium text-red">
                    {c.alertCount} alerta{c.alertCount === 1 ? "" : "s"}
                  </span>
                )}
                {c.ivu ? (
                  <span
                    className={
                      "rounded-full px-2 py-1 text-[10px] font-medium " +
                      (c.ivu.status === "depositado"
                        ? "bg-grn/10 text-grn"
                        : c.ivu.status === "overdue"
                          ? "bg-red/10 text-red"
                          : "bg-amb/10 text-amb")
                    }
                  >
                    IVU {formatMoney(c.ivu.monto)}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] text-muted">Sin datos IVU</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
