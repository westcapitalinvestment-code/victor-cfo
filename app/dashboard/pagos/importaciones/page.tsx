import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportacionesPagosLista from "./importaciones-lista";

// Historial de importaciones de CSV de pagos a contratistas + botón para
// deshacer una completa (30 sept 2026). Mismo requisito de entidad que
// /pagos/importar.
export default async function ImportacionesPagosPage({ searchParams }: { searchParams: { entidadId?: string } }) {
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
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <ImportacionesPagosLista entities={entities} entidadPreseleccionada={searchParams?.entidadId} />;
}
