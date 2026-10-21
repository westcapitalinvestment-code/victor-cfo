"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Bono de Navidad (21 oct 2026). Calcula una sugerencia por empleado con las reglas
// configurables de la entidad (pestaña Tasas) y deja editar el monto antes de
// pasarlo al campo «Bonos» de la corrida. VICTOR sugiere; el patrono/contable decide.

interface Fila {
  employeeId: string;
  nombre: string;
  salario: number;
  horas: number;
  horasEstimadas: boolean;
  corridas: number;
  elegible: boolean;
  monto: number;
}
interface Resp {
  anio: number;
  periodo: { desde: string; hasta: string };
  fechaPago: string;
  config: { activo: boolean; pct: number; tope: number; horasMin: number; porConfirmar: boolean };
  filas: Fila[];
}

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};

export default function BonoNavidad({
  entityId,
  empleadosVisibles,
  onAplicar,
}: {
  entityId: string;
  empleadosVisibles: string[]; // ids de empleados que están en la corrida actual
  onAplicar: (montos: Record<string, number>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [datos, setDatos] = useState<Resp | null>(null);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setCargando(true);
    setError(null);
    const j = await fetch(`/api/nomina/bono-navidad?entityId=${entityId}&anio=${anio}`).then((r) => r.json()).catch(() => null);
    setCargando(false);
    if (!j?.ok) {
      setError(j?.error ?? "No se pudo calcular el bono.");
      return;
    }
    setDatos(j as Resp);
    setMontos(Object.fromEntries((j.filas as Fila[]).map((f) => [f.employeeId, f.monto > 0 ? String(f.monto) : ""])));
  }

  function aplicar() {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(montos)) {
      const m = Number(v);
      if (m > 0 && empleadosVisibles.includes(id)) out[id] = m;
    }
    onAplicar(out);
  }

  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="text-sm font-medium">Bono de Navidad</span>
        <span className="text-teal">{abierto ? "−" : "+"}</span>
      </button>
      {abierto && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted">
            Se calcula con las reglas que tú configuras en la pestaña Tasas (porcentaje, tope, horas mínimas y período). Puedes ajustar cada monto antes de
            aplicarlo a la corrida.
          </p>
          <div className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Año del bono</span>
              <input type="number" className="vc-input w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} />
            </label>
            <button className="vc-btn-primary" onClick={calcular} disabled={cargando}>
              {cargando ? "Calculando..." : "Calcular"}
            </button>
          </div>
          {error && <p className="text-xs text-red">{error}</p>}

          {datos && (
            <>
              {!datos.config.activo && (
                <p className="rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">El Bono de Navidad está desactivado en Tasas. Los montos salen en cero.</p>
              )}
              {datos.config.porConfirmar && (
                <p className="rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
                  Usa valores sugeridos (<b>{+(datos.config.pct * 100).toFixed(2)}%</b>, tope <b>{formatMoney(datos.config.tope)}</b>, <b>{datos.config.horasMin}</b> horas) que están
                  <b> por confirmar</b>. Escribe los tuyos en la pestaña Tasas.
                </p>
              )}
              <p className="text-[11px] text-muted">
                Período: {fecha(datos.periodo.desde)} al {fecha(datos.periodo.hasta)} · pagar a más tardar el {fecha(datos.fechaPago)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="py-1 text-left font-medium">Empleado</th>
                      <th className="px-1 text-right font-medium">Salario</th>
                      <th className="px-1 text-right font-medium">Horas</th>
                      <th className="px-1 text-right font-medium">Bono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f) => (
                      <tr key={f.employeeId} className="border-t border-border align-top">
                        <td className="py-1">
                          {f.nombre}
                          {!f.elegible && <span className="block text-[10px] text-muted">{f.corridas === 0 ? "sin corridas en el período" : "no llega a las horas mínimas"}</span>}
                          {!empleadosVisibles.includes(f.employeeId) && <span className="block text-[10px] text-muted">no está en esta corrida</span>}
                        </td>
                        <td className="px-1 text-right tabular-nums">{formatMoney(f.salario)}</td>
                        <td className="px-1 text-right tabular-nums">
                          {f.horas}
                          {f.horasEstimadas ? "*" : ""}
                        </td>
                        <td className="px-1 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="vc-input w-24 text-right"
                            value={montos[f.employeeId] ?? ""}
                            onChange={(e) => setMontos((p) => ({ ...p, [f.employeeId]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {datos.filas.some((f) => f.horasEstimadas) && <p className="text-[10px] text-muted">* Horas estimadas (40 por semana) porque el empleado es de salario y no tiene horas capturadas.</p>}
              <button className="vc-btn-primary" onClick={aplicar}>
                Aplicar bonos a esta corrida
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
