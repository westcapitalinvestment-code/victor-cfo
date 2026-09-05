"use client";

import { useState } from "react";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

// Tarjeta desplegable de resumen — reemplaza el tab "Resumen" que se quitó
// (5 sept 2026, decisión de Joel: sumar Personal+Negocio en un solo número
// contradice la separación que el resto del producto enseña activamente).
// Este componente es genérico a propósito: se monta UNA VEZ en cada Home
// (Personal y cada entidad de negocio) con SUS PROPIOS números — nunca
// recibe ni mezcla cifras de más de un alcance. El cálculo de la
// proyección es el mismo que tenía app/dashboard/resumen/page.tsx (ahora
// eliminado): YTD real + (ritmo diario YTD × días que quedan hasta el 31
// de diciembre), calcado aquí, no un rediseño nuevo.
//
// Colapsada por defecto — es un "para el que quiera profundizar", no algo
// que compita por atención con las tarjetas de arriba (Ingresos/Gastos/
// Metas/Alertas), que es justo el "mucho ruido visual" que Joel señaló
// del tab consolidado viejo.
export default function ResumenCard({
  anio,
  mesLabel,
  ingresosDelMes,
  gastosDelMes,
  ingresosYTD,
  gastosYTD,
  diasTranscurridosAño,
  diasRestantesAño,
  ingresoProyectado,
  gastoProyectado,
  flujoProyectado,
  tasaAhorroYTD,
  reservaImpuestos,
}: {
  anio: number;
  mesLabel: string;
  ingresosDelMes: number;
  gastosDelMes: number;
  ingresosYTD: number;
  gastosYTD: number;
  diasTranscurridosAño: number;
  diasRestantesAño: number;
  ingresoProyectado: number;
  gastoProyectado: number;
  flujoProyectado: number;
  tasaAhorroYTD: number;
  reservaImpuestos?: number;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="vc-card !p-0 mb-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Resumen y proyección {anio}</p>
        <i className={`ti ${abierto ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 14, color: "var(--muted)" }} />
      </button>

      {abierto && (
        <div className="border-t border-border p-4">
          <div className="mb-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Ingresos · {mesLabel}</p>
              <p className="mt-1 text-sm font-medium text-grn">
                <Sensitive>{formatMoney(ingresosDelMes)}</Sensitive>
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Gastos · {mesLabel}</p>
              <p className="mt-1 text-sm font-medium text-red">
                <Sensitive>{formatMoney(gastosDelMes)}</Sensitive>
              </p>
            </div>
          </div>

          <p className="mb-2 mt-1 text-[10px] font-medium uppercase tracking-wide text-muted">Proyección a fin de año ({anio})</p>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Ingreso proyectado total</span>
            <span className="font-medium text-grn">
              <Sensitive>{formatMoney(ingresoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Gastos proyectados</span>
            <span className="font-medium text-red">
              <Sensitive>{formatMoney(gastoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Flujo neto proyectado</span>
            <span className="font-medium">
              <Sensitive>{formatMoney(flujoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between py-2 text-sm">
            <span className="text-muted">Tasa de ahorro (año a la fecha)</span>
            <span className="font-medium">
              {tasaAhorroYTD}% {tasaAhorroYTD >= 20 && <span className="text-grn">— saludable</span>}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Ya llevas <Sensitive>{formatMoney(ingresosYTD)}</Sensitive> en ingresos y{" "}
            <Sensitive>{formatMoney(gastosYTD)}</Sensitive> en gastos en lo que va de {anio} ({diasTranscurridosAño} días) — el
            resto se proyecta al mismo ritmo diario para los {diasRestantesAño} días que quedan hasta el 31 de diciembre.
          </p>

          {reservaImpuestos !== undefined && reservaImpuestos > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">Reserva de impuestos sugerida</p>
                  <p className="mt-0.5 text-xs text-muted">Estimado: 25% de la ganancia de este negocio, año a la fecha</p>
                </div>
                <p className="text-sm font-medium" style={{ color: "#B7860F" }}>
                  <Sensitive>{formatMoney(reservaImpuestos)}</Sensitive>
                </p>
              </div>
              <p className="mt-2 text-[11px] text-muted">Esto es un estimado, no asesoría fiscal — confírmalo con tu contador.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
