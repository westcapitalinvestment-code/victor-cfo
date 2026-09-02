import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import NuevoClienteForm from "@/app/dashboard/clientes/nuevo/nuevo-cliente-form";

// "Nuevo cliente" del portal de Admin/Secretaria — mismo formulario que el
// dueño, con el owner_id resuelto. entities siempre trae UNA sola (la
// entidad forzada del admin), así que el selector de entidad del formulario
// (solo aparece si entities.length > 1) ni se muestra.
export default async function AdminNuevoClientePage({
  params,
  searchParams,
}: {
  params: { entityId: string };
  searchParams: { returnTo?: string };
}) {
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
    .select("id, name")
    .eq("id", entityId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!entidad) notFound();

  return (
    <NuevoClienteForm
      entities={[entidad]}
      returnTo={searchParams?.returnTo || `/admin/${entityId}?tab=clientes`}
      ownerIdEfectivo={ownerId}
    />
  );
}
