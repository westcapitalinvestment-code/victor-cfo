"use client";

import { useState } from "react";

// Contables (VICTOR Accountant) en Ventas, 13 oct 2026, pedido de Joel:
// lista desplegable con buscador. Los datos los arma el Server Component
// (app/dashboard/ventas/page.tsx); aquí solo hay estado de UI.
export type ContableFila = {
  id: string;
  nombre: string;
  email: string;
  registroComerciante: string | null;
  clientesActivos: number;
  clientesInvitados: number;
  seats: number;
  ingresoMensualCentavos: number;
};

function fmt(centavos: number) {
  return `$${(centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ContablesPanel({ contables }: { contables: ContableFila[] }) {
  const [abierto, setAbierto] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const t = busqueda.trim().toLowerCase();
  const filtrados = t
    ? contables.filter((c) =>
        [c.nombre, c.email, c.registroComerciante ?? ""].some((v) => v.toLowerCase().includes(t))
      )
    : contables;

  return (
    <div className="vc-card mt-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium">Contables — VICTOR Accountant ({contables.length})</span>
        <span className="shrink-0 text-[11px] text-muted">{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">
              Business a $60/mes (40% menos) por cada cliente que invitan. Los addons se facturan aparte al cliente.
            </p>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar contable…"
              className="vc-input !w-56 shrink-0 !py-1 text-xs"
            />
          </div>

          {contables.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted">Ningún contable activado todavía.</p>
          ) : filtrados.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted">Sin resultados para “{busqueda}”.</p>
          ) : (
            filtrados.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nombre}</p>
                    <p className="truncate text-[11px] text-muted">
                      {c.email}
                      {c.registroComerciante ? ` · Reg. Comerciante ${c.registroComerciante}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <p>
                      {c.clientesActivos} clientes activos ({c.clientesInvitados} invitados)
                    </p>
                    <p>
                      Ingreso mensual (est. a $60): <span className="font-medium text-white">{fmt(c.ingresoMensualCentavos)}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
