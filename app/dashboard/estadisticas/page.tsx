import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import EstadisticasTab from "../facturacion/estadisticas-tab";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Estadísticas del negocio (3 nov 2026, pedido de Joel): icono propio en el
// nav de negocio, antes de Config. Todo se calcula con datos que ya existen
// (clientes, cotizaciones, facturas — incluidas las importadas desde Stripe
// y Shopify —, seguimientos y gasto de mercadeo). Scoped a la entidad activa.
export default async function EstadisticasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio para ver estadísticas.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId, vistaGlobal } = resolverEntidadActiva(entities, leerEntidadActivaCookie());
  const activa = entities.find((e) => e.id === entidadId);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <h1 className="mb-1 text-lg font-semibold">Estadísticas</h1>
      <p className="mb-4 text-xs text-muted">{vistaGlobal || !activa ? "Todas tus entidades" : activa.name}</p>
      <EstadisticasTab entidadId={vistaGlobal ? null : entidadId ?? null} />
    </div>
  );
}
