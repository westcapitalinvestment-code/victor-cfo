import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NuevoClienteForm from "./nuevo-cliente-form";

export default async function NuevoClientePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  // Sin entidad no hay a quién facturarle — clients siempre cuelga de una
  // business_entity (ver 0001). Se manda a crear la entidad primero.
  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">
            Necesitas al menos una entidad de negocio antes de crear un cliente.
          </p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <NuevoClienteForm entities={entities} />;
}
