import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import PagosPortal from "@/app/dashboard/pagos/pagos-portal";
import AdminNav from "@/app/admin/admin-nav";

// Pagos — exclusivo del nivel Administrador ($20/mes, migración 0056).
// Reusa PagosPortal tal cual (mismo componente del dueño), con
// ownerIdEfectivo para que vendors/vendor_retenciones queden bajo el
// owner_id del DUEÑO — ver lib/owner-efectivo.ts.
export default async function AdminPagosPage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");
  if (params.entityId !== efectivo.entityIdForzado) redirect(`/admin/${efectivo.entityIdForzado}`);
  // Pagos es exclusivo de Administrador — una Secretaria que escriba la URL
  // a mano se manda de vuelta a Facturación. RLS (migración 0056) ya lo
  // bloquearía a nivel de datos, esto solo evita la pantalla vacía.
  if (efectivo.adminTier !== "administrador") redirect(`/admin/${efectivo.entityIdForzado}`);

  const ownerId = efectivo.ownerId;
  const entityId = efectivo.entityIdForzado;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, default_contractor_retention_pct")
    .eq("id", entityId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!entidad) notFound();

  const [{ data: vendors }, { data: retenciones }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, tax_id, vendor_type, retention_type, default_retention_pct, active, entity_id")
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId)
      .order("name", { ascending: true }),
    supabase
      .from("vendor_retenciones")
      .select("id, vendor_id, gross_amount, retention_pct, retention_amount, net_paid, period_start, period_end, remittance_status, entity_id, created_at")
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId)
      .order("period_start", { ascending: false }),
  ]);

  // Evidencia (foto/PDF) por pago — mismo bloque que dashboard/pagos/page.tsx
  // (12 sept 2026, fix de raíz junto con la migración 0086 y el ownerId
  // efectivo en /api/pagos/adjuntos/*): sin esto el Administrador nunca veía
  // la evidencia ya subida por el dueño, aunque el backend ya la permitiera.
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
    <>
      <AdminNav entityId={entityId} activo="pagos" />
      <PagosPortal
        vendors={vendors ?? []}
        retenciones={retenciones ?? []}
        entidadId={entityId}
        entidades={[{ id: entidad.id, name: entidad.name }]}
        retencionDefault={entidad.default_contractor_retention_pct ?? 10}
        volverHref={`/admin/${entityId}`}
        volverLabel="← Facturación"
        ownerIdEfectivo={ownerId}
        adjuntosPorRetencion={adjuntosPorRetencion}
        modoAdmin
      />
    </>
  );
}
