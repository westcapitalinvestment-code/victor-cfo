"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Calendario de ausencias, liquidación al salir y horas de licencia para la corrida.

interface MovCal {
  id: string;
  employee_id: string;
  tipo: "vacaciones" | "enfermedad" | "ausencia";
  movimiento: "tomado" | "ajuste";
  fecha: string;
  dias: number;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COLOR: Record<string, string> = { vacaciones: "bg-teal/20", enfermedad: "bg-amb/30", ausencia: "bg-red/20" };
const SIGLA: Record<string, string> = { vacaciones: "V", enfermedad: "E", ausencia: "A" };

export function Calendario({ movimientos, nombre }: { movimientos: MovCal[]; nombre: (id: string) => string }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [abierto, setAbierto] = useState(false);

  const primero = new Date(anio, mes, 1).getDay();
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const prefijo = `${anio}-${String(mes + 1).padStart(2, "0")}-`;
  const porDia: Record<number, MovCal[]> = {};
  for (const m of movimientos) {
    if (m.movimiento !== "tomado" || !m.fecha.startsWith(prefijo)) continue;
    (porDia[Number(m.fecha.slice(8, 10))] ??= []).push(m);
  }
  const mover = (d: number) => {
    const f = new Date(anio, mes + d, 1);
    setAnio(f.getFullYear());
    setMes(f.getMonth());
  };

  // Resumen del mes por empleado (para "días que trabajó / ausentes")
  const resumen: Record<string, { vacaciones: number; enfermedad: number; ausencia: number }> = {};
  for (const lista of Object.values(porDia))
    for (const m of lista) {
      const r = (resumen[m.employee_id] ??= { vacaciones: 0, enfermedad: 0, ausencia: 0 });
      r[m.tipo] += Number(m.dias) || 0;
    }

  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="text-sm font-medium">Calendario de ausencias</span>
        <span className="text-teal">{abierto ? "−" : "+"}</span>
      </button>
      {abierto && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <button className="px-2 text-teal" onClick={() => mover(-1)}>‹</button>
            <span className="text-sm font-medium capitalize">{MESES[mes]} {anio}</span>
            <button className="px-2 text-teal" onClick={() => mover(1)}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: primero }).map((_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: diasMes }).map((_, i) => {
              const d = i + 1;
              const l = porDia[d];
              return (
                <div
                  key={d}
                  title={l?.map((m) => `${nombre(m.employee_id)}: ${m.tipo} ${m.dias}d`).join("\n")}
                  className={`min-h-[34px] rounded border border-border p-0.5 text-[10px] ${l ? COLOR[l[0].tipo] : ""}`}
                >
                  <span className="text-muted">{d}</span>
                  {l && <span className="block font-medium">{l.map((m) => SIGLA[m.tipo]).join("")}{l.length > 1 ? "" : ""}</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-muted">V = vacaciones · E = enfermedad · A = ausencia sin paga. Pasa el cursor sobre un día para ver quién.</p>
          {Object.keys(resumen).length > 0 && (
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-left font-medium">Empleado (este mes)</th>
                  <th className="px-1 text-right font-medium">Vac.</th>
                  <th className="px-1 text-right font-medium">Enf.</th>
                  <th className="px-1 text-right font-medium">Aus.</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(resumen).map(([id, r]) => (
                  <tr key={id} className="border-t border-border">
                    <td className="py-1">{nombre(id)}</td>
                    <td className="px-1 text-right tabular-nums">{r.vacaciones}</td>
                    <td className="px-1 text-right tabular-nums">{r.enfermedad}</td>
                    <td className="px-1 text-right tabular-nums">{r.ausencia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

interface EmpLiq {
  id: string;
  nombre: string;
}
interface Liq {
  empleado: { nombre: string; fechaIngreso: string | null; meses: number | null };
  porConfirmar: boolean;
  tarifaDiaria: number;
  vacaciones: { acumulado: number; ajustes: number; tomados: number; dias: number; monto: number };
  enfermedad: { dias: number; montoSiSePaga: number };
}

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};

export function Liquidacion({ entityId, empleados, onBaja }: { entityId: string; empleados: EmpLiq[]; onBaja: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [empId, setEmpId] = useState("");
  const [salida, setSalida] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const [liq, setLiq] = useState<Liq | null>(null);
  const [pagaEnf, setPagaEnf] = useState(false);
  const [otros, setOtros] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function calcular() {
    setError(null);
    setLiq(null);
    if (!empId) return setError("Escoge un empleado.");
    setCargando(true);
    const j = await fetch(`/api/nomina/liquidacion?entityId=${entityId}&employeeId=${empId}&fechaSalida=${salida}`).then((r) => r.json()).catch(() => null);
    setCargando(false);
    if (!j?.ok) return setError(j?.error ?? "No se pudo calcular.");
    setLiq(j as Liq);
  }

  const total = liq ? Math.round((liq.vacaciones.monto + (pagaEnf ? liq.enfermedad.montoSiSePaga : 0) + (Number(otros) || 0)) * 100) / 100 : 0;

  function imprimir() {
    if (!liq) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const fila = (a: string, b: string) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd">${a}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${b}</td></tr>`;
    w.document.write(`<html><head><title>Liquidación</title></head><body style="font-family:Arial,sans-serif;max-width:640px;margin:24px auto">
      <h2 style="margin:0">Liquidación estimada</h2><p style="color:#666;margin:2px 0 12px">VICTOR CFO · victorcfo.com</p>
      <p><b>${liq.empleado.nombre}</b><br/>Ingreso: ${liq.empleado.fechaIngreso ? fecha(liq.empleado.fechaIngreso) : "—"} · Salida: ${fecha(salida)}${motivo ? ` · ${motivo}` : ""}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${fila(`Vacaciones no usadas (${liq.vacaciones.dias} días × ${formatMoney(liq.tarifaDiaria)})`, formatMoney(liq.vacaciones.monto))}
        ${pagaEnf ? fila(`Enfermedad no usada (${liq.enfermedad.dias} días)`, formatMoney(liq.enfermedad.montoSiSePaga)) : ""}
        ${Number(otros) ? fila("Otros conceptos", formatMoney(Number(otros))) : ""}
        ${fila("<b>Total bruto estimado</b>", `<b>${formatMoney(total)}</b>`)}
      </table>
      <p style="color:#666;font-size:12px;margin-top:16px">Estimado informativo, antes de retenciones. Confirma con tu contable qué conceptos aplican por ley antes de pagar. VICTOR CFO no hace pagos ni radica planillas.</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  async function darDeBaja() {
    if (!liq) return;
    if (!window.confirm(`¿Dar de baja a ${liq.empleado.nombre} con fecha ${fecha(salida)}? Dejará de salir en las corridas; su historial se conserva.`)) return;
    const r = await fetch("/api/nomina/liquidacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, employeeId: empId, fechaSalida: salida, motivo, total }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return setError(j?.error ?? "No se pudo dar de baja.");
    setLiq(null);
    setEmpId("");
    onBaja();
  }

  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="text-sm font-medium">Liquidación al salir un empleado</span>
        <span className="text-teal">{abierto ? "−" : "+"}</span>
      </button>
      {abierto && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] text-muted">
            Estima el pago de las vacaciones acumuladas que no usó, con las reglas de la pestaña Tasas. Después pagas el total en una corrida (campo «Bonos») y das de baja al empleado.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Empleado</span>
              <select className="vc-input" value={empId} onChange={(e) => { setEmpId(e.target.value); setLiq(null); }}>
                <option value="">Escoge...</option>
                {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Último día</span>
              <input className="vc-input" type="date" value={salida} onChange={(e) => { setSalida(e.target.value); setLiq(null); }} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-muted">Motivo (opcional)</span>
              <input className="vc-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
          </div>
          <button className="vc-btn-primary" onClick={calcular} disabled={cargando}>{cargando ? "Calculando..." : "Calcular liquidación"}</button>
          {error && <p className="text-xs text-red">{error}</p>}
          {liq && (
            <div className="flex flex-col gap-2 text-xs">
              {liq.porConfirmar && <p className="rounded-lg border border-amb bg-amb/[.08] px-3 py-2">Las reglas de vacaciones usan valores sugeridos <b>por confirmar</b>.</p>}
              {!liq.empleado.fechaIngreso && <p className="rounded-lg border border-amb bg-amb/[.08] px-3 py-2">Falta la fecha de ingreso: el acumulado sale en cero salvo ajustes.</p>}
              <div className="rounded-lg border border-border p-3">
                <p>Pago por día: <b>{formatMoney(liq.tarifaDiaria)}</b></p>
                <p>Vacaciones: acum. {liq.vacaciones.acumulado} + aj. {liq.vacaciones.ajustes} − tom. {liq.vacaciones.tomados} = <b>{liq.vacaciones.dias} días</b> → <b>{formatMoney(liq.vacaciones.monto)}</b></p>
                <label className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={pagaEnf} onChange={(e) => setPagaEnf(e.target.checked)} />
                  Pagar también enfermedad no usada ({liq.enfermedad.dias} días → {formatMoney(liq.enfermedad.montoSiSePaga)}). Normalmente no se paga; tú decides.
                </label>
                <label className="mt-2 block">
                  <span className="text-muted">Otros conceptos ($, ej. bono proporcional)</span>
                  <input className="vc-input mt-1 w-32" type="number" min="0" step="0.01" value={otros} onChange={(e) => setOtros(e.target.value)} />
                </label>
                <p className="mt-2 text-sm">Total bruto estimado: <b>{formatMoney(total)}</b></p>
              </div>
              <div className="flex gap-2">
                <button className="vc-btn-primary" onClick={imprimir}>Imprimir / PDF</button>
                <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={darDeBaja}>Dar de baja al empleado</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tarjeta para la Corrida: trae las horas de vacaciones/enfermedad pagadas del período.
export function LicenciasEnCorrida({
  entityId,
  inicio,
  fin,
  onAplicar,
}: {
  entityId: string;
  inicio: string;
  fin: string;
  onAplicar: (horas: Record<string, number>) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function traer() {
    setMsg(null);
    setCargando(true);
    const j = await fetch(`/api/nomina/licencias/horas?entityId=${entityId}&desde=${inicio}&hasta=${fin}`).then((r) => r.json()).catch(() => null);
    setCargando(false);
    if (!j?.ok) return setMsg(j?.error ?? "No se pudo consultar.");
    const horas: Record<string, number> = {};
    for (const [id, v] of Object.entries(j.empleados as Record<string, { horas: number }>)) horas[id] = v.horas;
    if (Object.keys(horas).length === 0) return setMsg("No hay vacaciones ni enfermedad registradas en este período.");
    onAplicar(horas);
    setMsg(`Se sumaron las horas de licencia (${j.horasPorDia} h por día) a las horas regulares de los empleados por hora.`);
  }

  return (
    <div className="vc-card flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-medium">Vacaciones y enfermedad del período</p>
        <p className="text-[11px] text-muted">Suma las horas de licencia pagada a los empleados por hora. Los de salario no necesitan ajuste.</p>
        {msg && <p className="mt-1 text-[11px] text-teal">{msg}</p>}
      </div>
      <button className="vc-btn-primary whitespace-nowrap" onClick={traer} disabled={cargando}>{cargando ? "..." : "Sumar horas"}</button>
    </div>
  );
}
