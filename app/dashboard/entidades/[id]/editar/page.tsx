import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import EntidadForm from "../../entidad-form";

export default async function EditarEntidadPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { bienvenida?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidad } = await supabase
    .from("business_entities")
    .select(
      "id, name, ein, entity_type, phone, address, municipio, zip, email, website, tax_regime, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, client_retention_situation, relevo_certificate_expiry, relevo_certificate_r2_key, invoice_prefix, invoice_start_number, default_payment_terms, default_late_fee, payment_methods, invoice_footer, logo_r2_key, created_at"
    )
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!entidad) notFound();

  const { data: entidades } = await supabase
    .from("business_entities")
    .select("id, created_at")
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const esPrimeraEntidad = entidades?.[0]?.id === entidad.id;

  return (
    <EntidadForm
      modo="editar"
      entidad={entidad as any}
      esPrimeraEntidad={esPrimeraEntidad}
      bienvenida={searchParams?.bienvenida === "1"}
    />
  );
}
