"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { Sensitive } from "@/lib/privacy";

// Desglose del balance por cuenta (20 nov 2026, pedido de Joel): el total del
// Inicio suma varias cuentas; al tocarlo se ve cuánto hay en cada una, para
// no pensar que todo ese dinero está disponible en una sola cuenta.
// Mismo día (pedido de una clienta): también salen las tarjetas de crédito,
// y al tocar una cuenta o tarjeta, la tarjeta de "sin categorizar" del
// Inicio muestra solo las transacciones de esa cuenta (?cuenta=). Tocarla
// otra vez quita el filtro.
export type CuentaDesglose = {
  id: string;
  nombre: string;
  saldo: number;
  disponible: number | null;
  esTarjeta?: boolean;
  pendientes?: number;
  href?: string;
  activo?: boolean;
};

function Fila({ c }: { c: CuentaDesglose }) {
  const contenido = (
    <>
      <span className="min-w-0">
        <span className="block truncate">{c.nombre}</span>
        {!!c.pendientes && (
          <span className="mt-0.5 inline-block rounded-pill bg-amb px-1.5 text-[10px] font-semibold text-white">
            {c.pendientes} por categorizar
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="font-semibold">
          <Sensitive>{formatMoney(c.saldo)}</Sensitive>
        </span>
        {c.esTarjeta && <span className="block text-[11px] text-white/80">balance</span>}
        {c.disponible !== null && Math.abs(c.disponible - c.saldo) >= 0.01 && (
          <span className="block text-[11px] text-white/80">
            disponible <Sensitive>{formatMoney(c.disponible)}</Sensitive>
          </span>
        )}
      </span>
    </>
  );
  const clases = `flex items-center justify-between gap-3 px-3 py-2 text-sm text-white ${
    c.activo ? "rounded-lg bg-white/25 ring-1 ring-white" : ""
  }`;
  return (
    <li>
      {c.href ? (
        <Link href={c.href} className={`${clases} hover:bg-white/15`} title="Ver las transacciones por categorizar de esta cuenta">
          {contenido}
        </Link>
      ) : (
        <div className={clases}>{contenido}</div>
      )}
    </li>
  );
}

export default function DesgloseBalance({ cuentas, abiertoInicial = false }: { cuentas: CuentaDesglose[]; abiertoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  if (!cuentas.length) return null;
  const liquidas = cuentas.filter((c) => !c.esTarjeta).sort((a, b) => b.saldo - a.saldo);
  const tarjetas = cuentas.filter((c) => c.esTarjeta).sort((a, b) => b.saldo - a.saldo);
  const hayLinks = cuentas.some((c) => c.href);
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
        <div className="mt-3 flex flex-col gap-2">
          {hayLinks && <p className="text-[11px] text-white/85">Toca una cuenta o tarjeta para categorizar solo sus transacciones.</p>}
          {liquidas.length > 0 && (
            <ul className="flex flex-col divide-y divide-white/20 rounded-lg bg-white/10">
              {liquidas.map((c) => (
                <Fila key={c.id} c={c} />
              ))}
            </ul>
          )}
          {tarjetas.length > 0 && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/85">Tarjetas de crédito</p>
              <ul className="flex flex-col divide-y divide-white/20 rounded-lg bg-white/10">
                {tarjetas.map((c) => (
                  <Fila key={c.id} c={c} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
