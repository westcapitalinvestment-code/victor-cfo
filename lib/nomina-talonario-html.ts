// Talonarios de nómina (recibos de pago) — HTML puro, sin dependencias de React, para
// usarlo tanto en la ventana de impresión/PDF (cliente) como en el correo al empleado
// (servidor). 21 oct 2026, pedido de Javier Pabón (AVG Accounting) y de Joel.
import { formatMoney } from "./format";

type Num = number | undefined;
export interface LineaTalonario {
  bruto: number;
  desglose: { regular: number; extra: number; comisiones: number; bonos: number; otros: number };
  ssEmp: number;
  medicareEmp: number;
  medicareAdic: number;
  hacienda: number;
  sinotEmp: number;
  choferil: number;
  deduccionMedico: number;
  aporte401k: number;
  otrasDeducciones: number;
  neto: number;
}
export interface Talonario {
  employeeId: string;
  nombre: string;
  email?: string | null;
  ssnUltimos4: string | null;
  tipoPago: string;
  tarifa: number;
  frecuencia: string;
  entrada: { horasRegulares?: Num; horasExtra?: Num; bonoTipo?: string };
  linea: LineaTalonario;
  acumulado: { bruto: number; neto: number; retenciones: number; hacienda: number; otras: number };
  licencias: { vacaciones: number; enfermedad: number };
}
export interface DatosTalonarios {
  entidad: { name: string; ein: string | null; municipio: string | null; phone: string | null; address: string | null; zip: string | null } | null;
  corrida: { periodo_inicio: string; periodo_fin: string; fecha_pago: string; frecuencia: string };
  talonarios: Talonario[];
  logo?: string | null; // data URL (impresión) — en el correo se usa cid:
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const FREC: Record<string, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual", bisemanal: "Bisemanal" };
export const fechaMDY = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${m}/${dd}/${y}`;
};
const h = (v: Num) => (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dias = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

interface Fila {
  a: string;
  b: string;
  c?: string;
  fuerte?: boolean;
}

// Secciones del talonario como datos; luego se pintan con clases (impresión) o con
// estilos en línea (correo, donde muchos clientes ignoran <style>).
function secciones(d: DatosTalonarios, t: Talonario) {
  const l = t.linea;
  const ing: Fila[] = [];
  if (t.tipoPago === "hora") {
    ing.push({ a: "Horas regulares", c: `${h(t.entrada.horasRegulares)} h × ${formatMoney(t.tarifa)}`, b: formatMoney(l.desglose.regular) });
    if (l.desglose.extra > 0) ing.push({ a: "Horas extra", c: `${h(t.entrada.horasExtra)} h`, b: formatMoney(l.desglose.extra) });
  } else {
    ing.push({ a: "Salario", b: formatMoney(l.desglose.regular) });
  }
  if (l.desglose.comisiones > 0) ing.push({ a: "Comisiones", b: formatMoney(l.desglose.comisiones) });
  if (l.desglose.bonos > 0) ing.push({ a: `Bono${t.entrada.bonoTipo ? ` — ${esc(t.entrada.bonoTipo)}` : ""}`, b: formatMoney(l.desglose.bonos) });
  if (l.desglose.otros > 0) ing.push({ a: "Otros ingresos", b: formatMoney(l.desglose.otros) });
  ing.push({ a: "Salario bruto", b: formatMoney(l.bruto), fuerte: true });

  const ded: Fila[] = [];
  const d1 = (a: string, v: number) => {
    if (v > 0) ded.push({ a, b: `− ${formatMoney(v)}` });
  };
  d1("Seguro Social (6.2%)", l.ssEmp);
  d1("Medicare (1.45%)", l.medicareEmp);
  d1("Medicare adicional (0.9%)", l.medicareAdic);
  d1("Contribución sobre ingresos (Hacienda)", l.hacienda);
  d1("SINOT", l.sinotEmp);
  d1("Seguro de choferes", l.choferil);
  d1("Plan médico", l.deduccionMedico);
  d1("401(k)", l.aporte401k);
  d1("Otras deducciones", l.otrasDeducciones);
  if (ded.length === 0) ded.push({ a: "Sin deducciones", b: formatMoney(0) });
  ded.push({ a: "Total deducciones", b: `− ${formatMoney(l.bruto - l.neto)}`, fuerte: true });

  const acum: Fila[] = [
    { a: "Salario bruto", b: formatMoney(t.acumulado.bruto) },
    { a: "Retenciones (SS, Medicare, Hacienda, SINOT)", b: formatMoney(t.acumulado.retenciones) },
    { a: "Neto pagado", b: formatMoney(t.acumulado.neto) },
  ];
  const lic: Fila[] = [
    { a: "Vacaciones", b: dias(t.licencias.vacaciones) },
    { a: "Enfermedad", b: dias(t.licencias.enfermedad) },
  ];
  const e = d.entidad;
  const dir = [e?.address, [e?.municipio, "PR", e?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { ing, ded, acum, lic, dir };
}

// ---------------------------------------------------------------------------
// Impresión / PDF (clases + <style> en la ventana)
// ---------------------------------------------------------------------------
export const CSS_TALONARIO = `
 body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
 .t{max-width:700px;margin:24px auto;padding:0 16px;page-break-after:always}
 .t:last-child{page-break-after:auto}
 .enc{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:10px;gap:12px}
 .enc .id{display:flex;gap:10px;align-items:center}
 .logo{max-height:48px;max-width:140px;object-fit:contain}
 .emp{font-size:16px;font-weight:700}.ti{font-size:14px;font-weight:700;color:#0f766e;white-space:nowrap}
 .peq{font-size:10.5px;color:#555}
 table{width:100%;border-collapse:collapse;margin-bottom:10px}
 th{text-align:left;font-size:11px;background:#f1f5f4;padding:5px 6px;border-bottom:1px solid #ccc}
 td{padding:4px 6px;border-bottom:1px solid #eee}
 .r{text-align:right}.f td{font-weight:700;border-top:1px solid #999}
 .info td{border:0;vertical-align:top;width:33%}
 .neto td{font-size:15px;font-weight:700;background:#e6f4f1;padding:8px 6px}
 .pie{font-size:9.5px;color:#777;margin-top:12px}
 @media print{.t{margin:0 auto}}`;

const filaCls = (f: Fila) => `<tr class="${f.fuerte ? "f" : ""}"><td>${f.a}</td><td class="r">${f.c ?? ""}</td><td class="r">${f.b}</td></tr>`;
const tablaCls = (titulo: string, filas: Fila[], colDer = "Este período") =>
  `<table><thead><tr><th>${titulo}</th><th class="r"></th><th class="r">${colDer}</th></tr></thead><tbody>${filas.map(filaCls).join("")}</tbody></table>`;

export function htmlTalonario(d: DatosTalonarios, t: Talonario): string {
  const e = d.entidad;
  const s = secciones(d, t);
  return `<section class="t">
  <div class="enc">
    <div class="id">${d.logo ? `<img class="logo" src="${d.logo}" alt="">` : ""}<div><div class="emp">${esc(e?.name ?? "")}</div>
    <div class="peq">${esc(s.dir)}${e?.phone ? ` · ${esc(e.phone)}` : ""}${e?.ein ? `<br>EIN ${esc(e.ein)}` : ""}</div></div></div>
    <div class="ti">TALONARIO DE PAGO</div>
  </div>
  <table class="info"><tr>
    <td><b>Empleado</b><br>${esc(t.nombre)}${t.ssnUltimos4 ? `<br><span class="peq">SSN ***-**-${esc(t.ssnUltimos4)}</span>` : ""}</td>
    <td><b>Período</b><br>${fechaMDY(d.corrida.periodo_inicio)} – ${fechaMDY(d.corrida.periodo_fin)}<br><span class="peq">${FREC[t.frecuencia] ?? esc(t.frecuencia)}</span></td>
    <td><b>Fecha de pago</b><br>${fechaMDY(d.corrida.fecha_pago)}</td>
  </tr></table>
  ${tablaCls("Ingresos", s.ing)}
  ${tablaCls("Deducciones", s.ded)}
  <table class="neto"><tr><td>NETO A PAGAR</td><td class="r">${formatMoney(t.linea.neto)}</td></tr></table>
  ${tablaCls("Acumulado del año", s.acum, "")}
  ${tablaCls("Licencias (saldo en días)", s.lic, "")}
  <p class="pie">Generado con VICTOR CFO. Documento informativo del cálculo de nómina; no es una declaración ante Hacienda ni el IRS.</p>
</section>`;
}

export function htmlVentanaTalonarios(d: DatosTalonarios): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Talonarios ${fechaMDY(d.corrida.periodo_inicio)}–${fechaMDY(d.corrida.periodo_fin)}</title>
<style>${CSS_TALONARIO}</style></head><body>${d.talonarios.map((t) => htmlTalonario(d, t)).join("")}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Correo (estilos en línea; el logo va como imagen adjunta con cid:logo)
// ---------------------------------------------------------------------------
const TD = "padding:5px 6px;border-bottom:1px solid #eee;font-size:13px;";
const filaMail = (f: Fila) =>
  `<tr><td style="${TD}${f.fuerte ? "font-weight:700;border-top:1px solid #999;" : ""}">${f.a}</td><td style="${TD}text-align:right;color:#555;">${f.c ?? ""}</td><td style="${TD}text-align:right;${f.fuerte ? "font-weight:700;border-top:1px solid #999;" : ""}">${f.b}</td></tr>`;
const tablaMail = (titulo: string, filas: Fila[], colDer = "Este período") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px 0;"><tr><th align="left" style="background:#f1f5f4;padding:6px;font-size:12px;border-bottom:1px solid #ccc;">${titulo}</th><th style="background:#f1f5f4;border-bottom:1px solid #ccc;"></th><th align="right" style="background:#f1f5f4;padding:6px;font-size:12px;border-bottom:1px solid #ccc;">${colDer}</th></tr>${filas.map(filaMail).join("")}</table>`;

export function htmlTalonarioCorreo(d: DatosTalonarios, t: Talonario, conLogo: boolean): string {
  const e = d.entidad;
  const s = secciones(d, t);
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.45;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #0f766e;margin-bottom:12px;"><tr>
    <td style="padding-bottom:8px;">${conLogo ? `<img src="cid:logo" alt="" style="max-height:48px;max-width:140px;vertical-align:middle;margin-right:10px;">` : ""}<span style="font-size:17px;font-weight:700;vertical-align:middle;">${esc(e?.name ?? "")}</span>
      <div style="font-size:11px;color:#555;">${esc(s.dir)}${e?.phone ? ` · ${esc(e.phone)}` : ""}${e?.ein ? ` · EIN ${esc(e.ein)}` : ""}</div></td>
    <td align="right" style="font-size:14px;font-weight:700;color:#0f766e;white-space:nowrap;vertical-align:top;">TALONARIO DE PAGO</td>
  </tr></table>
  <p style="font-size:13px;margin:0 0 10px 0;"><b>${esc(t.nombre)}</b>${t.ssnUltimos4 ? ` · SSN ***-**-${esc(t.ssnUltimos4)}` : ""}<br>
  Período: ${fechaMDY(d.corrida.periodo_inicio)} – ${fechaMDY(d.corrida.periodo_fin)} (${FREC[t.frecuencia] ?? esc(t.frecuencia)})<br>Fecha de pago: ${fechaMDY(d.corrida.fecha_pago)}</p>
  ${tablaMail("Ingresos", s.ing)}
  ${tablaMail("Deducciones", s.ded)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;"><tr><td style="background:#e6f4f1;padding:10px 6px;font-size:16px;font-weight:700;">NETO A PAGAR</td><td align="right" style="background:#e6f4f1;padding:10px 6px;font-size:16px;font-weight:700;">${formatMoney(t.linea.neto)}</td></tr></table>
  ${tablaMail("Acumulado del año", s.acum, "")}
  ${tablaMail("Licencias (saldo en días)", s.lic, "")}
  <p style="font-size:11px;color:#888;margin-top:14px;">Este talonario es confidencial y es para ti. Si algo no te cuadra, habla con tu empleador. Enviado con VICTOR CFO.</p>
</div>`;
}
