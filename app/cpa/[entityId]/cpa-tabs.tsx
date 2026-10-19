"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import BovedaCompartida from "../boveda-compartida";
import NominaCpa, { type NominaEmpleado, type NominaCorrida, type NominaLinea, type NominaConfig } from "../nomina-cpa";
import Formularios480 from "../formularios-480";
import type { EstadoResultados } from "@/lib/estado-resultados";
import { MESES_CORTOS } from "@/lib/estado-resultados";

type DesgloseIvuPropinas = { ivuEstatal: number; ivuMunicipal: number; propinas: number };
type ResumenPos = { grossSales: number; ivuEstatal: number; ivuMunicipal: number; tips: number; netSales: number };

type IvuTracker = {
  ivu_collected: number;
  ivu_paid_credits: number;
  ivu_net_due: number;
  due_date: string;
  deposit_status: "pendiente" | "depositado" | "overdue";
  deposit_date: string | null;
  suri_confirmation_number: string | null;
} | null;

type IvuReconciliation = {
  ivu_declared_suri: number;
  ivu_bank_deposits: number;
  ivu_processor_reported: number;
  variance_bank: number;
  variance_processor: number;
  semaphore_status: "verde" | "amarillo" | "rojo";
  alert_message: string | null;
} | null;

type Recibo = {
  id: string;
  descripcion: string | null;
  monto_declarado: number;
  categoria_sugerida: string | null;
  estado: "pendiente" | "con_foto" | "resuelto";
  fecha_captura: string;
};

type Vendor = {
  id: string;
  name: string;
  tax_id: string | null;
  vendor_type: string;
  retention_type: string | null;
  default_retention_pct: number;
  is_corporation: boolean;
  address: string | null;
  relevo_fecha_expiracion: string | null;
  relevo_r2_key: string | null;
  registro_comerciante_r2_key: string | null;
};

type Retencion = {
  id?: string;
  vendor_id: string;
  gross_amount?: number;
  retention_pct?: number;
  retention_amount: number;
  net_paid?: number;
  remittance_status: "pendiente" | "remesado";
  period_start: string;
  period_end: string;
  cheque_numero?: number | null;
  cheque_fecha?: string | null;
  cheque_anulado?: boolean | null;
};

