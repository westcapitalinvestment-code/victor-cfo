import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import ProPaywall from "../../../pro-paywall";
import CotizacionDetalle from "./cotizacion-detalle";

export default async function CotizacionDetallePage({ params }: { params: { id: string } }) {
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
    .select(
      "id, numero, subtotal, ivu_pct, ivu_monto, total, deposito_monto, estado, fecha_emision, fecha_vencimiento, notas, invoice_id, entity_id, client_id, technician_id, clients(name, email, telefono, es_negocio, retention_pct), business_entities(name, invoice_prefix, invoice_start_number, default_payment_terms, ein, municipio, phone, address, zip, invoice_footer, ivu_applies), technicians(name)"
    )
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!cotizacion) notFound();

  const { data: items } = await supabase
    .from("cotizacion_items")
    .select("id, descripcion, detalle, cantidad, precio_unitario, subtotal_linea, service_id")
    .eq("cotizacion_id", params.id)
    .order("created_at", { ascending: true });

  const { data: adjuntos } = await supabase
    .from("cotizacion_attachments")
    .select("id, nombre_archivo")
    .eq("cotizacion_id", params.id)
    .order("created_at", { ascending: true });

  let conteoFacturas = 0;
  if (cotizacion.estado === "aprobada") {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("entity_id", cotizacion.entity_id);
    conteoFacturas = count ?? 0;
  }

  // Igual que en factura-detalle: clients/business_entities vienen tipados
  // como arreglo por la inferencia genérica de Supabase, pero en tiempo de
  // ejecución son un objeto único (relación 1:1 por FK).
  return (
    <CotizacionDetalle
      cotizacion={cotizacion as any}
      items={items ?? []}
      adjuntosIniciales={adjuntos ?? []}
      conteoFacturas={conteoFacturas}
    />
  );
}
