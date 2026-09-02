import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import NuevaFacturaForm from "@/app/dashboard/facturacion/nueva/nueva-factura-form";

// "Nueva factura" del portal de Admin/Secretaria — mismo formulario que usa
// el dueño (misma lógica de IVU/retención/ATH, no reimplementada), pero con
// el owner_id resuelto en vez de asumir que quien está logueado es el
// dueño. Sin "Asignar a técnico" (tecnicos=[]) — esa es una función de
// Equipo que no está en el alcance de este portal todavía.
export default async function AdminNuevaFacturaPage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");
  if (params.entityId !== efectivo.entityIdForzado) redirect(`/admin/${efectivo.entityIdForzado}`);

  const ownerId = efectivo.ownerId;
  const entityId = efectivo.entityIdForzado;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select(
      "id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, invoice_prefix, invoice_start_number, default_payment_terms, client_retention_situation, ath_movil_business_path"
    )
    .eq("id", entityId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!entidad) notFound();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id, es_negocio, retention_pct, ivu_exempt_reseller, telefono")
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (!clients || clients.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos un cliente antes de facturar.</p>
          <Link href={`/admin/${entityId}/clientes/nuevo?returnTo=/admin/${entityId}/nueva`} className="vc-btn-primary inline-block">
            Crear mi primer cliente
          </Link>
        </div>
      </div>
    );
  }

  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId);

  const { data: servicios } = await supabase
    .from("services")
    .select("id, nombre, descripcion, tipo, precio, ivu_exento")
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return (
    <NuevaFacturaForm
      entities={[entidad]}
      clients={clients}
      servicios={servicios ?? []}
      conteosPorEntidad={{ [entityId]: count ?? 0 }}
      tecnicos={[]}
      addonTecnicosActivo={false}
      basePath={`/admin/${entityId}`}
      ownerIdEfectivo={ownerId}
    />
  );
}
