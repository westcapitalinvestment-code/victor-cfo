"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

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
};

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
  action: string;
  target_table: string | null;
  changes: unknown;
  created_at: string;
};

const TABS = [
  { id: "ivu", label: "IVU", icon: "ti-receipt-tax" },
  { id: "recibos", label: "Recibos", icon: "ti-camera" },
  { id: "retenciones", label: "Retenciones", icon: "ti-file-percent" },
  { id: "facturas", label: "Facturas", icon: "ti-file-invoice" },
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

export default function CpaTabs({
  ivuApplies,
  ivuTracker,
  ivuReconciliation,
  recibos,
  vendors,
  validaciones480,
  totalRetencionesPendientes,
  metricasFacturas,
  clientesExentos,
  estimados,
  auditoria,
}: {
  ivuApplies: boolean;
  ivuTracker: IvuTracker;
  ivuReconciliation: IvuReconciliation;
  recibos: Recibo[];
  vendors: Vendor[];
  validaciones480: Validacion480[];
  totalRetencionesPendientes: number;
  metricasFacturas: MetricasFacturas;
  clientesExentos: ClienteExento[];
  estimados: Estimado[];
  auditoria: Auditoria[];
}) {
  const [tab, setTab] = useState<TabId>("ivu");

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
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

      {tab === "ivu" && (
        <div className="flex flex-col gap-3">
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
          <div className="vc-card">
            <p className="text-xs uppercase tracking-wide text-muted">Retenciones a contratistas (480.6)</p>
            <p className="mt-1 text-2xl font-semibold text-amb">{formatMoney(totalRetencionesPendientes)}</p>
            <p className="mt-1 text-[11px] text-muted">Pendiente de remesar a Hacienda</p>
          </div>
          <div className="vc-card">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">Checklist 480 por contratista</p>
            {vendors.length === 0 ? (
              <p className="text-sm text-muted">No hay contratistas registrados.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {vendors.map((v) => {
                  const val = validaciones480.find((x) => x.vendor_id === v.id);
                  return (
                    <li key={v.id} className="py-2 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="font-medium">{v.name}</p>
                        <Badge tone={val?.ready_for_480 ? "grn" : "amb"}>
                          {val?.ready_for_480 ? "Listo para 480" : "Faltan datos"}
                        </Badge>
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted">
                        <span>
                          <i className={`ti ${val?.name_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`} />{" "}
                          Nombre
                        </span>
                        <span>
                          <i
                            className={`ti ${val?.address_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`}
                          />{" "}
                          Dirección
                        </span>
                        <span>
                          <i
                            className={`ti ${val?.tax_id_confirmed ? "ti-circle-check text-grn" : "ti-circle-x text-red"}`}
                          />{" "}
                          Tax ID
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "facturas" && (
        <div className="flex flex-col gap-3">
          <div className="vc-card">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted">Facturación del mes</p>
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

      {tab === "auditoria" && (
        <div className="vc-card">
          <p className="mb-3 text-xs uppercase tracking-wide text-muted">Historial de cambios</p>
          {auditoria.length === 0 ? (
            <p className="text-sm text-muted">No hay actividad registrada todavía.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {auditoria.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{a.action}</p>
                    <span className="text-[11px] text-muted">{new Date(a.created_at).toLocaleString("es-PR")}</span>
                  </div>
                  <p className="text-[11px] text-muted">
                    {a.actor_role}
                    {a.target_table ? ` · ${a.target_table}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
