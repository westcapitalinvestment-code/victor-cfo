import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import NuevoDocumentoNegocioForm from "./nuevo-documento-negocio-form";

export default async function NuevoDocumentoNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());

  if (!entidades || entidades.length === 0 || vistaGlobal || !entidadId) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Elige una entidad específica en el selector de arriba antes de subir un documento de negocio.</p>
          <Link href="/dashboard/negocio/documentos" className="vc-btn-primary inline-block">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return <NuevoDocumentoNegocioForm entidadId={entidadId} />;
}
