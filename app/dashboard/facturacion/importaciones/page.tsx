import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportacionesLista from "./importaciones-lista";

// Historial de importaciones de CSV de facturas + botón para deshacer una
// completa (migración 0074, 7 sept 2026 — Joel: "necesito otra herramienta
// para borrar un CSV por si subí un CSV equivocado en facturas al
// importar"). Mismo requisito de entidad que /facturacion/importar.
export default async function ImportacionesPage({ searchParams }: { searchParams: { entidadId?: string } }) {
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

  return <ImportacionesLista entities={entities} entidadPreseleccionada={searchParams?.entidadId} />;
}
