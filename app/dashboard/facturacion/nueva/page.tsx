import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../../pro-paywall";
import NuevaFacturaForm from "./nueva-factura-form";

export default async function NuevaFacturaPage() {
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
    .select("id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, invoice_prefix, invoice_start_number, default_payment_terms")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de facturar.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id, es_negocio, retention_pct, ivu_exempt_reseller, telefono")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  if (!clients || clients.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos un cliente antes de facturar.</p>
          <Link
            href="/dashboard/clientes/nuevo?returnTo=/dashboard/facturacion/nueva"
            className="vc-btn-primary inline-block"
          >
            Crear mi primer cliente
          </Link>
        </div>
      </div>
    );
  }

  // Número consecutivo por entidad: prefijo + (número inicial + cantidad de
  // facturas que ya tiene esa entidad). No es 100% a prueba de carreras
  // (dos facturas creadas en el mismo instante podrían chocar), pero para
  // un dueño facturando a mano uno por uno es más que suficiente — y si
  // llegara a chocar, el usuario lo ve al toque (número repetido) y no hay
  // ningún dato financiero perdido.
  const conteosPorEntidad: Record<string, number> = {};
  for (const ent of entities) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("entity_id", ent.id);
    conteosPorEntidad[ent.id] = count ?? 0;
  }

  const { data: servicios } = await supabase
    .from("services")
    .select("id, nombre, tipo, precio, ivu_exento")
    .eq("owner_id", user.id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return (
    <NuevaFacturaForm
      entities={entities}
      clients={clients}
      servicios={servicios ?? []}
      conteosPorEntidad={conteosPorEntidad}
    />
  );
}
