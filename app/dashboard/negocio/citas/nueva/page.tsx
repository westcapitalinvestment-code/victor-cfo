import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import NuevaCitaNegocioForm from "./nueva-cita-negocio-form";

export default async function NuevaCitaNegocioPage() {
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
          <p className="mb-3 text-sm">Elige una entidad específica en el selector de arriba antes de crear una cita de negocio.</p>
          <Link href="/dashboard/negocio/citas" className="vc-btn-primary inline-block">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return <NuevaCitaNegocioForm entidadId={entidadId} />;
}
