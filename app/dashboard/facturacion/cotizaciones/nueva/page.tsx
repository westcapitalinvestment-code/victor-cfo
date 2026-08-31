import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../../../pro-paywall";
import NuevaCotizacionForm from "./nueva-cotizacion-form";

export default async function NuevaCotizacionPage() {
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
    .select("id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de cotizar.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id, ivu_exempt_reseller")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  if (!clients || clients.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos un cliente antes de cotizar.</p>
          <Link
            href="/dashboard/clientes/nuevo?returnTo=/dashboard/facturacion/cotizaciones/nueva"
            className="vc-btn-primary inline-block"
          >
            Crear mi primer cliente
          </Link>
        </div>
      </div>
    );
  }

  const { data: servicios } = await supabase
    .from("services")
    .select("id, nombre, tipo, precio, ivu_exento")
    .eq("owner_id", user.id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  // Número consecutivo simple: COT- + cantidad de cotizaciones + 1. No es a
  // prueba de carreras (igual que el número de factura), pero es más que
  // suficiente para un dueño cotizando uno por uno.
  const { count } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  return (
    <NuevaCotizacionForm
      entities={entities}
      clients={clients}
      servicios={servicios ?? []}
      numeroInicial={`COT-${1000 + (count ?? 0) + 1}`}
    />
  );
}
