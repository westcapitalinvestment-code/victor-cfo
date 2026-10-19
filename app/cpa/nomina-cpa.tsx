"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Vista de solo lectura de la Nómina del cliente para el portal del contable
// (19 oct 2026). Muestra lo que el dueño calcula y aprueba en VICTOR: empleados,
// corridas aprobadas con sus depósitos y asiento, acumulado del año por
// empleado y las tasas de la entidad. VICTOR solo calcula: el contable valida.
export type NominaEmpleado = {
  id: string;
  nombre: string;
  ssn_ultimos4: string | null;
  frecuencia: string;
  tipo_pago: string;
  tarifa: number;
  estado_civil: string;
  exencion_personal: string;
  dependientes: number;
  activo: boolean;
};
export type NominaLinea = {
  run_id: string;
  employee_id: string;
  bruto: number;
  neto: number;
  ss_emp: number;
  medicare_emp: number;
  medicare_adic: number;
  hacienda: number;
  sinot_emp: number;
  choferil: number;
  otras_deducciones: number;
  ss_pat: number;
  medicare_pat: number;
  futa: number;
  suta: number;
  sinot_pat: number;
  cfse: number;
};
export type NominaCorrida = {
  id: string;
  frecuencia: string;
  periodo_inicio: string;
  periodo_fin: string;
  fecha_pago: string;
  totales: Record<string, number> | null;
  depositos: Record<string, number> | null;
  asiento: { cuenta: string; debito: number; credito: number }[] | null;
  advertencias: string[] | null;
};
export type NominaConfig = { suta_tasa: number | null; cfse_tasa: number | null; cfse_poliza: string | null; futa_aplica: boolean } | null;

const n = (v: unknown) => Number(v ?? 0);
const fecha = (f: string) => {
  const [y, m, d] = f.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};

