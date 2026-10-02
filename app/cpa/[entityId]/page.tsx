import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CpaTabs from "./cpa-tabs";
import { calcularEstadoResultados } from "@/lib/estado-resultados";
import { saludoPorHora } from "@/lib/hora-pr";
import { formatMoney as formatMoneyAlerta } from "@/lib/format";

// Portal CPA — dashboard de un cliente (pantalla "Dashboard" del mockup
// "VICTOR — Portal CPA.html"). Todo lo que se lee aquí pasa por RLS
// *_cpa_read (migraciones 0003 y 0023) — si el CPA no tiene acceso a esta
// entidad, business_entities simplemente no devuelve la fila y se manda a
// notFound(), nunca hace falta chequearlo "a mano".
export default async function CpaClientePage({
  params,
  searchParams,
}: {
  params: { entityId: string };
  searchParams: { anio?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Saludo real (2 oct 2026, mismo fix que app/cpa/page.tsx).
  const { data: perfilCpa } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  let nombreCpa = perfilCpa?.full_name || null;
  if (!nombreCpa) {
    const { data: inviteAceptada } = await supabase
      .from("cpa_invitations")
      .select("cpa_name")
      .ilike("cpa_email", user.email ?? "")
      .eq("status", "accepted")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    nombreCpa = inviteAceptada?.cpa_name || null;
  }
  const primerNombreCpa = (nombreCpa || user.email || "").split(" ")[0];

  const entityId = params.entityId;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ein, ivu_applies, owner_id")
    .eq("id", entityId)
    .maybeSingle();

  if (!entidad) notFound();

  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const ano = hoy.getFullYear();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;

  const anioResultados = Number(searchParams?.anio) || ano;
  const inicioAnioResultados = `${anioResultados}-01-01`;
  const finAnioResultados = `${anioResultados}-12-31`;

  // Vendors primero — vendor_480_validation y el total de retenciones
  // dependen de la lista de vendor_id de esta entidad.
  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, tax_id, vendor_type, retention_type, default_retention_pct, is_corporation, relevo_fecha_expiracion, registro_comerciante_r2_key"
    )
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

  // Estado de Resultados (1 oct 2026, pedido de Joel: "hay que activarlo
  // para que pueda ver esos reportes" — reactivación de Invita a tu contable
  // junto con darle al Portal CPA contenido real que mostrar). Misma función
  // que usa el dueño del negocio en /dashboard/negocio/estado-resultados,
  // para que el contador vea exactamente la misma matriz mes-a-mes.
  const er = await calcularEstadoResultados(supabase, { ownerId: entidad.owner_id, entityId, anio: anioResultados });

  // Desglose de IVU estatal/municipal + propinas excluidas (#782/#781, 1 oct
  // 2026) a nivel de facturas del año — para que el contador vea el pasivo
  // real a SURI vs. al municipio, y confirme que las propinas no se están
  // inflando como venta tributable.
  const { data: facturasDesglose } = await supabase
    .from("invoices")
    .select("ivu_estatal_monto, ivu_municipal_monto, propina_monto")
    .eq("entity_id", entityId)
    .gte("fecha_emision", inicioAnioResultados)
    .lte("fecha_emision", finAnioResultados);

  const desgloseIvuPropinas = (facturasDesglose ?? []).reduce(
    (acc, f) => ({
      ivuEstatal: acc.ivuEstatal + Number(f.ivu_estatal_monto ?? 0),
      ivuMunicipal: acc.ivuMunicipal + Number(f.ivu_municipal_monto ?? 0),
      propinas: acc.propinas + Number(f.propina_monto ?? 0),
    }),
    { ivuEstatal: 0, ivuMunicipal: 0, propinas: 0 }
  );

  // Desglose de ventas de POS (Clover/Verifone/Square, #786) del año — si el
  // negocio es un restaurante que sube reportes de POS, el contador necesita
  // ver esto aparte porque no tiene factura propia en VICTOR.
  const { data: posDelAnio } = await supabase
    .from("pos_batch_uploads")
    .select("gross_sales, ivu_estatal_monto, ivu_municipal_monto, tips_monto, net_sales")
    .eq("entity_id", entityId)
    .gte("period_start", inicioAnioResultados)
    .lte("period_end", finAnioResultados);

  const resumenPos = (posDelAnio ?? []).reduce(
    (acc, p) => ({
      grossSales: acc.grossSales + Number(p.gross_sales ?? 0),
      ivuEstatal: acc.ivuEstatal + Number(p.ivu_estatal_monto ?? 0),
      ivuMunicipal: acc.ivuMunicipal + Number(p.ivu_municipal_monto ?? 0),
      tips: acc.tips + Number(p.tips_monto ?? 0),
      netSales: acc.netSales + Number(p.net_sales ?? 0),
    }),
    { grossSales: 0, ivuEstatal: 0, ivuMunicipal: 0, tips: 0, netSales: 0 }
  );
  const tienePos = (posDelAnio ?? []).length > 0;

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

  // Resumen de Facturación del año (2 oct 2026, pedido de Joel: "que tenga un
  // dashboard bonito como el de Victor... con lo de las facturas") — mismas
  // 4 cifras que ve el dueño en su propio portal de Facturación (Facturado /
  // Cobrado / Pendiente / Vencida), para el año que esté mirando en el tab
  // Resultados (anioResultados), no solo el mes en curso.
  const facturasAnio = (facturas ?? []).filter(
    (f) => f.fecha_emision >= inicioAnioResultados && f.fecha_emision <= finAnioResultados
  );
  const facturasVencidasAnio = facturasAnio.filter((f) => f.estado !== "pagada" && f.fecha_vencimiento && f.fecha_vencimiento < hoyISO);
  const montoFacturado = facturasAnio.reduce((acc, f) => acc + Number(f.total ?? 0), 0);
  const montoCobrado = facturasAnio.filter((f) => f.estado === "pagada").reduce((acc, f) => acc + Number(f.total ?? 0), 0);
  const resumenFacturacion = {
    facturado: montoFacturado,
    cantidadFacturas: facturasAnio.length,
    cobrado: montoCobrado,
    pctCobrado: montoFacturado > 0 ? Math.round((montoCobrado / montoFacturado) * 100) : 0,
    pendiente: facturasAnio.filter((f) => f.estado !== "pagada").reduce((acc, f) => acc + Number(f.total ?? 0), 0),
    cantidadPendiente: facturasAnio.filter((f) => f.estado !== "pagada").length,
    vencido: facturasVencidasAnio.reduce((acc, f) => acc + Number(f.total ?? 0), 0),
    cantidadVencida: facturasVencidasAnio.length,
  };

  const totalRetencionesPendientes = (retenciones ?? [])
    .filter((r) => r.remittance_status === "pendiente")
    .reduce((acc, r) => acc + Number(r.retention_amount ?? 0), 0);

  // Depósito mensual — Modelo 480.9A (2 oct 2026) — mismo cálculo que
  // app/dashboard/pagos/pagos-portal.tsx (estadoDeposito480_9A): si hoy es
  // día 1-15, el depósito pendiente es el del mes PASADO (vence hoy, día
  // 15); si es día 16+, es el del mes en curso (todavía no vence). Esto es
  // lo primero que un CPA quiere ver en el tab Pagos — es lo que hay que
  // remesar a SURI ahora mismo.
  const diaHoyDeposito = hoy.getDate();
  const refFechaDeposito = new Date(hoy.getFullYear(), hoy.getMonth() - (diaHoyDeposito <= 15 ? 1 : 0), 1);
  const anioDeposito = refFechaDeposito.getFullYear();
  const mesDeposito = refFechaDeposito.getMonth(); // 0-11
  const venceDeposito = new Date(anioDeposito, mesDeposito + 1, 15);
  let totalDeposito = 0;
  for (const r of retenciones ?? []) {
    const fecha = r.period_end ?? r.period_start;
    if (!fecha) continue;
    const f = new Date(fecha);
    if (f.getFullYear() === anioDeposito && f.getMonth() === mesDeposito) totalDeposito += Number(r.retention_amount ?? 0);
  }
  const depositoMensual = {
    anio: anioDeposito,
    mes: mesDeposito,
    totalDolares: totalDeposito,
    venceISO: venceDeposito.toISOString().slice(0, 10),
    vencido: hoy > venceDeposito && totalDeposito > 0,
  };

  // Alertas Inteligentes de esta entidad (2 oct 2026, pedido de Joel) —
  // mismas reglas que app/cpa/page.tsx pero acotadas a esta entidad,
  // reusando los datos que ya se trajeron arriba en el Promise.all (no
  // dispara queries nuevas).
  type AlertaCpa = { tono: "red" | "amb"; icono: string; texto: string };
  const alertasEntidad: AlertaCpa[] = [];

  if (ivuTracker && ivuTracker.deposit_status !== "depositado" && ivuTracker.due_date && ivuTracker.due_date < hoyISO) {
    alertasEntidad.push({
      tono: "red",
      icono: "ti-alert-triangle",
      texto: `IVU vencido — ${formatMoneyAlerta(Number(ivuTracker.ivu_net_due ?? 0))} sin depositar (venció ${ivuTracker.due_date}).`,
    });
  }

  const facturasVencidasEntidad = (facturas ?? []).filter(
    (f) => f.estado !== "pagada" && f.fecha_vencimiento && f.fecha_vencimiento < hoyISO
  );
  if (facturasVencidasEntidad.length > 0) {
    alertasEntidad.push({
      tono: "amb",
      icono: "ti-file-invoice",
      texto: `${facturasVencidasEntidad.length} factura${facturasVencidasEntidad.length === 1 ? "" : "s"} vencida${facturasVencidasEntidad.length === 1 ? "" : "s"} sin cobrar.`,
    });
  }

  const diaDelMesEntidad = Number(hoyISO.slice(8, 10));
  if (diaDelMesEntidad > 15 && totalRetencionesPendientes > 0) {
    alertasEntidad.push({
      tono: "red",
      icono: "ti-cash",
      texto: `${formatMoneyAlerta(totalRetencionesPendientes)} en retenciones pendientes de remesar (480.9A vence día 15).`,
    });
  }

  for (const v of vendors ?? []) {
    if (v.relevo_fecha_expiracion && v.relevo_fecha_expiracion < hoyISO) {
      alertasEntidad.push({
        tono: "amb",
        icono: "ti-certificate",
        texto: `Certificado de Relevo de ${v.name} vencido (${v.relevo_fecha_expiracion}).`,
      });
    }
  }

  const faltan480 = (validaciones480 ?? []).filter((v) => !v.ready_for_480).length;
  if (faltan480 > 0) {
    alertasEntidad.push({
      tono: "amb",
      icono: "ti-file-percent",
      texto: `${faltan480} contratista${faltan480 === 1 ? "" : "s"} sin datos completos para la 480.6SP.`,
    });
  }

  const estimadasVencidasEntidad = (estimados ?? []).filter((e) => e.status === "pendiente" && e.due_date < hoyISO);
  for (const e of estimadasVencidasEntidad) {
    alertasEntidad.push({
      tono: "red",
      icono: "ti-calendar-dollar",
      texto: `Contribución estimada vencida — ${formatMoneyAlerta(Number(e.amount_due ?? 0))} (venció ${e.due_date}).`,
    });
  }

  if (er.utilidadNeta < 0) {
    alertasEntidad.push({
      tono: "amb",
      icono: "ti-trending-down",
      texto: `Utilidad neta negativa en ${anioResultados}: ${formatMoneyAlerta(er.utilidadNeta)}.`,
    });
  }

  alertasEntidad.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "red" ? -1 : 1));

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

      <p className="mb-3 text-base font-medium">
        {saludoPorHora(hoy)}, {primerNombreCpa} — viendo {entidad.name}
      </p>

      <div className="vc-card mb-4">
        <p className="text-base font-medium">{entidad.name}</p>
        <p className="text-xs text-muted">
          {entidad.entity_type} {entidad.ein ? `· EIN ${entidad.ein}` : ""}
        </p>
      </div>

      <div className="vc-card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <i className="ti ti-bulb text-muted" />
          <p className="text-xs uppercase tracking-wide text-muted">Alertas inteligentes</p>
        </div>
        {alertasEntidad.length === 0 ? (
          <p className="text-sm text-muted">Todo se ve normal con {entidad.name} — sin pendientes urgentes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alertasEntidad.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <i className={`ti ${a.icono} mt-0.5 flex-shrink-0 ${a.tono === "red" ? "text-red" : "text-amb"}`} />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        )}
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
        resumenFacturacion={resumenFacturacion}
        depositoMensual={depositoMensual}
        clientesExentos={clientesExentos ?? []}
        estimados={estimados ?? []}
        auditoria={auditoria ?? []}
        estadoResultados={er}
        anioResultados={anioResultados}
        desgloseIvuPropinas={desgloseIvuPropinas}
        resumenPos={resumenPos}
        tienePos={tienePos}
        retenciones={retenciones ?? []}
        entityId={entityId}
      />
    </div>
  );
}
