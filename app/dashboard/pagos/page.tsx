import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import PagosPortal from "./pagos-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Portal de Pagos a contratistas (2 sept 2026) — el reverso de Facturación:
// ahí el negocio COBRA, acá el negocio PAGA. Las tablas vendors/
// vendor_retenciones/vendor_480_validation ya existían desde el schema
// original (0001) sin UI — este archivo reemplaza el cascarón. Alcance
// acordado con Joel: calcular montos (bruto/retención 480.6/neto) para que
// él los suba a mano al ACH de BPPR — NO se genera archivo ACH ni se
// guardan números de cuenta bancaria. Igual que Facturación, vive scoped a
// la entidad de negocio activa del selector del topbar.
export default async function PagosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name, default_contractor_retention_pct")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de registrar pagos.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId: entidadActivaId, vistaGlobal } = resolverEntidadActiva(entities, leerEntidadActivaCookie());
  const entidadActiva = entities.find((e) => e.id === entidadActivaId) ?? entities[0];

  let vendorsQuery = supabase
    .from("vendors")
    .select("id, name, tax_id, vendor_type, retention_type, default_retention_pct, active, entity_id")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });
  let retencionesQuery = supabase
    .from("vendor_retenciones")
    .select("id, vendor_id, gross_amount, retention_pct, retention_amount, net_paid, period_start, period_end, remittance_status, entity_id, created_at")
    .eq("owner_id", user.id)
    .order("period_start", { ascending: false });

  if (!vistaGlobal && entidadActivaId) {
    vendorsQuery = vendorsQuery.eq("entity_id", entidadActivaId);
    retencionesQuery = retencionesQuery.eq("entity_id", entidadActivaId);
  }

  const { data: vendors } = await vendorsQuery;
  const { data: retenciones } = await retencionesQuery;

  // Evidencia (foto/PDF) por pago — migración 0085, 12 sept 2026, pedido de
  // Joel: "poner un boton de foto y upload por si se necesitara poner una
  // evidencia de la factura o lo que uno esta pagando en pagos". Se trae de
  // una vez para las últimas 20 filas visibles en "Pagos recientes" (mismo
  // límite que ya usa PagosTab), agrupado por vendor_retencion_id.
  const idsRecientes = (retenciones ?? [])
    .slice()
    .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "") || b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((r) => r.id);

  const adjuntosPorRetencion: Record<string, { id: string; nombre_archivo: string }[]> = {};
  if (idsRecientes.length > 0) {
    const { data: adjuntos } = await supabase
      .from("vendor_retencion_attachments")
      .select("id, nombre_archivo, vendor_retencion_id")
      .in("vendor_retencion_id", idsRecientes)
      .order("created_at", { ascending: true });
    for (const a of adjuntos ?? []) {
      (adjuntosPorRetencion[a.vendor_retencion_id] ??= []).push({ id: a.id, nombre_archivo: a.nombre_archivo });
    }
  }

  return (
    <PagosPortal
      vendors={vendors ?? []}
      retenciones={retenciones ?? []}
      entidadId={entidadActivaId ?? entities[0]?.id ?? null}
      vistaGlobal={vistaGlobal}
      entidades={entities.map((e) => ({ id: e.id, name: e.name }))}
      retencionDefault={entidadActiva?.default_contractor_retention_pct ?? 10}
      adjuntosPorRetencion={adjuntosPorRetencion}
    />
  );
}
