import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ImportarFacturasForm from "./importar-facturas-form";

// Importar facturas históricas desde CSV/Excel (7 sept 2026, pedido de
// Joel: "VICTOR me esta tirando numeros con lo que he procesado el 1 sept
// hasta hoy" — porque Facturación solo tenía lo creado DENTRO de la app
// desde que empezó a usarla). Mismo requisito que /facturacion/nueva: hace
// falta al menos una entidad de negocio, porque invoices siempre cuelga de
// una.
export default async function ImportarFacturasPage({ searchParams }: { searchParams: { returnTo?: string; entidadId?: string } }) {
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
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de importar facturas.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <ImportarFacturasForm entities={entities} returnTo={searchParams?.returnTo} entidadPreseleccionada={searchParams?.entidadId} />;
}
