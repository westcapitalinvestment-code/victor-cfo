"use client";

import { useEffect, useState } from "react";

// Resumen del vendedor (18 oct 2026): lo primero que ve al entrar. Junta lo
// que ya cobró, lo que cobraría ahora (70% listo), el 30% que está en espera
// hasta el 3er pago de cada cliente, y los bonos de sus oficinas de
// contables de este trimestre. Todo neto de retención 1062.03 salvo el 30%
// en espera (esa retención se calcula al liberarse).

type Datos = {
  totalCobradoCentavos: number;
  totalPendienteCentavos: number;
  totalRetenidoCentavos: number;
  totalTreintaEsperaCentavos: number;
  totalPendienteBrutoCentavos?: number;
  totalRetenidoPendienteCentavos?: number;
  totalRetenidoAnioCentavos?: number;
  anioRetencion?: number;
  proximaFechaPago?: string | null;
  clientes: unknown[];
};
type Bonos = {
  trimestreActual: string;
  totalPendienteNetoCentavos: number;
  totalPagadoNetoCentavos: number;
  trimestres: { trimestre: string; netoCentavos: number }[];
  oficinas: { clientes: unknown[] }[];
};

function fmt(c: number) {
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function label(t: string) {
  const [y, q] = t.split("-Q");
  return `${["ene–mar", "abr–jun", "jul–sep", "oct–dic"][Number(q) - 1]} ${y}`;
}

function Tarjeta({ titulo, valor, nota, color }: { titulo: string; valor: string; nota?: string; color?: string }) {
  return (
    <div className="vc-card">
      <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
      <p className={`mt-1 text-lg font-semibold ${color ?? ""}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs leading-snug text-muted">{nota}</p>}
    </div>
  );
}

function fechaLarga(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" });
}

export default function ResumenVendedor({ datos }: { datos: Datos }) {
  const [abierto, setAbierto] = useState(false);
  const [bonos, setBonos] = useState<Bonos | null>(null);
  useEffect(() => {
    fetch("/api/socios/portal/bonos")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setBonos(j));
  }, []);

  const bonosTrim = bonos?.trimestres.find((t) => t.trimestre === bonos.trimestreActual)?.netoCentavos ?? 0;
  const bonosPorCobrar = bonos?.totalPendienteNetoCentavos ?? 0;
  const clientesDeOficinas = (bonos?.oficinas ?? []).reduce((s, o) => s + o.clientes.length, 0);

  // Lo que cobrarías si todo llega: lo listo ahora + 30% en espera + bonos por cobrar.
  const proyectado = datos.totalPendienteCentavos + datos.totalTreintaEsperaCentavos + bonosPorCobrar;
  const cobrado = datos.totalCobradoCentavos + (bonos?.totalPagadoNetoCentavos ?? 0);

  const brutoPend = datos.totalPendienteBrutoCentavos ?? 0;
  const retPend = datos.totalRetenidoPendienteCentavos ?? 0;
  const retAnio = datos.totalRetenidoAnioCentavos ?? 0;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="vc-card flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Tu resumen</p>
          <p className="text-xs text-muted">
            Proyectado <span className="font-semibold text-teal">{fmt(proyectado)}</span>
            {datos.proximaFechaPago ? ` · próximo pago ${fechaLarga(datos.proximaFechaPago)}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted">{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tarjeta titulo="Ya cobrado" valor={fmt(cobrado)} nota="neto, después de retención" color="text-teal" />
            <Tarjeta titulo="Por cobrar ahora" valor={fmt(datos.totalPendienteCentavos)} nota="70% de tus clientes ya listo para pago (neto)" color="text-amb" />
            <Tarjeta
              titulo="30% en espera"
              valor={fmt(datos.totalTreintaEsperaCentavos)}
              nota="se libera cuando cada cliente llega a su 3er pago (antes de retención)"
            />
            <Tarjeta
              titulo="Bonos de oficinas"
              valor={fmt(bonosPorCobrar)}
              nota={bonos ? `${clientesDeOficinas} cliente${clientesDeOficinas === 1 ? "" : "s"} de tus oficinas · este trimestre ${fmt(bonosTrim)} (${label(bonos.trimestreActual)}) · se paga cada 3 meses` : "cargando…"}
            />
          </div>

          <div className="vc-card mt-2 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Total proyectado</p>
              <p className="text-xs text-muted">por cobrar + 30% en espera + bonos</p>
            </div>
            <p className="text-xl font-semibold text-teal">{fmt(proyectado)}</p>
          </div>

          <div className="vc-card mt-2 text-xs leading-snug">
            <p className="mb-1 font-medium">Tu próximo pago</p>
            <div className="flex justify-between"><span className="text-muted">Comisiones listas (bruto)</span><span>{fmt(brutoPend)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Retención 1062.03</span><span>− {fmt(retPend)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Bonos de oficinas (neto)</span><span>+ {fmt(bonosPorCobrar)}</span></div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total a recibir</span>
              <span className="text-teal">{fmt(datos.totalPendienteCentavos + bonosPorCobrar)}</span>
            </div>
            <p className="mt-1.5 text-muted">
              {datos.proximaFechaPago
                ? `Fecha de pago programada: ${fechaLarga(datos.proximaFechaPago)}.`
                : "Todavía no hay fecha de pago programada; aparecerá aquí cuando se fije."}
            </p>
          </div>

          <div className="vc-card mt-2 text-xs leading-snug">
            <p className="mb-1 font-medium">Retención para tu planilla 480.6SP</p>
            <div className="flex justify-between"><span className="text-muted">Retenido en {datos.anioRetencion ?? new Date().getFullYear()}</span><span className="font-semibold">{fmt(retAnio)}</span></div>
            <p className="mt-1 text-muted">
              Es lo que se te descuenta en comisiones (Sección 1062.03). Lo recibes en tu planilla 480.6SP para tu contribución del año; guárdala.
            </p>
          </div>

          <div className="vc-card mt-2 text-xs leading-snug text-muted">
            <p className="mb-1 font-medium text-foreground">Cómo se calcula lo tuyo</p>
            <p>• Cliente mensual: 70% con su primer pago y el 30% restante cuando llega a su 3er pago.</p>
            <p>• Cliente anual: 20% del año, una sola vez, con su primer pago.</p>
            <p>• Oficina de contables que activaste: $20 una vez cuando su primer cliente ya pagó, y $10 una vez por cada cliente que traiga. Se paga cada 3 meses.</p>
          </div>
        </>
      )}
    </div>
  );
}
