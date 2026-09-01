import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EntidadForm from "../entidad-form";

// Crear entidad — la primera es la que "activa" el negocio dentro de Pro
// (incluida, sin cargo aparte); cada entidad adicional es +$24.99/mes.
// Formulario completo (Perfil/Fiscal/Facturas) calcado del mockup — ver
// entidad-form.tsx.
export default async function NuevaEntidadPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("business_entities")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("active", true);

  return <EntidadForm modo="crear" esPrimeraEntidad={(count ?? 0) === 0} />;
}
