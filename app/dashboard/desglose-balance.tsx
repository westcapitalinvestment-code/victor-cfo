"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { Sensitive } from "@/lib/privacy";

// Desglose del balance por cuenta (20 nov 2026, pedido de Joel): el total del
// Inicio suma varias cuentas; al tocarlo se ve cuánto hay en cada una, para
// no pensar que todo ese dinero está disponible en una sola cuenta.
export type CuentaDesglose = { id: string; nombre: string; saldo: number; disponible: number | null };

export default function DesgloseBalance({ cuentas }: { cuentas: CuentaDesglose[] }) {
  const [abierto, setAbierto] = useState(false);
  if (!cuentas.length) return null;
  const lista = [...cuentas].sort((a, b) => b.saldo - a.saldo);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="rounded-pill bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30"
        aria-expanded={abierto}
      >
        {abierto ? "Ocultar cuentas ▴" : `Ver por cuenta (${cuentas.length}) ▾`}
      </button>
      {abierto && (
        <ul className="mt-3 flex flex-col divide-y divide-white/20 rounded-lg bg-white/10 px-3">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm text-white">
              <span className="min-w-0 truncate">{c.nombre}</span>
              <span className="shrink-0 text-right">
                <span className="font-semibold">
                  <Sensitive>{formatMoney(c.saldo)}</Sensitive>
                </span>
                {c.disponible !== null && Math.abs(c.disponible - c.saldo) >= 0.01 && (
                  <span className="block text-[11px] text-white/80">
                    disponible <Sensitive>{formatMoney(c.disponible)}</Sensitive>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
