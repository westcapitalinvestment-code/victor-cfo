import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import EditarLogoForm from "./editar-logo-form";

export default async function EditarEntidadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, logo_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!entidad) notFound();

  return <EditarLogoForm entidad={entidad} />;
}
