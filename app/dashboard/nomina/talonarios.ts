// Talonarios (recibos de pago) imprimibles / PDF — 21 oct 2026 (pedido de Javier
// Pabón, AVG Accounting). Un talonario por página; "Guardar como PDF" desde el
// diálogo de impresión. Los datos vienen de /api/nomina/talonarios.
import { formatMoney } from "@/lib/format";

type Num = number | undefined;
interface Linea {
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
interface Talonario {
  nombre: string;
  ssnUltimos4: string | null;
  tipoPago: string;
  tarifa: number;
  frecuencia: string;
  entrada: { horasRegulares?: Num; horasExtra?: Num; bonoTipo?: string };
  linea: Linea;
  acumulado: { bruto: number; neto: number; retenciones: number; hacienda: number; otras: number };
  licencias: { vacaciones: number; enfermedad: number };
}
interface Datos {
  entidad: { name: string; ein: string | null; municipio: string | null; phone: string | null; address: string | null; zip: string | null } | null;
  corrida: { periodo_inicio: string; periodo_fin: string; fecha_pago: string; frecuencia: string };
  talonarios: Talonario[];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const FREC: Record<string, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual", bisemanal: "Bisemanal" };
const fecha = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${m}/${dd}/${y}`;
};
const h = (v: Num) => (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dias = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

function fila(a: string, b: string, c = "", fuerte = false) {
  return `<tr class="${fuerte ? "f" : ""}"><td>${a}</td><td class="r">${c}</td><td class="r">${b}</td></tr>`;
}

function htmlTalonario(d: Datos, t: Talonario): string {
  const e = d.entidad;
  const l = t.linea;
  const ing: string[] = [];
  if (t.tipoPago === "hora") {
    ing.push(fila(`Horas regulares`, formatMoney(l.desglose.regular), `${h(t.entrada.horasRegulares)} h × ${formatMoney(t.tarifa)}`));
    if (l.desglose.extra > 0) ing.push(fila(`Horas extra`, formatMoney(l.desglose.extra), `${h(t.entrada.horasExtra)} h`));
  } else {
    ing.push(fila(`Salario`, formatMoney(l.desglose.regular)));
  }
  if (l.desglose.comisiones > 0) ing.push(fila(`Comisiones`, formatMoney(l.desglose.comisiones)));
  if (l.desglose.bonos > 0) ing.push(fila(`Bono${t.entrada.bonoTipo ? ` — ${esc(t.entrada.bonoTipo)}` : ""}`, formatMoney(l.desglose.bonos)));
  if (l.desglose.otros > 0) ing.push(fila(`Otros ingresos`, formatMoney(l.desglose.otros)));

  const ded: string[] = [];
  const d1 = (nombre: string, v: number) => v > 0 && ded.push(fila(nombre, `− ${formatMoney(v)}`));
  d1("Seguro Social (6.2%)", l.ssEmp);
  d1("Medicare (1.45%)", l.medicareEmp);
  d1("Medicare adicional (0.9%)", l.medicareAdic);
  d1("Contribución sobre ingresos (Hacienda)", l.hacienda);
  d1("SINOT", l.sinotEmp);
  d1("Seguro de choferes", l.choferil);
  d1("Plan médico", l.deduccionMedico);
  d1("401(k)", l.aporte401k);
  d1("Otras deducciones", l.otrasDeducciones);
  const totalDed = l.bruto - l.neto;

  const dir = [e?.address, [e?.municipio, "PR", e?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `<section class="t">
  <div class="enc">
    <div><div class="emp">${esc(e?.name ?? "")}</div>
    <div class="peq">${esc(dir)}${e?.phone ? ` · ${esc(e.phone)}` : ""}${e?.ein ? `<br>EIN ${esc(e.ein)}` : ""}</div></div>
    <div class="ti">TALONARIO DE PAGO</div>
  </div>
  <table class="info"><tr>
    <td><b>Empleado</b><br>${esc(t.nombre)}${t.ssnUltimos4 ? `<br><span class="peq">SSN ***-**-${esc(t.ssnUltimos4)}</span>` : ""}</td>
    <td><b>Período</b><br>${fecha(d.corrida.periodo_inicio)} – ${fecha(d.corrida.periodo_fin)}<br><span class="peq">${FREC[t.frecuencia] ?? esc(t.frecuencia)}</span></td>
    <td><b>Fecha de pago</b><br>${fecha(d.corrida.fecha_pago)}</td>
  </tr></table>
  <table><thead><tr><th>Ingresos</th><th class="r"></th><th class="r">Este período</th></tr></thead><tbody>
    ${ing.join("")}${fila("Salario bruto", formatMoney(l.bruto), "", true)}
  </tbody></table>
  <table><thead><tr><th>Deducciones</th><th class="r"></th><th class="r">Este período</th></tr></thead><tbody>
    ${ded.join("") || fila("Sin deducciones", formatMoney(0))}${fila("Total deducciones", `− ${formatMoney(totalDed)}`, "", true)}
  </tbody></table>
  <table class="neto"><tr><td>NETO A PAGAR</td><td class="r">${formatMoney(l.neto)}</td></tr></table>
  <table><thead><tr><th>Acumulado del año</th><th class="r"></th><th class="r"></th></tr></thead><tbody>
    ${fila("Salario bruto", formatMoney(t.acumulado.bruto))}
    ${fila("Retenciones (SS, Medicare, Hacienda, SINOT)", formatMoney(t.acumulado.retenciones))}
    ${fila("Neto pagado", formatMoney(t.acumulado.neto))}
  </tbody></table>
  <table><thead><tr><th>Licencias (saldo en días)</th><th class="r"></th><th class="r"></th></tr></thead><tbody>
    ${fila("Vacaciones", dias(t.licencias.vacaciones))}${fila("Enfermedad", dias(t.licencias.enfermedad))}
  </tbody></table>
  <p class="pie">Generado con VICTOR CFO. Documento informativo del cálculo de nómina; no es una declaración ante Hacienda ni el IRS.</p>
</section>`;
}

export async function abrirTalonarios(corridaId: string, employeeId?: string): Promise<string | null> {
  const qs = new URLSearchParams({ corridaId });
  if (employeeId) qs.set("employeeId", employeeId);
  const r = await fetch(`/api/nomina/talonarios?${qs}`);
  const d = (await r.json().catch(() => null)) as (Datos & { error?: string }) | null;
  if (!r.ok || !d) return d?.error ?? "No se pudieron cargar los talonarios.";
  if (d.talonarios.length === 0) return "Esta corrida no tiene empleados.";
  const w = window.open("", "_blank");
  if (!w) return "Tu navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Talonarios ${fecha(d.corrida.periodo_inicio)}–${fecha(d.corrida.periodo_fin)}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
 .t{max-width:700px;margin:24px auto;padding:0 16px;page-break-after:always}
 .t:last-child{page-break-after:auto}
 .enc{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:10px}
 .emp{font-size:16px;font-weight:700}.ti{font-size:14px;font-weight:700;color:#0f766e}
 .peq{font-size:10.5px;color:#555}
 table{width:100%;border-collapse:collapse;margin-bottom:10px}
 th{text-align:left;font-size:11px;background:#f1f5f4;padding:5px 6px;border-bottom:1px solid #ccc}
 td{padding:4px 6px;border-bottom:1px solid #eee}
 .r{text-align:right}.f td{font-weight:700;border-top:1px solid #999}
 .info td{border:0;vertical-align:top;width:33%}
 .neto td{font-size:15px;font-weight:700;background:#e6f4f1;padding:8px 6px}
 .pie{font-size:9.5px;color:#777;margin-top:12px}
 @media print{.t{margin:0 auto}}
</style></head><body>${d.talonarios.map((t) => htmlTalonario(d, t)).join("")}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return null;
}
