import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportarPagosForm from "./importar-pagos-form";

// Importar pagos históricos a contratistas desde CSV/Excel (30 sept 2026,
// pedido de Joel: un contratista que llega a mitad de año con data de otro
// sistema no debería tener que esperar a enero para que el acumulado de
// $500 y el 480.6SP le funcionen). Mismo requisito que /facturacion/importar
// — hace falta al menos una entidad de negocio, porque vendors siempre
// cuelga de una.
export default async function ImportarPagosPage({ searchParams }: { searchParams: { returnTo?: string; entidadId?: string } }) {
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
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de importar pagos a contratistas.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <ImportarPagosForm entities={entities} returnTo={searchParams?.returnTo} entidadPreseleccionada={searchParams?.entidadId} />;
}
