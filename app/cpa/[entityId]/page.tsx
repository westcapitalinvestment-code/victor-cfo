import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CpaTabs from "./cpa-tabs";

// Portal CPA — dashboard de un cliente (pantalla "Dashboard" del mockup
// "VICTOR — Portal CPA.html"). Todo lo que se lee aquí pasa por RLS
// *_cpa_read (migraciones 0003 y 0023) — si el CPA no tiene acceso a esta
// entidad, business_entities simplemente no devuelve la fila y se manda a
// notFound(), nunca hace falta chequearlo "a mano".
export default async function CpaClientePage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const entityId = params.entityId;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ein, ivu_applies")
    .eq("id", entityId)
    .maybeSingle();

  if (!entidad) notFound();

  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const ano = hoy.getFullYear();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;

  // Vendors primero — vendor_480_validation y el total de retenciones
  // dependen de la lista de vendor_id de esta entidad.
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, tax_id, vendor_type, retention_type, default_retention_pct")
    .eq("entity_id", entityId)
    .eq("active", true)
    .order("name", { ascending: true });

  const vendorIds = (vendors ?? []).map((v) => v.id);

  const [
    { data: ivuTracker },
    { data: ivuReconciliation },
    { data: recibos },
    { data: validaciones480 },
    { data: retenciones },
    { data: facturas },
    { data: clientesExentos },
    { data: estimados },
    { data: auditoria },
  ] = await Promise.all([
    supabase
      .from("ivu_tracker")
      .select("*")
      .eq("entity_id", entityId)
      .eq("period_month", mes)
      .eq("period_year", ano)
      .maybeSingle(),
    supabase
      .from("ivu_reconciliation")
      .select("*")
      .eq("entity_id", entityId)
      .eq("period_month", mes)
      .eq("period_year", ano)
      .maybeSingle(),
    supabase
      .from("pending_receipts")
      .select("id, descripcion, monto_declarado, categoria_sugerida, estado, fecha_captura")
      .eq("entity_id", entityId)
      .order("fecha_captura", { ascending: false })
      .limit(25),
    vendorIds.length
      ? supabase
          .from("vendor_480_validation")
          .select("id, vendor_id, period_year, name_confirmed, address_confirmed, tax_id_confirmed, total_paid_ytd, ready_for_480")
          .in("vendor_id", vendorIds)
          .eq("period_year", ano)
      : Promise.resolve({ data: [] as never[] }),
    vendorIds.length
      ? supabase
          .from("vendor_retenciones")
          .select("vendor_id, retention_amount, remittance_status, period_start, period_end")
          .in("vendor_id", vendorIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("invoices")
      .select("id, numero, total, estado, fecha_emision, fecha_vencimiento, client_id")
      .eq("entity_id", entityId)
      .order("fecha_emision", { ascending: false })
      .limit(100),
    supabase
      .from("clients")
      .select("id, name, ivu_exempt_reseller, exemption_certificate_number, exemption_validated")
      .eq("entity_id", entityId)
      .eq("ivu_exempt_reseller", true),
    supabase
      .from("estimated_tax_payments")
      .select("id, quarter, period_year, amount_due, due_date, status, paid_date")
      .eq("entity_id", entityId)
      .order("due_date", { ascending: true })
      .limit(4),
    supabase
      .from("audit_log")
      .select("id, actor_role, action, target_table, changes, created_at")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // Métricas de facturación del mes en curso, calculadas del lote de
  // facturas ya traído (evita una query aparte solo para sumar).
  const facturasDelMes = (facturas ?? []).filter((f) => f.fecha_emision >= inicioMes);
  const metricasFacturas = {
    emitidas: facturasDelMes.length,
    cobradas: facturasDelMes.filter((f) => f.estado === "pagada").length,
    vencidas: (facturas ?? []).filter((f) => f.estado !== "pagada" && f.fecha_vencimiento && f.fecha_vencimiento < hoyISO)
      .length,
    total: facturasDelMes.reduce((acc, f) => acc + Number(f.total ?? 0), 0),
  };

  const totalRetencionesPendientes = (retenciones ?? [])
    .filter((r) => r.remittance_status === "pendiente")
    .reduce((acc, r) => acc + Number(r.retention_amount ?? 0), 0);

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/cpa" className="text-sm text-muted hover:opacity-80">
          ← Tus clientes
        </Link>
        <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
          <i className="ti ti-lock" /> Solo lectura
        </span>
      </div>

      <div className="vc-card mb-4">
        <p className="text-base font-medium">{entidad.name}</p>
        <p className="text-xs text-muted">
          {entidad.entity_type} {entidad.ein ? `· EIN ${entidad.ein}` : ""}
        </p>
      </div>

      <CpaTabs
        ivuApplies={entidad.ivu_applies}
        ivuTracker={ivuTracker ?? null}
        ivuReconciliation={ivuReconciliation ?? null}
        recibos={recibos ?? []}
        vendors={vendors ?? []}
        validaciones480={validaciones480 ?? []}
        totalRetencionesPendientes={totalRetencionesPendientes}
        metricasFacturas={metricasFacturas}
        clientesExentos={clientesExentos ?? []}
        estimados={estimados ?? []}
        auditoria={auditoria ?? []}
      />
    </div>
  );
}
