"use client";

import { useEffect, useState } from "react";
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
  activo?: boolean;
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
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empleadosLista, setEmpleadosLista] = useState<Emp[]>([]);
  const [sel, setSel] = useState<string[]>([]); // empleados marcados (por defecto, todos)
  const [datos, setDatos] = useState<{ entidad: string; empleados: Emp[]; lineas: Linea[]; desde: string; hasta: string; tipo: Tipo; sel: string[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/nomina/empleados?entityId=${entityId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        const lista = ((j?.empleados ?? []) as Emp[]).filter((e) => e.activo !== false);
        setEmpleadosLista(lista);
        setSel(lista.map((e) => e.id));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [entityId]);

  const [buscar, setBuscar] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = buscar.trim()
    ? empleadosLista.filter((e) => norm(e.nombre).includes(norm(buscar.trim())))
    : empleadosLista;
  // "Marcar todos" actúa sobre los que se ven (filtrados por la búsqueda)
  const todos = visibles.length > 0 && visibles.every((e) => sel.includes(e.id));
  const marcarVisibles = () => {
    const ids = visibles.map((e) => e.id);
    setSel((p) => (todos ? p.filter((x) => !ids.includes(x)) : Array.from(new Set([...p, ...ids]))));
  };
  const alternar = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

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
    if (sel.length === 0) {
      setError("Marca al menos un empleado.");
      return;
    }
    setCargando(true);
    const qs = new URLSearchParams({ entityId, desde, hasta });
    const j = await fetch(`/api/nomina/reportes?${qs}`).then((r) => r.json()).catch(() => null);
    setCargando(false);
    if (!j?.ok) {
      setError(j?.error ?? "No se pudo generar el reporte.");
      return;
    }
    setDatos({ entidad: j.entidad, empleados: j.empleados, lineas: j.lineas, desde, hasta, tipo, sel: [...sel] });
  }

  // Acumulado previo a VICTOR (empleado que ya venía cobrando): solo cuenta si el rango
  // empieza el 1 de enero de ese mismo año.
  function previo(e: Emp, d: string): number {
    const y = Number(d.slice(0, 4));
    return e.ytd_inicial_anio === y && d.endsWith("-01-01") ? n(e.ytd_inicial?.bruto) : 0;
  }

  // Empleados del reporte (los marcados al generar) con sus líneas del rango.
  const grupos = datos
    ? datos.empleados
        .filter((e) => datos.sel.includes(e.id))
        .map((e) => {
          const ls = datos.lineas.filter((l) => l.employee_id === e.id);
          return { e, ls, pv: previo(e, datos.desde), t: sumar(ls) };
        })
    : [];
  // Estado de cuenta y certificación: solo quienes tienen pagos; el resumen también muestra acumulado previo.
  const conPagos = grupos.filter((g) => g.ls.length > 0 || g.pv > 0);

  const cell = (c: (typeof COLS)[number], l: Linea) => (c.k === "horas" ? String(valor(l, c.k)) : formatMoney(valor(l, c.k)));
  const cellT = (c: (typeof COLS)[number], t: Record<string, number>) => (c.k === "horas" ? String(t[c.k]) : formatMoney(t[c.k]));

  function csvEstado() {
    if (!datos) return;
    descargarCsv(`estado-cuenta-${datos.desde}_${datos.hasta}.csv`, [
      ["Empleado", "Periodo", "Fecha de pago", ...COLS.map((c) => c.t)],
      ...conPagos.flatMap((g) => [
        ...g.ls.map((l) => [g.e.nombre, `${fecha(l.periodo_inicio)} - ${fecha(l.periodo_fin)}`, fecha(l.fecha_pago), ...COLS.map((c) => valor(l, c.k).toFixed(2))]),
        [g.e.nombre, "Total", "", ...COLS.map((c) => (g.t[c.k] ?? 0).toFixed(2))],
      ]),
    ]);
  }

  function pdfEstado() {
    if (!datos) return;
    imprimir(
      "Estados de cuenta de nómina",
      conPagos
        .map(
          (g, i) => `<div style="${i > 0 ? "page-break-before:always;" : ""}"><h1>Estado de cuenta del empleado</h1>
<div class="sub">${esc(datos.entidad)} · ${esc(g.e.nombre)}${g.e.ssn_ultimos4 ? ` · SSN ••••${esc(g.e.ssn_ultimos4)}` : ""} · ${fecha(datos.desde)} al ${fecha(datos.hasta)}</div>
<table><tr><th>Periodo</th><th>Pago</th>${COLS.map((c) => `<th>${c.t}</th>`).join("")}</tr>
${g.ls.map((l) => `<tr><td>${fecha(l.periodo_inicio)} - ${fecha(l.periodo_fin)}</td><td>${fecha(l.fecha_pago)}</td>${COLS.map((c) => `<td>${cell(c, l)}</td>`).join("")}</tr>`).join("")}
<tr class="tot"><td>Total</td><td></td>${COLS.map((c) => `<td>${cellT(c, g.t)}</td>`).join("")}</tr></table></div>`
        )
        .join("") + `<p class="nota">Generado por VICTOR CFO a partir de las corridas de nómina aprobadas. Este documento no es un formulario oficial.</p>`
    );
  }

  function pdfCertificacion() {
    if (!datos) return;
    imprimir(
      "Certificaciones de ingresos",
      conPagos
        .map((g, i) => {
          const bruto = r2(g.t.bruto + g.pv);
          const pago = g.e.tipo_pago === "hora" ? `a razón de ${formatMoney(n(g.e.tarifa))} por hora` : `con un salario de ${formatMoney(n(g.e.tarifa))} por período ${g.e.frecuencia}`;
          return `<div style="${i > 0 ? "page-break-before:always;" : ""}"><h1>Certificación de ingresos</h1>
<div class="sub">${esc(datos.entidad)} · Fecha: ${fecha(new Date().toISOString().slice(0, 10))}</div>
<p>A quien corresponda:</p>
<p>Por la presente se certifica que <b>${esc(g.e.nombre)}</b>${g.e.ssn_ultimos4 ? ` (SSN ••••${esc(g.e.ssn_ultimos4)})` : ""} labora en <b>${esc(datos.entidad)}</b>, ${pago}.</p>
<p>Durante el período del ${fecha(datos.desde)} al ${fecha(datos.hasta)}, el empleado devengó ingresos brutos de <b>${formatMoney(bruto)}</b> y un pago neto de <b>${formatMoney(g.t.neto)}</b>${g.pv > 0 ? ` (el bruto incluye ${formatMoney(g.pv)} acumulados antes de usar VICTOR CFO)` : ""}, según los registros de nómina de la empresa.</p>
<div class="firma">Firma autorizada</div></div>`;
        })
        .join("") + `<p class="nota">Preparado con VICTOR CFO a partir de las corridas de nómina aprobadas. La empresa responde por la veracidad de esta certificación.</p>`
    );
  }

  function csvAnual() {
    if (!datos) return;
    descargarCsv(`resumen-nomina-${datos.desde}_${datos.hasta}.csv`, [
      ["Empleado", "SSN (últimos 4)", "Pagos", "Bruto (incl. previo)", "Seg. Social", "Medicare", "Hacienda", "SINOT", "Otras ded.", "Neto"],
      ...conPagos.map((g) => [g.e.nombre, g.e.ssn_ultimos4 ?? "", g.ls.length, (g.t.bruto + g.pv).toFixed(2), g.t.ss_emp.toFixed(2), g.t.medicare_emp.toFixed(2), g.t.hacienda.toFixed(2), g.t.sinot_emp.toFixed(2), g.t.otras.toFixed(2), g.t.neto.toFixed(2)]),
    ]);
  }

  function pdfAnual() {
    if (!datos) return;
    imprimir(
      "Resumen de nómina por empleado",
      `<h1>Resumen de nómina por empleado</h1>
<div class="sub">${esc(datos.entidad)} · ${fecha(datos.desde)} al ${fecha(datos.hasta)}</div>
<table><tr><th>Empleado</th><th>Pagos</th><th>Bruto</th><th>Seg. Social</th><th>Medicare</th><th>Hacienda</th><th>SINOT</th><th>Otras ded.</th><th>Neto</th></tr>
${conPagos.map((g) => `<tr><td>${esc(g.e.nombre)}${g.e.ssn_ultimos4 ? ` ••••${esc(g.e.ssn_ultimos4)}` : ""}</td><td>${g.ls.length}</td><td>${formatMoney(g.t.bruto + g.pv)}</td><td>${formatMoney(g.t.ss_emp)}</td><td>${formatMoney(g.t.medicare_emp)}</td><td>${formatMoney(g.t.hacienda)}</td><td>${formatMoney(g.t.sinot_emp)}</td><td>${formatMoney(g.t.otras)}</td><td>${formatMoney(g.t.neto)}</td></tr>`).join("")}
</table>
<p class="nota">Base para preparar el W-2PR y las planillas. Generado por VICTOR CFO a partir de las corridas aprobadas; no es un formulario oficial.</p>`
    );
  }

  const accionImprimir = datos?.tipo === "estado" ? pdfEstado : datos?.tipo === "certificacion" ? pdfCertificacion : pdfAnual;
  const accionCsv = datos?.tipo === "estado" ? csvEstado : datos?.tipo === "anual" ? csvAnual : null;

  return (
    <div>
      <div className="vc-card mb-3">
        <p className="mb-2 text-sm font-medium">Reportes de nómina</p>
        <p className="mb-1 text-xs font-medium text-muted">1. Tipo de reporte</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {([
            ["estado", "Estado de cuenta del empleado"],
            ["certificacion", "Certificación de ingresos"],
            ["anual", "Resumen por empleado"],
          ] as [Tipo, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTipo(id); setDatos(null); }}
              className={`rounded-full border px-3 py-1 text-xs ${tipo === id ? "border-teal bg-teal/10 text-teal" : "border-border text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted">2. Empleados ({sel.length} de {empleadosLista.length})</p>
          {visibles.length > 1 && (
            <button type="button" className="text-xs font-medium text-teal" onClick={marcarVisibles}>
              {todos ? "Quitar todos" : buscar.trim() ? "Marcar los que salen" : "Marcar todos"}
            </button>
          )}
        </div>
        {empleadosLista.length === 0 ? (
          <p className="mb-3 text-xs text-muted">Todavía no hay empleados.</p>
        ) : (
          <>
            {empleadosLista.length > 5 && (
              <input
                type="search"
                className="vc-input mb-2"
                placeholder="Buscar empleado…"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            )}
            <div className="mb-3 flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-border px-3 py-2">
              {visibles.length === 0 ? (
                <p className="text-xs text-muted">Ningún empleado coincide.</p>
              ) : (
                visibles.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sel.includes(e.id)} onChange={() => alternar(e.id)} />
                    {e.nombre}
                  </label>
                ))
              )}
            </div>
          </>
        )}

        <p className="mb-1 text-xs font-medium text-muted">3. Fechas</p>
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

      {datos && (
        <div className="vc-card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{fecha(datos.desde)} al {fecha(datos.hasta)}</p>
            <div className="flex gap-3 text-xs font-medium text-teal">
              {accionCsv && conPagos.length > 0 && <button onClick={accionCsv}>CSV</button>}
              {conPagos.length > 0 && <button onClick={accionImprimir}>Imprimir / PDF</button>}
            </div>
          </div>

          {conPagos.length === 0 ? (
            <p className="text-xs text-muted">Sin pagos aprobados en este rango para los empleados marcados.</p>
          ) : datos.tipo === "estado" ? (
            <div className="flex flex-col gap-4">
              {conPagos.map((g) => (
                <div key={g.e.id} className="overflow-x-auto">
                  <p className="mb-1 text-xs font-semibold">{g.e.nombre}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1 text-left font-medium">Pago</th>
                        {COLS.map((c) => (<th key={c.t} className="px-1 text-right font-medium">{c.t}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.ls.map((l) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-1">{fecha(l.fecha_pago)}</td>
                          {COLS.map((c) => (<td key={c.t} className="px-1 text-right">{cell(c, l)}</td>))}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-medium">
                        <td className="py-1">Total</td>
                        {COLS.map((c) => (<td key={c.t} className="px-1 text-right">{cellT(c, g.t)}</td>))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : datos.tipo === "certificacion" ? (
            <div className="flex flex-col gap-1">
              {conPagos.map((g) => (
                <p key={g.e.id} className="text-xs text-muted">
                  <b className="text-text">{g.e.nombre}</b> · Bruto: <b>{formatMoney(g.t.bruto + g.pv)}</b> · Neto: <b>{formatMoney(g.t.neto)}</b>
                </p>
              ))}
              <p className="mt-1 text-[11px] text-muted">Usa «Imprimir / PDF» para las cartas (una por empleado, cada una en su página).</p>
            </div>
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
                  {conPagos.map((g) => (
                    <tr key={g.e.id} className="border-t border-border">
                      <td className="py-1">{g.e.nombre}</td>
                      <td className="px-1 text-right">{formatMoney(g.t.bruto + g.pv)}</td>
                      <td className="px-1 text-right">{formatMoney(g.t.ss_emp)}</td>
                      <td className="px-1 text-right">{formatMoney(g.t.medicare_emp)}</td>
                      <td className="px-1 text-right">{formatMoney(g.t.hacienda)}</td>
                      <td className="px-1 text-right">{formatMoney(g.t.neto)}</td>
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
