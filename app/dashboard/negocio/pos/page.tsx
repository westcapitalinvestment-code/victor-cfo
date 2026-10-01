import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import PosClient from "./pos-client";

// Ventas de POS (Clover/Verifone/Square) — desglose de IVU/propinas (#786,
// 1 oct 2026, "dale montalo todo junto"). Joel preguntó si Clover/Verifone
// dejan sacar un reporte que se pueda subir a VICTOR: sí, ambos tienen un
// botón de exportar CSV desde su propio dashboard (Reporting → Sales
// Report / Export CSV), sin necesidad de conectar su API. Esta pantalla
// deja subir ese CSV y desglosarlo en gross/IVU estatal/IVU municipal/
// propinas/neto — sin crear un ingreso nuevo (el depósito real ya llega
// por Plaid como un solo lump-sum).
export default async function PosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());

  if (!entidades || entidades.length === 0) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de subir reportes de POS.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  return <PosClient entities={entidades} entidadInicial={entidadId ?? entidades[0].id} />;
}