// Pagos individuales a contratistas con número de cheque (15 oct 2026): el
// contable los cuadra contra el estado de cuenta del banco.
function PagosRegistrados({ retenciones, vendors }: { retenciones: Retencion[]; vendors: { id: string; name: string }[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloCheques, setSoloCheques] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const nombre = new Map(vendors.map((v) => [v.id, v.name]));
  const filas = retenciones
    .filter((r) => (!desde || r.period_start >= desde) && (!hasta || r.period_start <= hasta) && (!soloCheques || r.cheque_numero != null))
    .slice()
    .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));
  const total = filas.filter((r) => !r.cheque_anulado).reduce((s, r) => s + Number(r.net_paid ?? 0), 0);
  return (
    <div className="vc-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Pagos registrados</p>
        <button type="button" className="vc-btn-back" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Ocultar lista ▲" : `Desplegar lista (${filas.length}) ▼`}
        </button>
      </div>
      {!abierto && (
        <p className="text-xs text-muted">
          {filas.length} pago(s) · neto <span className="font-medium text-text">{formatMoney(total)}</span>
        </p>
      )}
      {abierto && (
      <>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-xs">
        <label>
          <span className="block text-muted">Desde</span>
          <input type="date" className="vc-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          <span className="block text-muted">Hasta</span>
          <input type="date" className="vc-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soloCheques} onChange={(e) => setSoloCheques(e.target.checked)} /> Solo con cheque
        </label>
        <span className="ml-auto text-muted">
          {filas.length} pago(s) · neto <span className="font-medium text-text">{formatMoney(total)}</span>
        </span>
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-muted">No hay pagos en ese filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {filas.map((r, i) => (
            <li key={r.id ?? i} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate">{nombre.get(r.vendor_id) ?? "Contratista"}</p>
                <p className="text-[11px] text-muted">
                  {r.period_start} · Bruto {formatMoney(Number(r.gross_amount ?? 0))} · Ret. {formatMoney(Number(r.retention_amount ?? 0))}
                  {r.retention_pct != null ? ` (${Number(r.retention_pct)}%)` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.cheque_numero != null && (
                  <Badge tone={r.cheque_anulado ? "red" : "grn"}>
                    Cheque #{r.cheque_numero}
                    {r.cheque_anulado ? " · anulado" : ""}
                  </Badge>
                )}
                <span className={`font-medium ${r.cheque_anulado ? "text-muted line-through" : ""}`}>
                  {formatMoney(Number(r.net_paid ?? 0))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  );
}

type Validacion480 = {
  id: string;
  vendor_id: string;
  name_confirmed: boolean;
  address_confirmed: boolean;
  tax_id_confirmed: boolean;
  total_paid_ytd: number;
  ready_for_480: boolean;
};

type MetricasFacturas = { emitidas: number; cobradas: number; vencidas: number; total: number };

type ClienteExento = {
  id: string;
  name: string;
  exemption_certificate_number: string | null;
  exemption_validated: boolean;
};

type Estimado = {
  id: string;
  quarter: number;
  period_year: number;
  amount_due: number;
  due_date: string;
  status: "pendiente" | "pagado";
  paid_date: string | null;
};

type Auditoria = {
  id: string;
  actor_role: string;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  changes: unknown;
  created_at: string;
};

// Orden de tabs (2 oct 2026, pedido de Joel: "algo organizado como Victor
// ... me imagino que lo que le interesará es lo que tiene que entregar el 15
// y el 20 de cada mes") — Facturación y Pagos van primero porque son el
// trabajo del día a día del CPA (vencimientos 480.9A día 15, facturación
// del cliente); Resultados/IVU/Recibos/Estimados/Auditoría quedan como
// contexto adicional, no lo primero que se ve al entrar.
const TABS = [
  { id: "facturas", label: "Facturación", icon: "ti-file-invoice" },
  { id: "retenciones", label: "Pagos", icon: "ti-file-percent" },
  { id: "nomina", label: "Nómina", icon: "ti-receipt-2" },
  { id: "resultados", label: "Resultados", icon: "ti-chart-bar" },
  { id: "ivu", label: "IVU", icon: "ti-receipt-tax" },
  { id: "recibos", label: "Recibos", icon: "ti-camera" },
  { id: "boveda", label: "Bóveda", icon: "ti-folder" },
  { id: "estimados", label: "Estimados", icon: "ti-calendar-dollar" },
  { id: "auditoria", label: "Auditoría", icon: "ti-history" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Badge({ tone, children }: { tone: "grn" | "amb" | "red" | "muted"; children: React.ReactNode }) {
  const clases =
    tone === "grn"
      ? "bg-grn/10 text-grn"
      : tone === "amb"
        ? "bg-amb/10 text-amb"
        : tone === "red"
          ? "bg-red/10 text-red"
          : "bg-muted/10 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${clases}`}>{children}</span>;
}

const TZ = "America/Puerto_Rico";

const ACCIONES: Record<string, string> = {
  documento_creado: "Documento creado",
  documento_editado: "Documento editado",
  documento_renovado: "Documento renovado / cambio de vencimiento",
  documento_eliminado: "Documento eliminado",
  archivo_agregado: "Archivo agregado",
  archivo_eliminado: "Archivo eliminado",
  category_override: "Categoría corregida",
};

const ROLES: Record<string, string> = { owner: "Dueño", admin: "Admin / secretaria", cpa: "Contable", system: "Sistema" };

function fechaCorta(f: unknown): string {
  if (typeof f !== "string" || f.length < 10) return "sin fecha";
  const [y, m, d] = f.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function detalleAuditoria(a: Auditoria): string {
  const c = (a.changes ?? {}) as Record<string, unknown>;
  const doc = typeof c.documento === "string" ? c.documento : null;
  if (a.action === "documento_renovado")
    return `${doc ?? "Documento"}: vencimiento ${fechaCorta(c.fecha_anterior)} → ${fechaCorta(c.fecha_nueva)}`;
  if (a.action === "documento_editado") {
    const partes: string[] = [];
    if (typeof c.nombre_anterior === "string") partes.push(`antes "${c.nombre_anterior}"`);
    if (c.compartido_antes !== c.compartido_ahora)
      partes.push(c.compartido_ahora ? "ahora compartido con el contable" : "ya no se comparte con el contable");
    return `${doc ?? "Documento"}${partes.length ? " — " + partes.join(", ") : ""}`;
  }
  if (a.action === "archivo_agregado" || a.action === "archivo_eliminado")
    return `${doc ?? "Documento"}${typeof c.archivo === "string" && c.archivo ? ` (${c.archivo})` : ""}`;
  if (doc) return doc;
  return a.target_table ?? "";
}

// Valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") → instante UTC
// interpretando la hora como hora de Puerto Rico (AST, UTC-4 todo el año).
function localPRaMs(v: string): number | null {
  if (!v) return null;
  const ms = Date.parse(`${v}:00-04:00`);
  return Number.isNaN(ms) ? null : ms;
}

function AuditoriaTab({ auditoria }: { auditoria: Auditoria[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [accion, setAccion] = useState("");
  const [rol, setRol] = useState("");

  const dMs = localPRaMs(desde);
  const hMs = localPRaMs(hasta);
  const filtrados = auditoria.filter((a) => {
    const t = new Date(a.created_at).getTime();
    if (dMs !== null && t < dMs) return false;
    if (hMs !== null && t > hMs + 59_999) return false;
    if (accion && a.action !== accion) return false;
    if (rol && a.actor_role !== rol) return false;
    return true;
  });
  const hayFiltro = !!(desde || hasta || accion || rol);

  return (
    <div className="vc-card">
      <p className="mb-3 text-xs uppercase tracking-wide text-muted">Historial de cambios</p>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Desde (fecha y hora)</label>
          <input className="vc-input" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Hasta (fecha y hora)</label>
          <input className="vc-input" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Tipo de cambio</label>
          <select className="vc-input" value={accion} onChange={(e) => setAccion(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Quién</label>
          <select className="vc-input" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          {filtrados.length} de {auditoria.length} registros · horas en hora de Puerto Rico
        </span>
        {hayFiltro && (
          <button
            type="button"
            className="text-teal"
            onClick={() => {
              setDesde("");
              setHasta("");
              setAccion("");
              setRol("");
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-muted">
          {auditoria.length === 0 ? "No hay actividad registrada todavía." : "Nada coincide con esos filtros."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtrados.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{ACCIONES[a.action] ?? a.action}</p>
                <span className="whitespace-nowrap text-[11px] text-muted">
                  {new Date(a.created_at).toLocaleString("es-PR", { timeZone: TZ })}
                </span>
              </div>
              <p className="text-xs">{detalleAuditoria(a)}</p>
              <p className="text-[11px] text-muted">
                {ROLES[a.actor_role] ?? a.actor_role}
                {a.actor_email ? ` · ${a.actor_email}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CpaTabs({
  ivuApplies,
  ivuTracker,
  ivuReconciliation,
  recibos,
  vendors,
  validaciones480,
  totalRetencionesPendientes,
  metricasFacturas,
  resumenFacturacion,
  depositoMensual,
  clientesExentos,
  estimados,
  auditoria,
  estadoResultados,
  anioResultados,
  desgloseIvuPropinas,
  resumenPos,
  tienePos,
  retenciones,
  nomina,
  entityId,
  ownerId,
}: {
  ivuApplies: boolean;
  ivuTracker: IvuTracker;
  ivuReconciliation: IvuReconciliation;
  recibos: Recibo[];
  vendors: Vendor[];
  validaciones480: Validacion480[];
  totalRetencionesPendientes: number;
  metricasFacturas: MetricasFacturas;
  resumenFacturacion: {
    facturado: number;
    cantidadFacturas: number;
    cobrado: number;
    pctCobrado: number;
    pendiente: number;
    cantidadPendiente: number;
    vencido: number;
    cantidadVencida: number;
  };
  depositoMensual: { anio: number; mes: number; totalDolares: number; venceISO: string; vencido: boolean };
  clientesExentos: ClienteExento[];
  estimados: Estimado[];
  auditoria: Auditoria[];
  estadoResultados: EstadoResultados;
  anioResultados: number;
  desgloseIvuPropinas: DesgloseIvuPropinas;
  resumenPos: ResumenPos;
  tienePos: boolean;
  retenciones: Retencion[];
  nomina: { empleados: NominaEmpleado[]; corridas: NominaCorrida[]; lineas: NominaLinea[]; config: NominaConfig };
  entityId: string;
  ownerId: string;
}) {
  const [tab, setTab] = useState<TabId>("facturas");
  const hoyISO = new Date().toISOString().slice(0, 10);
  const MESES_ES_LARGO = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((t) => t.id !== "nomina" || nomina.empleados.length > 0 || nomina.corridas.length > 0).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.id ? "border-teal text-teal" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "resultados" && (
        <div className="flex flex-col gap-3">
          <div className="vc-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">Estado de Resultados — {anioResultados}</p>
              <div className="flex items-center gap-3 text-xs">
                <a href={`?anio=${anioResultados - 1}`} className="text-muted hover:text-teal">
                  ← {anioResultados - 1}
                </a>
                <a href={`?anio=${anioResultados + 1}`} className="text-muted hover:text-teal">
                  {anioResultados + 1} →
                </a>
                <span className="text-border">|</span>
                <a
                  href={`/api/reportes/estado-resultados/pdf?entityId=${entityId}&anio=${anioResultados}`}
                  target="_blank"
                  className="flex items-center gap-1 text-muted hover:text-teal"
                >
                  <i className="ti ti-file-type-pdf" /> PDF
                </a>
                <a
                  href={`/api/reportes/estado-resultados/excel?entityId=${entityId}&anio=${anioResultados}`}
                  className="flex items-center gap-1 text-muted hover:text-teal"
                >
                  <i className="ti ti-file-type-xls" /> Excel
                </a>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-4">
              <div>
                <p className="text-[11px] text-muted">Ingresos</p>
                <p className="text-base font-semibold text-grn">{formatMoney(estadoResultados.totalIngresos)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Gastos</p>
                <p className="text-base font-semibold text-red">{formatMoney(estadoResultados.totalGastos)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Utilidad neta</p>
                <p className={`text-base font-semibold ${estadoResultados.utilidadNeta >= 0 ? "text-grn" : "text-red"}`}>
                  {formatMoney(estadoResultados.utilidadNeta)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-muted">Categoría</th>
                    {MESES_CORTOS.map((m) => (
                      <th key={m} className="whitespace-nowrap px-2 py-1 text-right font-medium text-muted">
                        {m}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-2 py-1 text-right font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Tintes de fondo por sección (10 oct 2026, mismo fix que
                      dashboard/negocio/estado-resultados: "se ve todo junto y
                      no se distingue... fatiga visual") — cada bloque lleva
                      su color de principio a fin, no solo el encabezado. */}
                  <tr>
                    <td colSpan={14} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: "#0f6b4e" }}>
                      Ingresos
                    </td>
                  </tr>
                  {estadoResultados.ingresos.map((l) => (
                    <tr key={`ing-${l.categoriaId ?? "sc"}`} className="border-b border-border/50" style={{ background: "rgba(15,107,78,0.06)" }}>
                      <td className="whitespace-nowrap px-2 py-1">{l.nombre}</td>
                      {l.porMes.map((v, i) => (
                        <td key={i} className="whitespace-nowrap px-2 py-1 text-right">
                          {v ? formatMoney(v, 0) : "—"}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1 text-right font-medium">{formatMoney(l.total, 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-b-2" style={{ borderColor: "#0f6b4e", background: "rgba(15,107,78,0.06)" }}>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold text-teal">Total ingresos</td>
                    {estadoResultados.totalIngresosPorMes.map((v, i) => (
                      <td key={i} className="whitespace-nowrap px-2 py-1 text-right font-semibold text-teal">
                        {formatMoney(v, 0)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1 text-right font-bold text-teal">{formatMoney(estadoResultados.totalIngresos, 0)}</td>
                  </tr>

                  <tr style={{ height: "8px" }}>
                    <td colSpan={14} />
                  </tr>

                  <tr>
                    <td colSpan={14} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: "#d44c3d" }}>
                      Gastos
                    </td>
                  </tr>
                  {estadoResultados.gastos.map((l) => (
                    <tr key={`gas-${l.categoriaId ?? "sc"}`} className="border-b border-border/50" style={{ background: "rgba(212,76,61,0.06)" }}>
                      <td className="whitespace-nowrap px-2 py-1">{l.nombre}</td>
                      {l.porMes.map((v, i) => (
                        <td key={i} className="whitespace-nowrap px-2 py-1 text-right">
                          {v ? formatMoney(v, 0) : "—"}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1 text-right font-medium">{formatMoney(l.total, 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-b-2" style={{ borderColor: "#d44c3d", background: "rgba(212,76,61,0.06)" }}>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold text-red">Total gastos</td>
                    {estadoResultados.totalGastosPorMes.map((v, i) => (
                      <td key={i} className="whitespace-nowrap px-2 py-1 text-right font-semibold text-red">
                        {formatMoney(v, 0)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1 text-right font-bold text-red">{formatMoney(estadoResultados.totalGastos, 0)}</td>
                  </tr>

                  <tr style={{ height: "8px" }}>
                    <td colSpan={14} />
                  </tr>

                  <tr className="border-t-2 border-teal">
                    <td className="whitespace-nowrap px-2 py-1 font-semibold text-teal">Utilidad neta</td>
                    {estadoResultados.utilidadPorMes.map((v, i) => (
                      <td key={i} className="whitespace-nowrap px-2 py-1 text-right font-semibold text-teal">
                        {formatMoney(v, 0)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1 text-right font-bold text-teal">
                      {formatMoney(estadoResultados.utilidadNeta, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "ivu" && (
        <div className="flex flex-col gap-3">
          {(desgloseIvuPropinas.ivuEstatal > 0 || desgloseIvuPropinas.ivuMunicipal > 0 || desgloseIvuPropinas.propinas > 0) && (
            <div className="vc-card">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted">Desglose de facturas — {anioResultados} (#781/#782)</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-muted">IVU estatal (10.5%)</p>
                  <p className="font-medium">{formatMoney(desgloseIvuPropinas.ivuEstatal)}</p>
                  <p className="text-[10px] text-muted">A SURI</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">IVU municipal (1%)</p>
                  <p className="font-medium">{formatMoney(desgloseIvuPropinas.ivuMunicipal)}</p>
                  <p className="text-[10px] text-muted">Al municipio</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">Propinas excluidas</p>
                  <p className="font-medium">{formatMoney(desgloseIvuPropinas.propinas)}</p>
                  <p className="text-[10px] text-muted">No es venta tributable</p>
                </div>
              </div>
            </div>
          )}

          {tienePos && (
            <div className="vc-card">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted">Ventas de POS (Clover/Verifone/Square) — {anioResultados}</p>
              <p className="mb-2 text-[11px] text-muted">
                Desglose de reportes de POS subidos por el dueño — NO es un ingreso adicional, es el detalle del depósito que ya llega
                por el banco.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <p className="text-[11px] text-muted">Venta bruta</p>
                  <p className="font-medium">{formatMoney(resumenPos.grossSales)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">IVU estatal</p>
                  <p className="font-medium">{formatMoney(resumenPos.ivuEstatal)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">IVU municipal</p>
                  <p className="font-medium">{formatMoney(resumenPos.ivuMunicipal)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">Propinas</p>
                  <p className="font-medium">{formatMoney(resumenPos.tips)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">Venta neta</p>
                  <p className="font-medium text-teal">{formatMoney(resumenPos.netSales)}</p>
                </div>
              </div>
            </div>
          )}

          {!ivuApplies ? (
            <div className="vc-card">
              <p className="text-sm text-muted">Esta entidad no aplica a IVU.</p>
            </div>
          ) : !ivuTracker ? (
            <div className="vc-card">
              <p className="text-sm text-muted">Todavía no hay datos de IVU para el periodo actual.</p>
            </div>
          ) : (
            <>
              <div className="vc-card">
                <p className="mb-3 text-xs uppercase tracking-wide text-muted">IVU del periodo actual</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-muted">Cobrado</p>
                    <p className="text-base font-medium">{formatMoney(Number(ivuTracker.ivu_collected))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Crédito</p>
                    <p className="text-base font-medium">{formatMoney(Number(ivuTracker.ivu_paid_credits))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Neto a depositar</p>
                    <p className="text-base font-medium">{formatMoney(Number(ivuTracker.ivu_net_due))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Vence</p>
                    <p className="text-base font-medium">{ivuTracker.due_date}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Badge
                    tone={
                      ivuTracker.deposit_status === "depositado"
                        ? "grn"
                        : ivuTracker.deposit_status === "overdue"
                          ? "red"
                          : "amb"
                    }
                  >
                    {ivuTracker.deposit_status === "depositado"
                      ? `Depositado ${ivuTracker.deposit_date ?? ""}`
                      : ivuTracker.deposit_status === "overdue"
                        ? "Atrasado"
                        : "Pendiente"}
                  </Badge>
                  {ivuTracker.suri_confirmation_number && (
                    <span className="ml-2 text-[11px] text-muted">
                      Confirmación SURI: {ivuTracker.suri_confirmation_number}
                    </span>
                  )}
                </div>
              </div>

              <div className="vc-card">
                <div className="mb-3 flex items-center gap-2">
                  <i className="ti ti-traffic-cone text-muted" />
                  <p className="text-xs uppercase tracking-wide text-muted">Semáforo de cuadre IVU</p>
                </div>
                {!ivuReconciliation ? (
                  <p className="text-sm text-muted">Todavía no hay reconciliación para este periodo.</p>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className={`h-3 w-3 rounded-full ${
                          ivuReconciliation.semaphore_status === "verde"
                            ? "bg-grn"
                            : ivuReconciliation.semaphore_status === "amarillo"
                              ? "bg-amb"
                              : "bg-red"
                        }`}
                      />
                      <span className="text-sm font-medium capitalize">{ivuReconciliation.semaphore_status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-[11px] text-muted">SURI</p>
                        <p>{formatMoney(Number(ivuReconciliation.ivu_declared_suri))}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted">Banco</p>
                        <p>{formatMoney(Number(ivuReconciliation.ivu_bank_deposits))}</p>
                        <p className="text-[10px] text-muted">
                          Δ {formatMoney(Number(ivuReconciliation.variance_bank))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted">Procesador</p>
                        <p>{formatMoney(Number(ivuReconciliation.ivu_processor_reported))}</p>
                        <p className="text-[10px] text-muted">
                          Δ {formatMoney(Number(ivuReconciliation.variance_processor))}
                        </p>
                      </div>
                    </div>
                    {ivuReconciliation.alert_message && (
                      <p className="mt-3 rounded bg-red/10 p-2 text-xs text-red">{ivuReconciliation.alert_message}</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "nomina" && (
        <NominaCpa empleados={nomina.empleados} corridas={nomina.corridas} lineas={nomina.lineas} config={nomina.config} anio={anioResultados} />
      )}

      {tab === "boveda" && <BovedaCompartida ownerId={ownerId} entityId={entityId} />}

      {tab === "recibos" && (
        <div className="vc-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted">Bóveda de recibos</p>
            <Badge tone="amb">{recibos.filter((r) => r.estado === "pendiente").length} pendientes</Badge>
          </div>
          {recibos.length === 0 ? (
            <p className="text-sm text-muted">No hay recibos capturados todavía.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recibos.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>{r.descripcion ?? "Sin descripción"}</p>
                    <p className="text-[11px] text-muted">
                      {r.categoria_sugerida ?? "Sin categoría"} · {r.fecha_captura?.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{formatMoney(Number(r.monto_declarado))}</span>
                    <Badge tone={r.estado === "resuelto" ? "grn" : r.estado === "con_foto" ? "muted" : "amb"}>
                      {r.estado === "con_foto" ? "Con foto" : r.estado === "resuelto" ? "Resuelto" : "Pendiente"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "retenciones" && (
        <div className="flex flex-col gap-3">
          {/* Depósito mensual 480.9A primero, igual que en el portal de
              Pagos del dueño (2 oct 2026, pedido de Joel) — es lo que de
              verdad urge al CPA cada mes, independiente de cualquier otro
              filtro: cuánto hay que remesar a SURI y si ya venció. */}
          {depositoMensual.totalDolares > 0 && (
            <div className={`vc-card ${depositoMensual.vencido ? "border-red/40 bg-red/5" : "border-amb/30 bg-amb/5"}`}>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">Depósito mensual — Modelo 480.9A</p>
              <p className="text-sm">
                Retenido en {MESES_ES_LARGO[depositoMensual.mes]} {depositoMensual.anio}:{" "}
                <span className="font-medium">{formatMoney(depositoMensual.totalDolares)}</span>
              </p>
              <p className={`text-xs ${depositoMensual.vencido ? "text-red" : "text-muted"}`}>
                {depositoMensual.vencido
                  ? `⚠️ Venció el ${depositoMensual.venceISO} — hay que remesarlo a SURI cuanto antes.`
                  : `Vence el ${depositoMensual.venceISO} (día 15 del mes siguiente).`}
              </p>
            </div>
          )}
          <div className="vc-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Retenciones a contratistas (480.6SP)</p>
                <p className="mt-1 text-2xl font-semibold text-amb">{formatMoney(totalRetencionesPendientes)}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Pendiente de remesar a Hacienda — el depósito mensual (480.9A) vence el día 15 del mes siguiente.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <a
                  href={`/api/pagos/reportes/480-6sp/pdf?entityId=${entityId}&anio=${anioResultados}`}
                  target="_blank"
                  className="flex items-center gap-1 text-muted hover:text-teal"
                >
                  <i className="ti ti-file-type-pdf" /> PDF
                </a>
                <a
                  href={`/api/pagos/reportes/480-6sp/excel?entityId=${entityId}&anio=${anioResultados}`}
                  className="flex items-center gap-1 text-muted hover:text-teal"
                >
                  <i className="ti ti-file-type-xls" /> Excel
                </a>
                <a
                  href={`/api/pagos/reportes/480-6sp?entityId=${entityId}&anio=${anioResultados}`}
                  className="flex items-center gap-1 text-muted hover:text-teal"
                >
                  <i className="ti ti-file-type-csv" /> CSV
                </a>
              </div>
            </div>
          </div>
          <div className="vc-card">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">Contratistas — estado 480.6SP</p>
            {vendors.length === 0 ? (
              <p className="text-sm text-muted">No hay contratistas registrados.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {vendors.map((v) => {
                  const val = validaciones480.find((x) => x.vendor_id === v.id);
                  const retencionesVendor = retenciones.filter((r) => r.vendor_id === v.id);
                  const retenidoTotal = retencionesVendor.reduce((s, r) => s + Number(r.retention_amount ?? 0), 0);
                  const retenidoPendiente = retencionesVendor
                    .filter((r) => r.remittance_status === "pendiente")
                    .reduce((s, r) => s + Number(r.retention_amount ?? 0), 0);
                  const relevoVigente = v.relevo_fecha_expiracion ? v.relevo_fecha_expiracion >= hoyISO : false;
                  const tieneRelevo = !!v.relevo_fecha_expiracion;
                  return (
                    <li key={v.id} className="py-2 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="font-medium">
                          {v.name} <span className="text-[10px] text-muted">({v.is_corporation ? "Corporación" : "Individuo"})</span>
                        </p>
                        <Badge tone={val?.ready_for_480 ? "grn" : "amb"}>
                          {val?.ready_for_480 ? "Listo para 480" : "Faltan datos"}
                        </Badge>
                      </div>
                      {v.address && <p className="mb-1 text-[11px] text-muted">{v.address}</p>}
                      <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                        <span>
                          <i className={`ti ${val?.name_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`} /> Nombre
                        </span>
                        <span>
                          <i className={`ti ${val?.address_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`} /> Dirección
                        </span>
                        <span>
                          <i className={`ti ${val?.tax_id_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`} /> Tax ID
                        </span>
                        <span className="flex items-center gap-1">
                          <i className={`ti ${v.registro_comerciante_r2_key ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`} />{" "}
                          Registro Comerciante
                          {v.registro_comerciante_r2_key && (
                            <a
                              href={`/api/cpa/vendors/${v.id}/registro-comerciante`}
                              target="_blank"
                              className="font-medium text-teal hover:underline"
                            >
                              Ver
                            </a>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Badge tone={tieneRelevo ? (relevoVigente ? "grn" : "red") : "muted"}>
                            {tieneRelevo
                              ? relevoVigente
                                ? `Relevo vigente hasta ${v.relevo_fecha_expiracion}`
                                : `Relevo vencido (${v.relevo_fecha_expiracion})`
                              : "Sin Relevo"}
                          </Badge>
                          {v.relevo_r2_key && (
                            <a href={`/api/cpa/vendors/${v.id}/relevo`} target="_blank" className="font-medium text-teal hover:underline">
                              Ver
                            </a>
                          )}
                        </span>
                        <span className="text-muted">
                          Retenido YTD: <span className="font-medium text-text">{formatMoney(retenidoTotal)}</span>
                        </span>
                        {retenidoPendiente > 0 && (
                          <span className="text-amb">Pendiente de remesar: {formatMoney(retenidoPendiente)}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Formularios480 ownerId={ownerId} entityId={entityId} />
          <PagosRegistrados retenciones={retenciones} vendors={vendors} />
        </div>
      )}

      {tab === "facturas" && (
        <div className="flex flex-col gap-3">
          {/* 4 cards estilo el portal de Facturación del dueño (2 oct 2026,
              pedido de Joel: "que tenga un dashboard bonito como el de
              Victor... con lo de las facturas") — Facturado/Cobrado/
              Pendiente/Vencida del año que se esté mirando (mismo selector
              de año que el tab Resultados). */}
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted">Facturación — {anioResultados}</p>
            <div className="flex items-center gap-3 text-xs">
              <a href={`?anio=${anioResultados - 1}`} className="text-muted hover:text-teal">
                ← {anioResultados - 1}
              </a>
              <a href={`?anio=${anioResultados + 1}`} className="text-muted hover:text-teal">
                {anioResultados + 1} →
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="vc-card">
              <p className="text-[11px] uppercase tracking-wide text-muted">Facturado</p>
              <p className="mt-1 text-lg font-semibold">{formatMoney(resumenFacturacion.facturado)}</p>
              <p className="mt-0.5 text-[11px] text-muted">{resumenFacturacion.cantidadFacturas} facturas</p>
            </div>
            <div className="vc-card">
              <p className="text-[11px] uppercase tracking-wide text-muted">Cobrado</p>
              <p className="mt-1 text-lg font-semibold text-grn">{formatMoney(resumenFacturacion.cobrado)}</p>
              <p className="mt-0.5 text-[11px] text-muted">{resumenFacturacion.pctCobrado}%</p>
            </div>
            <div className="vc-card">
              <p className="text-[11px] uppercase tracking-wide text-muted">Pendiente</p>
              <p className="mt-1 text-lg font-semibold text-amb">{formatMoney(resumenFacturacion.pendiente)}</p>
              <p className="mt-0.5 text-[11px] text-muted">{resumenFacturacion.cantidadPendiente} fact.</p>
            </div>
            <div className="vc-card">
              <p className="text-[11px] uppercase tracking-wide text-muted">Vencida</p>
              <p className={`mt-1 text-lg font-semibold ${resumenFacturacion.vencido > 0 ? "text-red" : ""}`}>
                {formatMoney(resumenFacturacion.vencido)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{resumenFacturacion.cantidadVencida} fact.</p>
            </div>
          </div>
          <div className="vc-card">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">Facturación del mes en curso</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-muted">Emitidas</p>
                <p className="text-base font-medium">{metricasFacturas.emitidas}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Cobradas</p>
                <p className="text-base font-medium">{metricasFacturas.cobradas}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Vencidas</p>
                <p className="text-base font-medium text-red">{metricasFacturas.vencidas}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Total</p>
                <p className="text-base font-medium">{formatMoney(metricasFacturas.total)}</p>
              </div>
            </div>
          </div>
          <div className="vc-card">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">
              Certificados de exención IVU (revendedores)
            </p>
            {clientesExentos.length === 0 ? (
              <p className="text-sm text-muted">No hay clientes marcados como revendedores exentos.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {clientesExentos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <i className="ti ti-certificate text-muted" />
                      <div>
                        <p>{c.name}</p>
                        <p className="text-[11px] text-muted">{c.exemption_certificate_number ?? "Sin # de registro"}</p>
                      </div>
                    </div>
                    <Badge tone={c.exemption_validated ? "grn" : "amb"}>
                      {c.exemption_validated ? "Validado" : "Sin validar"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "estimados" && (
        <div className="vc-card">
          <p className="mb-3 text-xs uppercase tracking-wide text-muted">Contribución estimada trimestral</p>
          {estimados.length === 0 ? (
            <p className="text-sm text-muted">No hay pagos estimados registrados.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {estimados.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>
                      Trimestre {e.quarter} · {e.period_year}
                    </p>
                    <p className="text-[11px] text-muted">Vence {e.due_date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{formatMoney(Number(e.amount_due))}</span>
                    <Badge tone={e.status === "pagado" ? "grn" : "amb"}>
                      {e.status === "pagado" ? `Pagado ${e.paid_date ?? ""}` : "Pendiente"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "auditoria" && <AuditoriaTab auditoria={auditoria} />}
    </div>
  );
}
