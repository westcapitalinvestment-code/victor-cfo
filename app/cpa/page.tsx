import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { saludoPorHora, fechaHoyPR } from "@/lib/hora-pr";

// Portal CPA — lista de clientes (pantalla "Clientes" del mockup
// "VICTOR — Portal CPA.html"). RLS (business_entities_cpa_read,
// ivu_tracker_cpa_read, estimated_tax_payments_cpa_read — migración 0003)
// filtra todo esto solo: un CPA autenticado con su sesión normal solo ve
// las entidades de los dueños que lo invitaron, nunca las de nadie más. No
// hace falta el cliente admin en ninguna consulta de esta página.
export default async function CpaPortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Saludo real (2 oct 2026, pedido de Joel: "debe tener algo como el
  // Portal de Victor, que diga buenos dias fulano") — mismo patrón que
  // app/dashboard/page.tsx. full_name puede ser null si el CPA aceptó la
  // invitación antes del fix de signUp (ver app/cpa/aceptar/[token]/page.tsx)
  // — en ese caso cae a cpa_invitations.cpa_name que el dueño escribió al
  // invitar, y si tampoco existe, al correo.
  const { data: perfil } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  let nombreCpa = perfil?.full_name || null;
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
  const primerNombre = (nombreCpa || user.email || "").split(" ")[0];

  const { data: entidades, error } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ein")
    .order("name", { ascending: true });

  const entityIds = (entidades ?? []).map((e) => e.id);

  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const ano = hoy.getFullYear();
  const hoyISO = fechaHoyPR(hoy);

  // IVU del mes en curso, para todas las entidades a la vez (1 query en vez
  // de N) — es lo que arma el "semáforo" por cliente en esta lista y la
  // alerta de IVU vencido.
  const { data: ivuDelMes } = entityIds.length
    ? await supabase
        .from("ivu_tracker")
        .select("entity_id, ivu_net_due, due_date, deposit_status")
        .in("entity_id", entityIds)
        .eq("period_month", mes)
        .eq("period_year", ano)
    : { data: [] as never[] };

  const ivuPorEntidad = new Map((ivuDelMes ?? []).map((r) => [r.entity_id, r]));

  const totalPendiente = (ivuDelMes ?? [])
    .filter((r) => r.deposit_status !== "depositado")
    .reduce((acc, r) => acc + Number(r.ivu_net_due ?? 0), 0);

  // Próximo vencimiento de contribución estimada trimestral, across todos
  // los clientes — el resumen de arriba del mockup.
  const { data: proximoEstimado } = entityIds.length
    ? await supabase
        .from("estimated_tax_payments")
        .select("entity_id, amount_due, due_date")
        .in("entity_id", entityIds)
        .eq("status", "pendiente")
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const nombreEntidad = (id: string) => entidades?.find((e) => e.id === id)?.name ?? "";

  // Alertas Inteligentes de portafolio (2 oct 2026, pedido de Joel: "que
  // quizás tenga algunas alertas inteligentes") — cruza TODOS los clientes
  // del CPA en consultas batched (.in()), no una por entidad, para no
  // multiplicar queries por cada cliente que tenga.
  type AlertaCpa = { tono: "red" | "amb"; icono: string; texto: string };
  const alertas: AlertaCpa[] = [];

  // IVU vencido (no depositado y ya pasó la fecha).
  for (const r of ivuDelMes ?? []) {
    if (r.deposit_status !== "depositado" && r.due_date && r.due_date < hoyISO) {
      alertas.push({
        tono: "red",
        icono: "ti-alert-triangle",
        texto: `${nombreEntidad(r.entity_id)}: IVU vencido — ${formatMoney(Number(r.ivu_net_due ?? 0))} sin depositar (venció ${r.due_date}).`,
      });
    }
  }

  // Facturas vencidas y Retenciones pendientes de remesar, por entidad —
  // mismo patrón batched, con los vendors/invoices de todos los clientes.
  const [{ data: facturasVencidas }, { data: vendorsPortafolio }] = await Promise.all([
    entityIds.length
      ? supabase
          .from("invoices")
          .select("entity_id, fecha_vencimiento, estado")
          .in("entity_id", entityIds)
          .neq("estado", "pagada")
          .lt("fecha_vencimiento", hoyISO)
      : Promise.resolve({ data: [] as never[] }),
    entityIds.length
      ? supabase
          .from("vendors")
          .select("id, entity_id, name, relevo_fecha_expiracion")
          .in("entity_id", entityIds)
          .eq("active", true)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const vencidasPorEntidad = new Map<string, number>();
  for (const f of facturasVencidas ?? []) {
    vencidasPorEntidad.set(f.entity_id, (vencidasPorEntidad.get(f.entity_id) ?? 0) + 1);
  }
  for (const [entityId, n] of vencidasPorEntidad) {
    alertas.push({
      tono: "amb",
      icono: "ti-file-invoice",
      texto: `${nombreEntidad(entityId)}: ${n} factura${n === 1 ? "" : "s"} vencida${n === 1 ? "" : "s"} sin cobrar.`,
    });
  }

  const vendorIdsPortafolio = (vendorsPortafolio ?? []).map((v) => v.id);
  const vendorPorId = new Map((vendorsPortafolio ?? []).map((v) => [v.id, v]));

  const { data: retencionesPortafolio } = vendorIdsPortafolio.length
    ? await supabase
        .from("vendor_retenciones")
        .select("vendor_id, retention_amount, remittance_status")
        .in("vendor_id", vendorIdsPortafolio)
        .eq("remittance_status", "pendiente")
    : { data: [] as never[] };

  const pendientePorEntidad = new Map<string, number>();
  for (const r of retencionesPortafolio ?? []) {
    const v = vendorPorId.get(r.vendor_id);
    if (!v) continue;
    pendientePorEntidad.set(v.entity_id, (pendientePorEntidad.get(v.entity_id) ?? 0) + Number(r.retention_amount ?? 0));
  }
  // El depósito 480.9A vence el día 15 del mes siguiente — después de esa
  // fecha, lo pendiente del mes anterior ya está técnicamente atrasado.
  const diaDelMes = Number(hoyISO.slice(8, 10));
  if (diaDelMes > 15) {
    for (const [entityId, monto] of pendientePorEntidad) {
      if (monto > 0) {
        alertas.push({
          tono: "red",
          icono: "ti-cash",
          texto: `${nombreEntidad(entityId)}: ${formatMoney(monto)} en retenciones pendientes de remesar (480.9A vence día 15).`,
        });
      }
    }
  }

  // Relevo vencido (solo contratistas que SÍ tenían uno — uno nunca subido
  // no es, por sí solo, una alerta urgente aquí).
  for (const v of vendorsPortafolio ?? []) {
    if (v.relevo_fecha_expiracion && v.relevo_fecha_expiracion < hoyISO) {
      alertas.push({
        tono: "amb",
        icono: "ti-certificate",
        texto: `${nombreEntidad(v.entity_id)}: Certificado de Relevo de ${v.name} vencido (${v.relevo_fecha_expiracion}).`,
      });
    }
  }

  // Estimada vencida (no solo "próxima", ya pasada de fecha).
  const { data: estimadasVencidas } = entityIds.length
    ? await supabase
        .from("estimated_tax_payments")
        .select("entity_id, amount_due, due_date")
        .in("entity_id", entityIds)
        .eq("status", "pendiente")
        .lt("due_date", hoyISO)
    : { data: [] as never[] };
  for (const e of estimadasVencidas ?? []) {
    alertas.push({
      tono: "red",
      icono: "ti-calendar-dollar",
      texto: `${nombreEntidad(e.entity_id)}: contribución estimada vencida — ${formatMoney(Number(e.amount_due ?? 0))} (venció ${e.due_date}).`,
    });
  }

  alertas.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "red" ? -1 : 1));

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-base font-medium">VICTOR</span>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Portal CPA
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
          <i className="ti ti-lock" /> Solo lectura
        </span>
      </div>

      <p className="mb-4 text-lg font-medium">
        {saludoPorHora(hoy)}, {primerNombre}
      </p>

      {entidades && entidades.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="vc-card">
            <p className="text-xs uppercase tracking-wide text-muted">IVU pendiente de depositar</p>
            <p className="mt-1 text-2xl font-semibold text-amb">{formatMoney(totalPendiente)}</p>
            <p className="mt-1 text-[11px] text-muted">Suma de todos tus clientes, periodo actual</p>
          </div>
          <div className="vc-card">
            <p className="text-xs uppercase tracking-wide text-muted">Contribución estimada — próximo vencimiento</p>
            {proximoEstimado ? (
              <>
                <p className="mt-1 text-2xl font-semibold">{formatMoney(Number(proximoEstimado.amount_due ?? 0))}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {nombreEntidad(proximoEstimado.entity_id)} · vence {proximoEstimado.due_date}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">Nada pendiente por ahora.</p>
            )}
          </div>
        </div>
      )}

      <div className="vc-card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <i className="ti ti-bulb text-muted" />
          <p className="text-xs uppercase tracking-wide text-muted">Alertas inteligentes</p>
        </div>
        {alertas.length === 0 ? (
          <p className="text-sm text-muted">Todo se ve normal — sin IVU atrasado, facturas vencidas ni retenciones pendientes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <i className={`ti ${a.icono} mt-0.5 flex-shrink-0 ${a.tono === "red" ? "text-red" : "text-amb"}`} />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="vc-card">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">
          Tus clientes {entidades ? `(${entidades.length})` : ""}
        </p>

        {error && <p className="text-xs text-red">No se pudieron cargar tus clientes: {error.message}</p>}

        {!error && (!entidades || entidades.length === 0) && (
          <p className="text-xs text-muted">
            Todavía no tienes clientes conectados. En cuanto un dueño te invite y aceptes, aparecerán aquí.
          </p>
        )}

        {entidades && entidades.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {entidades.map((ent) => {
              const ivu = ivuPorEntidad.get(ent.id);
              const alertasDeEsta = alertas.filter((a) => a.texto.startsWith(nombreEntidad(ent.id) + ":"));
              return (
                <Link
                  key={ent.id}
                  href={`/cpa/${ent.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-80"
                >
                  <div>
                    <p className="text-sm font-medium">{ent.name}</p>
                    <p className="text-xs text-muted">
                      {ent.entity_type} {ent.ein ? `· EIN ${ent.ein}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {alertasDeEsta.length > 0 && (
                      <span className="rounded-full bg-red/10 px-2 py-1 text-[10px] font-medium text-red">
                        {alertasDeEsta.length} alerta{alertasDeEsta.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {ivu ? (
                      <span
                        className={
                          "rounded-full px-2 py-1 text-[10px] font-medium " +
                          (ivu.deposit_status === "depositado"
                            ? "bg-grn/10 text-grn"
                            : ivu.deposit_status === "overdue"
                              ? "bg-red/10 text-red"
                              : "bg-amb/10 text-amb")
                        }
                      >
                        IVU {formatMoney(Number(ivu.ivu_net_due ?? 0))}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] text-muted">Sin datos IVU</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
