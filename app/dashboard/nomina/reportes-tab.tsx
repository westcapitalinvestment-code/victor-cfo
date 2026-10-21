"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Reportes de Nómina (21 oct 2026, pedido de Joel): estado de cuenta del empleado,
// certificación de ingresos y resumen del año por empleado. Salen de las corridas
// APROBADAS ya guardadas (nada nuevo que capturar). "Imprimir / PDF" abre una vista
// limpia y usa el diálogo de impresión del navegador (Guardar como PDF).

interface Emp {
  id: string;
  nombre: string;
  ssn_ultimos4: string | null;
  frecuencia: string;
  tipo_pago: string;
  tarifa: number;
  ytd_inicial: { bruto?: number } | null;
  ytd_inicial_anio: number | null;
}
interface Linea {
  id: string;
  employee_id: string;
  entrada: { horasRegulares?: number; horasExtra?: number } | null;
  bruto: number;
  neto: number;
  ss_emp: number;
  medicare_emp: number;
  medicare_adic: number;
  hacienda: number;
  sinot_emp: number;
  choferil: number;
  otras_deducciones: number;
  detalle: { deduccionMedico?: number; aporte401k?: number } | null;
  periodo_inicio: string;
  periodo_fin: string;
  fecha_pago: string;
}
type Tipo = "estado" | "certificacion" | "anual";

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fecha = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function imprimir(titulo: string, cuerpo: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:12px}
h1{font-size:18px;margin:0 0 2px}h2{font-size:13px;margin:18px 0 6px}
.sub{color:#555;margin-bottom:14px}
table{border-collapse:collapse;width:100%;margin-top:6px}
th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:right}
th:first-child,td:first-child{text-align:left}
th{background:#f3f3f3;font-weight:600}
tr.tot td{font-weight:700;border-top:2px solid #111}
.brand{color:#1D9E75;font-weight:700;font-size:11px;margin-bottom:10px}
.firma{margin-top:48px;width:260px;border-top:1px solid #111;padding-top:4px}
.nota{color:#666;font-size:10px;margin-top:20px}
p{line-height:1.5}
@media print{body{margin:16px}}
</style></head><body>
<div class="brand">VICTOR CFO · victorcfo.com</div>${cuerpo}
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

const COLS: { k: keyof Linea | "horas" | "otras"; t: string }[] = [
  { k: "horas", t: "Horas" },
  { k: "bruto", t: "Bruto" },
  { k: "ss_emp", t: "Seg. Social" },
  { k: "medicare_emp", t: "Medicare" },
  { k: "hacienda", t: "Hacienda" },
  { k: "sinot_emp", t: "SINOT" },
  { k: "otras", t: "Otras ded." },
  { k: "neto", t: "Neto" },
];

function valor(l: Linea, k: (typeof COLS)[number]["k"]): number {
  if (k === "horas") return n(l.entrada?.horasRegulares) + n(l.entrada?.horasExtra);
  if (k === "medicare_emp") return n(l.medicare_emp) + n(l.medicare_adic);
  if (k === "otras") return n(l.choferil) + n(l.otras_deducciones) + n(l.detalle?.deduccionMedico) + n(l.detalle?.aporte401k);
  return n(l[k as keyof Linea]);
}

function sumar(ls: Linea[]) {
  const t: Record<string, number> = {};
  for (const c of COLS) t[c.k] = r2(ls.reduce((s, l) => s + valor(l, c.k), 0));
  return t;
}

export default function ReportesTab({ entityId }: { entityId: string }) {
  const anioHoy = new Date().getFullYear();
  const [tipo, setTipo] = useState<Tipo>("estado");
  const [desde, setDesde] = useState(`${anioHoy}-01-01`);
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [empId, setEmpId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<{ entidad: string; empleados: Emp[]; lineas: Linea[]; desde: string; hasta: string; tipo: Tipo; empId: string } | null>(null);
  const [empleadosLista, setEmpleadosLista] = useState<Emp[]>([]);

  async function cargarEmpleados() {
    if (empleadosLista.length > 0) return;
    const j = await fetch(`/api/nomina/empleados?entityId=${entityId}`).then((r) => r.json()).catch(() => null);
    setEmpleadosLista((j?.empleados ?? []) as Emp[]);
  }

  function rango(p: "mes" | "mesAnt" | "anio" | "anioAnt") {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (p === "mes") { setDesde(iso(new Date(Date.UTC(y, m, 1)))); setHasta(iso(new Date(Date.UTC(y, m + 1, 0)))); }
    if (p === "mesAnt") { setDesde(iso(new Date(Date.UTC(y, m - 1, 1)))); setHasta(iso(new Date(Date.UTC(y, m, 0)))); }
    if (p === "anio") { setDesde(`${y}-01-01`); setHasta(`${y}-12-31`); }
    if (p === "anioAnt") { setDesde(`${y - 1}-01-01`); setHasta(`${y - 1}-12-31`); }
  }

  async function generar() {
    setError(null);
    if ((tipo === "estado" || tipo === "certificacion") && !empId) {
      setError("Escoge un empleado.");
      return;
    }
    setCargando(true);
    const qs = new URLSearchParams({ entityId, desde, hasta });
    if (tipo !== "anual" && empId) qs.set("employeeId", empId);
    const j = await fetch(`/api/nomina/reportes?${qs}`).then((r) => r.json()).catch(() => null);
    setCargando(false);
    if (!j?.ok) {
      setError(j?.error ?? "No se pudo generar el reporte.");
      return;
    }
    setDatos({ entidad: j.entidad, empleados: j.empleados, lineas: j.lineas, desde, hasta, tipo, empId });
  }

  // Acumulado previo a VICTOR (empleado que ya venía cobrando): solo cuenta si el rango
  // empieza el 1 de enero de ese mismo año.
  function previo(e: Emp, d: string): number {
    const y = Number(d.slice(0, 4));
    return e.ytd_inicial_anio === y && d.endsWith("-01-01") ? n(e.ytd_inicial?.bruto) : 0;
  }

  const emp = datos ? datos.empleados.find((e) => e.id === datos.empId) : null;
  const lineasEmp = datos && emp ? datos.lineas.filter((l) => l.employee_id === emp.id) : [];

  function csvEstado() {
    if (!datos || !emp) return;
    descargarCsv(`estado-cuenta-${emp.nombre.replace(/\s+/g, "-")}-${datos.desde}_${datos.hasta}.csv`, [
      ["Periodo", "Fecha de pago", ...COLS.map((c) => c.t)],
      ...lineasEmp.map((l) => [`${fecha(l.periodo_inicio)} - ${fecha(l.periodo_fin)}`, fecha(l.fecha_pago), ...COLS.map((c) => valor(l, c.k).toFixed(2))]),
      ["Total", "", ...COLS.map((c) => (sumar(lineasEmp)[c.k] ?? 0).toFixed(2))],
    ]);
  }

  function pdfEstado() {
    if (!datos || !emp) return;
    const t = sumar(lineasEmp);
    imprimir(
      `Estado de cuenta - ${emp.nombre}`,
      `<h1>Estado de cuenta del empleado</h1>
<div class="sub">${esc(datos.entidad)} · ${esc(emp.nombre)}${emp.ssn_ultimos4 ? ` · SSN ••••${esc(emp.ssn_ultimos4)}` : ""} · ${fecha(datos.desde)} al ${fecha(datos.hasta)}</div>
<table><tr><th>Periodo</th><th>Pago</th>${COLS.map((c) => `<th>${c.t}</th>`).join("")}</tr>
${lineasEmp
  .map((l) => `<tr><td>${fecha(l.periodo_inicio)} - ${fecha(l.periodo_fin)}</td><td>${fecha(l.fecha_pago)}</td>${COLS.map((c) => `<td>${c.k === "horas" ? valor(l, c.k) : formatMoney(valor(l, c.k))}</td>`).join("")}</tr>`)
  .join("")}
<tr class="tot"><td>Total</td><td></td>${COLS.map((c) => `<td>${c.k === "horas" ? t[c.k] : formatMoney(t[c.k])}</td>`).join("")}</tr></table>
<p class="nota">Generado por VICTOR CFO a partir de las corridas de nómina aprobadas. Este documento no es un formulario oficial.</p>`
    );
  }

  function pdfCertificacion() {
    if (!datos || !emp) return;
    const t = sumar(lineasEmp);
    const pv = previo(emp, datos.desde);
    const bruto = r2(t.bruto + pv);
    const pago = emp.tipo_pago === "hora" ? `a razón de ${formatMoney(n(emp.tarifa))} por hora` : `con un salario de ${formatMoney(n(emp.tarifa))} por período ${emp.frecuencia}`;
    imprimir(
      `Certificación de ingresos - ${emp.nombre}`,
      `<h1>Certificación de ingresos</h1>
<div class="sub">${esc(datos.entidad)} · Fecha: ${fecha(new Date().toISOString().slice(0, 10))}</div>
<p>A quien corresponda:</p>
<p>Por la presente se certifica que <b>${esc(emp.nombre)}</b>${emp.ssn_ultimos4 ? ` (SSN ••••${esc(emp.ssn_ultimos4)})` : ""} labora en <b>${esc(datos.entidad)}</b>, ${pago}.</p>
<p>Durante el período del ${fecha(datos.desde)} al ${fecha(datos.hasta)}, el empleado devengó ingresos brutos de <b>${formatMoney(bruto)}</b> y un pago neto de <b>${formatMoney(t.neto)}</b>${pv > 0 ? ` (el bruto incluye ${formatMoney(pv)} acumulados antes de usar VICTOR CFO)` : ""}, según los registros de nómina de la empresa.</p>
<div class="firma">Firma autorizada</div>
<p class="nota">Preparado con VICTOR CFO a partir de las corridas de nómina aprobadas. La empresa responde por la veracidad de esta certificación.</p>`
    );
  }

  // Resumen del año: una fila por empleado.
  const filasAnual = datos && datos.tipo === "anual"
    ? datos.empleados
        .map((e) => {
          const ls = datos.lineas.filter((l) => l.employee_id === e.id);
          const pv = previo(e, datos.desde);
          return { e, pagos: ls.length, pv, t: sumar(ls) };
        })
        .filter((f) => f.pagos > 0 || f.pv > 0)
    : [];

  function csvAnual() {
    if (!datos) return;
    descargarCsv(`resumen-nomina-${datos.desde}_${datos.hasta}.csv`, [
      ["Empleado", "SSN (últimos 4)", "Pagos", "Bruto (incl. previo)", "Seg. Social", "Medicare", "Hacienda", "SINOT", "Otras ded.", "Neto"],
      ...filasAnual.map((f) => [f.e.nombre, f.e.ssn_ultimos4 ?? "", f.pagos, (f.t.bruto + f.pv).toFixed(2), f.t.ss_emp.toFixed(2), f.t.medicare_emp.toFixed(2), f.t.hacienda.toFixed(2), f.t.sinot_emp.toFixed(2), f.t.otras.toFixed(2), f.t.neto.toFixed(2)]),
    ]);
  }

  function pdfAnual() {
    if (!datos) return;
    imprimir(
      "Resumen de nómina por empleado",
      `<h1>Resumen de nómina por empleado</h1>
<div class="sub">${esc(datos.entidad)} · ${fecha(datos.desde)} al ${fecha(datos.hasta)}</div>
<table><tr><th>Empleado</th><th>Pagos</th><th>Bruto</th><th>Seg. Social</th><th>Medicare</th><th>Hacienda</th><th>SINOT</th><th>Otras ded.</th><th>Neto</th></tr>
${filasAnual.map((f) => `<tr><td>${esc(f.e.nombre)}${f.e.ssn_ultimos4 ? ` ••••${esc(f.e.ssn_ultimos4)}` : ""}</td><td>${f.pagos}</td><td>${formatMoney(f.t.bruto + f.pv)}</td><td>${formatMoney(f.t.ss_emp)}</td><td>${formatMoney(f.t.medicare_emp)}</td><td>${formatMoney(f.t.hacienda)}</td><td>${formatMoney(f.t.sinot_emp)}</td><td>${formatMoney(f.t.otras)}</td><td>${formatMoney(f.t.neto)}</td></tr>`).join("")}
</table>
<p class="nota">Base para preparar el W-2PR y las planillas. Generado por VICTOR CFO a partir de las corridas aprobadas; no es un formulario oficial.</p>`
    );
  }

  return (
    <div>
      <div className="vc-card mb-3">
        <p className="mb-2 text-sm font-medium">Reportes de nómina</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {([
            ["estado", "Estado de cuenta del empleado"],
            ["certificacion", "Certificación de ingresos"],
            ["anual", "Resumen por empleado"],
          ] as [Tipo, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTipo(id); setDatos(null); cargarEmpleados(); }}
              className={`rounded-full border px-3 py-1 text-xs ${tipo === id ? "border-teal bg-teal/10 text-teal" : "border-border text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tipo !== "anual" && (
          <label className="mb-2 block">
            <span className="mb-1 block text-xs font-medium text-muted">Empleado</span>
            <select className="vc-input" value={empId} onFocus={cargarEmpleados} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">Escoge...</option>
              {empleadosLista.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Desde</span>
            <input type="date" className="vc-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Hasta</span>
            <input type="date" className="vc-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          <button className="text-teal" onClick={() => rango("mes")}>Este mes</button>
          <button className="text-teal" onClick={() => rango("mesAnt")}>Mes anterior</button>
          <button className="text-teal" onClick={() => rango("anio")}>Este año</button>
          <button className="text-teal" onClick={() => rango("anioAnt")}>Año anterior</button>
        </div>
        <button className="vc-btn-primary" onClick={generar} disabled={cargando}>
          {cargando ? "Generando..." : "Generar reporte"}
        </button>
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
        <p className="mt-2 text-[11px] text-muted">Usa solo corridas aprobadas, por fecha de pago.</p>
      </div>

      {datos && datos.tipo !== "anual" && emp && (
        <div className="vc-card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{emp.nombre} · {fecha(datos.desde)} al {fecha(datos.hasta)}</p>
            <div className="flex gap-3 text-xs font-medium text-teal">
              {datos.tipo === "estado" && <button onClick={csvEstado}>CSV</button>}
              <button onClick={datos.tipo === "estado" ? pdfEstado : pdfCertificacion}>Imprimir / PDF</button>
            </div>
          </div>
          {lineasEmp.length === 0 ? (
            <p className="text-xs text-muted">Sin pagos aprobados en este rango.</p>
          ) : datos.tipo === "estado" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 text-left font-medium">Pago</th>
                    {COLS.map((c) => (<th key={c.t} className="px-1 text-right font-medium">{c.t}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {lineasEmp.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="py-1">{fecha(l.fecha_pago)}</td>
                      {COLS.map((c) => (<td key={c.t} className="px-1 text-right">{c.k === "horas" ? valor(l, c.k) : formatMoney(valor(l, c.k))}</td>))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-medium">
                    <td className="py-1">Total</td>
                    {COLS.map((c) => (<td key={c.t} className="px-1 text-right">{c.k === "horas" ? sumar(lineasEmp)[c.k] : formatMoney(sumar(lineasEmp)[c.k])}</td>))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted">
              Bruto del período: <b>{formatMoney(sumar(lineasEmp).bruto + previo(emp, datos.desde))}</b> · Neto: <b>{formatMoney(sumar(lineasEmp).neto)}</b>. Usa «Imprimir / PDF» para la carta.
            </p>
          )}
        </div>
      )}

      {datos && datos.tipo !== "anual" && !emp && (
        <p className="text-xs text-muted">Empleado no encontrado.</p>
      )}

      {datos && datos.tipo === "anual" && (
        <div className="vc-card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{fecha(datos.desde)} al {fecha(datos.hasta)}</p>
            <div className="flex gap-3 text-xs font-medium text-teal">
              <button onClick={csvAnual}>CSV</button>
              <button onClick={pdfAnual}>Imprimir / PDF</button>
            </div>
          </div>
          {filasAnual.length === 0 ? (
            <p className="text-xs text-muted">Sin pagos aprobados en este rango.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 text-left font-medium">Empleado</th>
                    <th className="px-1 text-right font-medium">Bruto</th>
                    <th className="px-1 text-right font-medium">Seg. Social</th>
                    <th className="px-1 text-right font-medium">Medicare</th>
                    <th className="px-1 text-right font-medium">Hacienda</th>
                    <th className="px-1 text-right font-medium">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {filasAnual.map((f) => (
                    <tr key={f.e.id} className="border-t border-border">
                      <td className="py-1">{f.e.nombre}</td>
                      <td className="px-1 text-right">{formatMoney(f.t.bruto + f.pv)}</td>
                      <td className="px-1 text-right">{formatMoney(f.t.ss_emp)}</td>
                      <td className="px-1 text-right">{formatMoney(f.t.medicare_emp)}</td>
                      <td className="px-1 text-right">{formatMoney(f.t.hacienda)}</td>
                      <td className="px-1 text-right">{formatMoney(f.t.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
