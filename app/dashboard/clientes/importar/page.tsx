import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportarClientesForm from "./importar-clientes-form";

// Importar clientes desde CSV (ej. exportado de FreshBooks) — mismo
// requisito que /clientes/nuevo: hace falta al menos una entidad de
// negocio, porque clients siempre cuelga de una (ver 0001).
export default async function ImportarClientesPage({ searchParams }: { searchParams: { returnTo?: string } }) {
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

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de importar clientes.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <ImportarClientesForm entities={entities} returnTo={searchParams?.returnTo} />;
}
