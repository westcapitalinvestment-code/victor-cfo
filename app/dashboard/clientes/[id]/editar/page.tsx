import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import EditarClienteForm from "./editar-cliente-form";

export default async function EditarClientePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { returnTo?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cliente } = await supabase
    .from("clients")
    .select("id, entity_id, name, email, telefono, tax_id, address, es_negocio, retention_pct, active")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!cliente) notFound();

  const [{ data: entities }, { count: totalFacturas }, { count: totalCotizaciones }] = await Promise.all([
    supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", cliente.id),
    supabase.from("cotizaciones").select("id", { count: "exact", head: true }).eq("client_id", cliente.id),
  ]);

  // "Eliminar" de verdad solo se ofrece cuando el cliente no tiene NADA
  // enganchado — ver 0043 para por qué (un DELETE con historial le
  // arranca el nombre a facturas/cotizaciones ya emitidas, por el ON
  // DELETE SET NULL).
  const puedeEliminar = (totalFacturas ?? 0) === 0 && (totalCotizaciones ?? 0) === 0;

  return (
    <EditarClienteForm cliente={cliente} entities={entities ?? []} returnTo={searchParams?.returnTo} puedeEliminar={puedeEliminar} />
  );
}
