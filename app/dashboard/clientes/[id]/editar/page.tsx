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
    .select("id, entity_id, name, email, telefono, tax_id, address, es_negocio, retention_pct")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!cliente) notFound();

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  return <EditarClienteForm cliente={cliente} entities={entities ?? []} returnTo={searchParams?.returnTo} />;
}
