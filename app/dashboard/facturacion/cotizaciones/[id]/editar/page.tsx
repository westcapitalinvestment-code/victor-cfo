import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../../../../pro-paywall";
import EditarCotizacionForm from "./editar-cotizacion-form";

export default async function EditarCotizacionPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select("id, numero, entity_id, client_id, estado, fecha_vencimiento, notas")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!cotizacion) notFound();

  if (cotizacion.estado === "convertida") {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Esta cotización ya se convirtió en factura — no se puede editar.</p>
          <Link href={`/dashboard/facturacion/cotizaciones/${params.id}`} className="vc-btn-primary inline-block">
            Volver a la cotización
          </Link>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("cotizacion_items")
    .select("id, descripcion, detalle, cantidad, precio_unitario, service_id")
    .eq("cotizacion_id", params.id)
    .order("created_at", { ascending: true });

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal")
    .eq("owner_id", user.id)
    .eq("active", true);

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id, ivu_exempt_reseller")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  const { data: servicios } = await supabase
    .from("services")
    .select("id, nombre, descripcion, tipo, precio, ivu_exento")
    .eq("owner_id", user.id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return (
    <EditarCotizacionForm
      cotizacion={cotizacion}
      itemsIniciales={items ?? []}
      entities={entities ?? []}
      clients={clients ?? []}
      servicios={servicios ?? []}
    />
  );
}