export default function NominaCpa({
  empleados,
  corridas,
  lineas,
  config,
  anio,
}: {
  empleados: NominaEmpleado[];
  corridas: NominaCorrida[];
  lineas: NominaLinea[];
  config: NominaConfig;
  anio: number;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const nombre = new Map(empleados.map((e) => [e.id, e.nombre]));

  let bruto = 0, neto = 0, retenciones = 0, patronal = 0;
  const porEmp = new Map<string, { bruto: number; neto: number; hacienda: number; fica: number }>();
  for (const l of lineas) {
    bruto += n(l.bruto);
    neto += n(l.neto);
    retenciones += n(l.ss_emp) + n(l.medicare_emp) + n(l.medicare_adic) + n(l.hacienda) + n(l.sinot_emp) + n(l.choferil);
    patronal += n(l.ss_pat) + n(l.medicare_pat) + n(l.futa) + n(l.suta) + n(l.sinot_pat) + n(l.cfse);
    const a = porEmp.get(l.employee_id) ?? { bruto: 0, neto: 0, hacienda: 0, fica: 0 };
    a.bruto += n(l.bruto);
    a.neto += n(l.neto);
    a.hacienda += n(l.hacienda);
    a.fica += n(l.ss_emp) + n(l.medicare_emp) + n(l.medicare_adic);
    porEmp.set(l.employee_id, a);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="vc-card border-amb/30 bg-amb/5">
        <p className="text-xs text-muted">
          Solo lectura. VICTOR calcula la nómina con las tasas configuradas; no radica planillas ni deposita. Las tasas marcadas
          “por confirmar” (SINOT, choferil, exenciones del 499 R-4, SUTA por defecto, FUTA) son estimado hasta que usted las valide, y la
          retención de Hacienda debe cotejarse con la tabla oficial de SURI.
        </p>
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Acumulado {anio} (corridas aprobadas: {corridas.length})</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-[11px] text-muted">Bruto</p><p className="text-sm font-medium">{formatMoney(bruto)}</p></div>
          <div><p className="text-[11px] text-muted">Retenido a empleados</p><p className="text-sm font-medium">{formatMoney(retenciones)}</p></div>
          <div><p className="text-[11px] text-muted">Costo patronal</p><p className="text-sm font-medium">{formatMoney(patronal)}</p></div>
          <div><p className="text-[11px] text-muted">Neto pagado</p><p className="text-sm font-medium">{formatMoney(neto)}</p></div>
        </div>
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Corridas</p>
        {corridas.length === 0 ? (
          <p className="text-sm text-muted">El cliente todavía no ha aprobado ninguna corrida este año.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {corridas.map((c) => {
              const t = c.totales ?? {};
              const d = c.depositos ?? {};
              const ls = lineas.filter((l) => l.run_id === c.id);
              const open = abierta === c.id;
              return (
                <div key={c.id} className="py-2">
                  <button type="button" onClick={() => setAbierta(open ? null : c.id)} className="flex w-full items-center justify-between text-left">
                    <span className="text-sm">
                      Pago {fecha(c.fecha_pago)} <span className="text-xs text-muted">({fecha(c.periodo_inicio)} – {fecha(c.periodo_fin)}, {c.frecuencia})</span>
                    </span>
                    <span className="text-sm font-medium">{formatMoney(n(t.bruto))}</span>
                  </button>
                  {open && (
                    <div className="mt-2 flex flex-col gap-2 text-xs">
                      <p className="text-muted">
                        Neto {formatMoney(n(t.neto))} · Costo total patrono {formatMoney(n(t.costoTotalPatrono))}
                      </p>
                      <div className="rounded border border-border p-2">
                        <p className="mb-1 font-medium">Depósitos de esta corrida</p>
                        <p>IRS 941-PR: {formatMoney(n(d.irs941))} · Hacienda 499 R-1B: {formatMoney(n(d.hacienda499R1B))} · DTRH (SUTA/SINOT/choferil): {formatMoney(n(d.dtrh))} · FUTA: {formatMoney(n(d.futa))} · Provisión CFSE: {formatMoney(n(d.provisionCfse))}</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="text-muted">
                            <tr><th className="pr-2">Empleado</th><th className="pr-2">Bruto</th><th className="pr-2">SS+Medicare</th><th className="pr-2">Hacienda</th><th className="pr-2">SINOT/chof.</th><th>Neto</th></tr>
                          </thead>
                          <tbody>
                            {ls.map((l) => (
                              <tr key={l.employee_id}>
                                <td className="pr-2">{nombre.get(l.employee_id) ?? "Empleado"}</td>
                                <td className="pr-2">{formatMoney(n(l.bruto))}</td>
                                <td className="pr-2">{formatMoney(n(l.ss_emp) + n(l.medicare_emp) + n(l.medicare_adic))}</td>
                                <td className="pr-2">{formatMoney(n(l.hacienda))}</td>
                                <td className="pr-2">{formatMoney(n(l.sinot_emp) + n(l.choferil))}</td>
                                <td>{formatMoney(n(l.neto))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {(c.asiento ?? []).length > 0 && (
                        <div className="rounded border border-border p-2">
                          <p className="mb-1 font-medium">Asiento contable</p>
                          {(c.asiento ?? []).map((a, i) => (
                            <p key={i} className="flex justify-between">
                              <span>{a.cuenta}</span>
                              <span>{n(a.debito) > 0 ? `Dr ${formatMoney(n(a.debito))}` : `Cr ${formatMoney(n(a.credito))}`}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      {(c.advertencias ?? []).length > 0 && <p className="text-amb">{(c.advertencias ?? []).join(" ")}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Empleados</p>
        {empleados.length === 0 ? (
          <p className="text-sm text-muted">Sin empleados registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr><th className="pr-2">Nombre</th><th className="pr-2">SSN</th><th className="pr-2">Pago</th><th className="pr-2">499 R-4</th><th className="pr-2">Bruto YTD</th><th className="pr-2">Hacienda YTD</th><th>FICA YTD</th></tr>
              </thead>
              <tbody>
                {empleados.map((e) => {
                  const a = porEmp.get(e.id);
                  return (
                    <tr key={e.id} className={e.activo ? "" : "opacity-50"}>
                      <td className="pr-2">{e.nombre}{e.activo ? "" : " (inactivo)"}</td>
                      <td className="pr-2">{e.ssn_ultimos4 ? `***-**-${e.ssn_ultimos4}` : "—"}</td>
                      <td className="pr-2">{e.tipo_pago === "hora" ? `${formatMoney(n(e.tarifa))}/h` : `${formatMoney(n(e.tarifa))}/${e.frecuencia}`}</td>
                      <td className="pr-2">{e.estado_civil.replace("_", " ")}, exención {e.exencion_personal}, {e.dependientes} dep.</td>
                      <td className="pr-2">{formatMoney(a?.bruto ?? 0)}</td>
                      <td className="pr-2">{formatMoney(a?.hacienda ?? 0)}</td>
                      <td>{formatMoney(a?.fica ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {config && (
        <div className="vc-card">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Tasas de la entidad</p>
          <p className="text-xs">
            SUTA: {config.suta_tasa === null ? "por defecto" : `${(n(config.suta_tasa) * 100).toFixed(2)}%`} · CFSE: {config.cfse_tasa === null ? "sin configurar" : `${(n(config.cfse_tasa) * 100).toFixed(2)}%`}
            {config.cfse_poliza ? ` (póliza ${config.cfse_poliza})` : ""} · FUTA: {config.futa_aplica ? "aplica" : "no aplica"}
          </p>
        </div>
      )}
    </div>
  );
}
