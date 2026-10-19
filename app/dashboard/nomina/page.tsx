import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import AddonNominaGate from "./addon-nomina-gate";
import NominaPortal, { type ParamFila } from "./nomina-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import { NOMINA_INCLUIDA_EN_BUSINESS } from "@/lib/stripe";

// Módulo Nómina (19 oct 2026, pedido de Joel): addon aparte de $24.99/mes al
// lado de Pagos. VICTOR CALCULA la nómina de Puerto Rico (retenciones del
// empleado, contribuciones del patrono, recibo, depósitos y asiento
// contable); no radica ni deposita nada. Ver lib/nomina.ts y la migración 0167.
export default async function NominaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan, addon_nomina_status").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;
  const incluido = profile?.plan === "proplus" && NOMINA_INCLUIDA_EN_BUSINESS;
  if (!incluido && profile?.addon_nomina_status !== "activo") {
    return <AddonNominaGate puedeActivar volverHref="/dashboard" />;
  }

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("name", { ascending: true });

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de calcular una nómina.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId } = resolverEntidadActiva(entities, leerEntidadActivaCookie());
  const entidadInicial = entidadId ?? entities[0].id;

  // Parámetros vigentes para mostrar en la pestaña "Tasas": por cada clave, la
  // fila del año más reciente <= año actual.
  const anio = new Date().getFullYear();
  const { data: filas } = await supabase
    .from("payroll_params")
    .select("jurisdiccion, anio, clave, valor, descripcion, fuente, por_confirmar")
    .lte("anio", anio)
    .order("jurisdiccion", { ascending: true })
    .order("clave", { ascending: true });
  const mejor = new Map<string, ParamFila>();
  for (const f of (filas ?? []) as (ParamFila & { anio: number })[]) {
    const prev = mejor.get(f.clave) as (ParamFila & { anio: number }) | undefined;
    if (!prev || f.anio > prev.anio) mejor.set(f.clave, f);
  }
  const parametros = Array.from(mejor.values()) as ParamFila[];

  return <NominaPortal entidades={entities} entidadInicialId={entidadInicial} parametros={parametros} anio={anio} />;
}
