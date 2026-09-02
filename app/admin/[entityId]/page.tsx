import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import FacturacionPortal from "@/app/dashboard/facturacion/facturacion-portal";
import AdminNav from "@/app/admin/admin-nav";

// Portal de trabajo de Admin/Secretaria — mismo componente que usa el
// dueño en /dashboard/facturacion (FacturacionPortal), pero en modoAdmin:
// solo Facturas + Clientes (acceso base que Joel definió), basePath propio
// para que todos los links internos apunten a /admin/[entityId]/... en vez
// de /dashboard/facturacion/..., y ownerIdEfectivo para que lo que se cree
// (clientes, facturas) quede guardado bajo el owner_id del DUEÑO, no del
// admin. Ver lib/owner-efectivo.ts para la explicación completa.
export default async function AdminEntidadPage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");

  // Un admin nunca puede navegar a la entidad de OTRO dueño escribiendo la
  // URL a mano — si el entityId de la ruta no es el suyo, lo mandamos de
  // vuelta al suyo. RLS ya lo protegería a nivel de datos, pero esto evita
  // que ni siquiera llegue a ver una pantalla con datos ajenos vacíos.
  if (params.entityId !== efectivo.entityIdForzado) {
    redirect(`/admin/${efectivo.entityIdForzado}`);
  }

  const ownerId = efectivo.ownerId;
  const entityId = efectivo.entityIdForzado;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, ath_movil_business_path")
    .eq("id", entityId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!entidad) notFound();

  const [{ data: clients }, { data: facturas }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, email, es_negocio, retention_pct, entity_id, active")
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId)
      .order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select(
        "id, numero, subtotal, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, metodo_pago, entity_id, client_id, clients(name)"
      )
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId)
      .order("fecha_emision", { ascending: false }),
  ]);

  return (
    <>
      {efectivo.adminTier === "administrador" && <AdminNav entityId={entityId} activo="facturacion" />}
      <FacturacionPortal
        clients={clients ?? []}
        facturas={(facturas ?? []) as any}
        servicios={[]}
        cotizaciones={[]}
        entidadId={entityId}
        entidadesConAth={entidad.ath_movil_business_path ? [entityId] : []}
        basePath={`/admin/${entityId}`}
        clientesBasePath={`/admin/${entityId}/clientes`}
        ownerIdEfectivo={ownerId}
        modoAdmin
      />
    </>
  );
}
