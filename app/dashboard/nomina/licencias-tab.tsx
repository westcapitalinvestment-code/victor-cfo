"use client";

import { useCallback, useEffect, useState } from "react";

// Vacaciones y enfermedad (21 oct 2026): saldos por empleado con las reglas que el
// patrono configura en Tasas, y registro de días tomados / ajustes (saldo inicial).

interface Saldo {
  acumulado: number;
  ajustes: number;
  tomados: number;
  saldo: number;
}
interface Emp {
  id: string;
  nombre: string;
  fechaIngreso: string | null;
  meses: number | null;
  vacaciones: Saldo;
  enfermedad: Saldo;
}
interface Mov {
  id: string;
  employee_id: string;
  tipo: "vacaciones" | "enfermedad";
  movimiento: "tomado" | "ajuste";
  fecha: string;
  dias: number;
  nota: string | null;
  creado_por: string | null;
}
interface Resp {
  reglas: { porConfirmar: boolean; horas_por_dia: number };
  empleados: Emp[];
  movimientos: Mov[];
}

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function LicenciasTab({ entityId }: { entityId: string }) {
  const [datos, setDatos] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empId, setEmpId] = useState("");
  const [tipo, setTipo] = useState<"vacaciones" | "enfermedad">("vacaciones");
  const [movimiento, setMovimiento] = useState<"tomado" | "ajuste">("tomado");
  const [dias, setDias] = useState("");
  const [fch, setFch] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const j = await fetch(`/api/nomina/licencias?entityId=${entityId}`).then((r) => r.json()).catch(() => null);
    if (!j?.ok) {
      setError(j?.error ?? "No se pudieron cargar las licencias.");
      return;
    }
    setError(null);
    setDatos(j as Resp);
  }, [entityId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function registrar() {
    setError(null);
    if (!empId) return setError("Escoge un empleado.");
    if (!(Number(dias) > 0)) return setError("Escribe los días.");
    setGuardando(true);
    const r = await fetch("/api/nomina/licencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, employeeId: empId, tipo, movimiento, dias: Number(dias), fecha: fch, nota }),
    });
    const j = await r.json().catch(() => null);
    setGuardando(false);
    if (!r.ok) return setError(j?.error ?? "No se pudo guardar.");
    setDias("");
    setNota("");
    cargar();
  }

  async function borrar(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    const r = await fetch(`/api/nomina/licencias?entityId=${entityId}&id=${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      return setError(j?.error ?? "No se pudo eliminar.");
    }
    cargar();
  }

  const nombre = (id: string) => datos?.empleados.find((e) => e.id === id)?.nombre ?? "—";

  return (
    <div className="flex flex-col gap-3">
      <div className="vc-card">
        <p className="mb-1 text-sm font-medium">Saldos de vacaciones y enfermedad</p>
        <p className="mb-2 text-[11px] text-muted">
          El saldo = lo acumulado por antigüedad (según las reglas de la pestaña Tasas, con tope) + ajustes − días tomados. Para empleados que ya tenían días acumulados, registra
          un «ajuste» con su saldo inicial.
        </p>
        {datos?.reglas.porConfirmar && (
          <p className="mb-2 rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
            Algunas reglas usan valores sugeridos <b>por confirmar</b>. Escribe los tuyos en la pestaña Tasas.
          </p>
        )}
        {!datos && !error && <p className="text-xs text-muted">Cargando...</p>}
        {datos && datos.empleados.length === 0 && <p className="text-xs text-muted">No hay empleados activos.</p>}
        {datos && datos.empleados.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-left font-medium">Empleado</th>
                  <th className="px-1 text-right font-medium">Vacaciones</th>
                  <th className="px-1 text-right font-medium">Enfermedad</th>
                </tr>
              </thead>
              <tbody>
                {datos.empleados.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="py-1">
                      {e.nombre}
                      {e.fechaIngreso ? (
                        <span className="block text-[10px] text-muted">Ingreso {fecha(e.fechaIngreso)} · {e.meses} meses</span>
                      ) : (
                        <span className="block text-[10px] text-amb">Falta la fecha de ingreso (se edita en Empleados)</span>
                      )}
                    </td>
                    {[e.vacaciones, e.enfermedad].map((s, i) => (
                      <td key={i} className="px-1 text-right tabular-nums">
                        <b className={s.saldo < 0 ? "text-red" : ""}>{s.saldo}</b> d
                        <span className="block text-[10px] text-muted">
                          acum. {s.acumulado} · aj. {s.ajustes} · tom. {s.tomados}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="vc-card flex flex-col gap-2">
        <p className="text-sm font-medium">Registrar días</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Empleado</span>
            <select className="vc-input" value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Escoge...</option>
              {datos?.empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Tipo</span>
            <select className="vc-input" value={tipo} onChange={(e) => setTipo(e.target.value as "vacaciones" | "enfermedad")}>
              <option value="vacaciones">Vacaciones</option>
              <option value="enfermedad">Enfermedad</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Movimiento</span>
            <select className="vc-input" value={movimiento} onChange={(e) => setMovimiento(e.target.value as "tomado" | "ajuste")}>
              <option value="tomado">Días tomados (resta)</option>
              <option value="ajuste">Ajuste / saldo inicial (suma)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Días</span>
            <input className="vc-input" type="number" min="0" step="0.5" value={dias} onChange={(e) => setDias(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Fecha</span>
            <input className="vc-input" type="date" value={fch} onChange={(e) => setFch(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Nota (opcional)</span>
            <input className="vc-input" value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
        </div>
        {datos && <p className="text-[11px] text-muted">Referencia: 1 día = {datos.reglas.horas_por_dia} horas. Para empleados por hora, suma esas horas en la corrida.</p>}
        {error && <p className="text-xs text-red">{error}</p>}
        <button className="vc-btn-primary" onClick={registrar} disabled={guardando}>
          {guardando ? "Guardando..." : "Registrar"}
        </button>
      </div>

      {datos && datos.movimientos.length > 0 && (
        <div className="vc-card">
          <p className="mb-2 text-sm font-medium">Movimientos</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {datos.movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-border align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{fecha(m.fecha)}</td>
                    <td className="pr-2">
                      {nombre(m.employee_id)}
                      {m.nota && <span className="block text-[10px] text-muted">{m.nota}</span>}
                    </td>
                    <td className="pr-2">{m.tipo === "vacaciones" ? "Vacaciones" : "Enfermedad"}</td>
                    <td className="whitespace-nowrap pr-2 text-right tabular-nums">
                      {m.movimiento === "ajuste" ? "+" : "−"}
                      {m.dias} d
                    </td>
                    <td className="text-right">
                      <button className="text-red" onClick={() => borrar(m.id)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
