import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { saludoPorHora, fechaHoyPR } from "@/lib/hora-pr";
import CpaClientList, { type ClienteCpa } from "./cpa-client-list";
import FirmaAccountantPanel from "./firma-accountant-panel";
import AlertasAgrupadas, { type AlertaCpa } from "./alertas-agrupadas";

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
    .select("id, name, entity_type, ein, owner_id")
    .order("name", { ascending: true });

  const entityIds = (entidades ?? []).map((e) => e.id);

  // Nombre del dueño de cada entidad (2 oct 2026, pedido de Joel: "si alguien
  // puede tener 2 o más entidades, el contable quizás no recuerde el nombre
  // de la entidad pero sí de quién es") — requiere la política RLS
  // users_cpa_read (migración 0136); antes un CPA no podía leer NINGUNA fila
  // de `users` que no fuera la suya propia.
  const ownerIds = Array.from(new Set((entidades ?? []).map((e) => e.owner_id).filter((id): id is string => !!id)));
  const { data: duenos } = ownerIds.length
    ? await supabase.from("users").select("id, full_name, email").in("id", ownerIds)
    : { data: [] as never[] };
  const duenoPorId = new Map((duenos ?? []).map((d) => [d.id, d]));
  const nombreDueno = (ownerId: string | null) => {
    if (!ownerId) return null;
    const d = duenoPorId.get(ownerId);
    return d?.full_name || d?.email || null;
  };

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

  const nombreEntidad = (id: string) => entidades?.find((e) => e.id === id)?.name ?? "";

  // Alertas Inteligentes de portafolio (2 oct 2026, pedido de Joel: "que
  // quizás tenga algunas alertas inteligentes") — cruza TODOS los clientes
  // del CPA en consultas batched (.in()), no una por entidad, para no
  // multiplicar queries por cada cliente que tenga.
  const alertas: AlertaCpa[] = [];

  // IVU vencido (no depositado y ya pasó la fecha).
  for (const r of ivuDelMes ?? []) {
    if (r.deposit_status !== "depositado" && r.due_date && r.due_date < hoyISO) {
      alertas.push({
        tono: "red",
        icono: "ti-alert-triangle",
        tipo: "ivu_vencido",
        tipoLabel: "IVU vencido",
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
      tipo: "facturas_vencidas",
      tipoLabel: "Facturas vencidas sin cobrar",
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
          tipo: "retencion_480",
          tipoLabel: "480.9A — vence día 15",
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
        tipo: "relevo_vencido",
        tipoLabel: "Certificado de Relevo vencido",
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
      tipo: "estimada_vencida",
      tipoLabel: "Contribución estimada vencida",
      texto: `${nombreEntidad(e.entity_id)}: contribución estimada vencida — ${formatMoney(Number(e.amount_due ?? 0))} (venció ${e.due_date}).`,
    });
  }

  alertas.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "red" ? -1 : 1));

  // Favoritos del contable logueado (migración 0140, 4 oct 2026, pedido de
  // Joel a nombre de su esposa) — "Mis clientes" en CpaClientList. Son
  // POR CONTABLE (member_email = su propio email), nunca compartidos entre
  // el equipo — ver comentario de la migración.
  const { data: favoritos } = await supabase
    .from("cpa_client_favoritos")
    .select("entity_id")
    .eq("member_email", user.email ?? "");
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.entity_id));

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
        <div className="flex items-center gap-2">
          <Link
            href="/cpa/equipo"
            className="flex items-center gap-1.5 rounded-full bg-teal px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <i className="ti ti-users text-sm" /> Mi equipo
          </Link>
          <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
            <i className="ti ti-lock" /> Solo lectura
          </span>
        </div>
      </div>

      <p className="mb-4 text-lg font-medium">
        {saludoPorHora(hoy)}, {primerNombre}
      </p>

      {error && <p className="mb-3 text-xs text-red">No se pudieron cargar tus clientes: {error.message}</p>}

      {/* Programa Firma Accountant (migración 0139, 4 oct 2026) — wholesale
          del plan Business, separado y excluyente del Programa de Socios.
          OJO: un cliente invitado por aquí NO aparece automáticamente en
          CpaClientList de abajo — esa lista depende de account_members
          (role='cpa'), que es un acceso de VISIBILIDAD que el cliente
          otorga aparte (su propio "Invita a tu contable"). Son dos cosas
          independientes: quién paga (esto) y quién puede ver (account_members). */}
      <FirmaAccountantPanel />

      {/* Alertas Inteligentes de portafolio, agrupadas por tipo real de
          vencimiento (4 oct 2026, pedido de Joel a nombre de su esposa) —
          antes esta lista se calculaba pero NUNCA se mostraba aquí, solo
          alimentaba el contador por cliente de CpaClientList de abajo. */}
      {alertas.length > 0 && (
        <div className="vc-card mb-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-muted">Alertas Inteligentes</p>
          <AlertasAgrupadas alertas={alertas} emptyText="Todo se ve normal con tu cartera — sin pendientes urgentes." />
        </div>
      )}

      {/* Lista de clientes (2 oct 2026, pedido de Joel) — sin $ sumados de
          todo el portafolio arriba: eso crea ansiedad innecesaria en un CPA
          con muchos clientes. Primero ve nombres, con buscador y un tab
          "Con alertas"; el detalle de cada cliente vive en /cpa/[entityId]. */}
      <CpaClientList
        clientes={(entidades ?? []).map((ent): ClienteCpa => {
          const ivu = ivuPorEntidad.get(ent.id);
          const alertCount = alertas.filter((a) => a.texto.startsWith(nombreEntidad(ent.id) + ":")).length;
          return {
            id: ent.id,
            name: ent.name,
            entityType: ent.entity_type,
            ein: ent.ein,
            ownerName: nombreDueno(ent.owner_id),
            alertCount,
            esFavorito: favoritosSet.has(ent.id),
            ivu: ivu
              ? { status: ivu.deposit_status, monto: Number(ivu.ivu_net_due ?? 0) }
              : null,
          };
        })}
      />
    </div>
  );
}
