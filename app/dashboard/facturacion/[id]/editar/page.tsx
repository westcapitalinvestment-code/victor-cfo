import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../../../pro-paywall";
import EditarFacturaForm from "./editar-factura-form";

export default async function EditarFacturaPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("plan, addon_tecnicos_status")
    .eq("id", user.id)
    .maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;
  const addonTecnicosActivo = profile?.addon_tecnicos_status === "activo";

  const { data: factura } = await supabase
    .from("invoices")
    .select(
      "id, entity_id, client_id, servicio_id, technician_id, numero, estado, fecha_emision, fecha_vencimiento, notas, metodos_cobro_aceptados, retencion_pct, late_fee_habilitado, late_fee_tipo, late_fee_monto, late_fee_dias_gracia, es_recurrente, frecuencia_recurrente, deposito_monto"
    )
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!factura) notFound();

  if (factura.estado === "pagada") {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Esta factura ya está pagada — no se puede editar. Si algo está mal, contacta soporte.</p>
          <Link href={`/dashboard/facturacion/${params.id}`} className="vc-btn-primary inline-block">
            Volver a la factura
          </Link>
        </div>
      </div>
    );
  }

  // Trae TODAS las líneas de la factura (antes solo la primera con
  // .limit(1) — se perdían las demás al editar una factura con varios
  // servicios; 1 sept 2026, pedido de Joel).
  const { data: items } = await supabase
    .from("invoice_items")
    .select("id, descripcion, detalle, precio_unitario, cantidad, service_id")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, client_retention_situation, ath_movil_business_path")
    .eq("owner_id", user.id)
    .eq("active", true);

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id, es_negocio, retention_pct, ivu_exempt_reseller, telefono")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  const { data: servicios } = await supabase
    .from("services")
    .select("id, nombre, descripcion, tipo, precio, ivu_exento")
    .eq("owner_id", user.id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  const { data: tecnicos } = await supabase
    .from("technicians")
    .select("id, name, entity_id")
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("name", { ascending: true });

  return (
    <EditarFacturaForm
      factura={factura}
      itemsIniciales={items ?? []}
      entities={entities ?? []}
      clients={clients ?? []}
      servicios={servicios ?? []}
      tecnicos={tecnicos ?? []}
      addonTecnicosActivo={addonTecnicosActivo}
    />
  );
}
