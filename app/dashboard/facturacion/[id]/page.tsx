import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import ProPaywall from "../../pro-paywall";
import FacturaDetalle from "./factura-detalle";

export default async function FacturaDetallePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan, full_name").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  const { data: factura } = await supabase
    .from("invoices")
    .select(
      "id, numero, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, metodo_pago, notas, metodos_cobro_aceptados, late_fee_habilitado, late_fee_tipo, late_fee_monto, late_fee_dias_gracia, clients(name, email, telefono, tax_id), business_entities(name, ein, municipio, phone, address, zip, invoice_footer)"
    )
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!factura) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("id, descripcion, cantidad, precio_unitario, subtotal_linea")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  const { data: adjuntos } = await supabase
    .from("invoice_attachments")
    .select("id, nombre_archivo")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  // Mismo caso que en cobros/page.tsx: clients/business_entities vienen
  // tipados como arreglo por la inferencia genérica de Supabase, pero en
  // tiempo de ejecución son un objeto único (relación 1:1 por FK).
  return (
    <FacturaDetalle
      factura={factura as any}
      items={items ?? []}
      adjuntosIniciales={adjuntos ?? []}
      negocioNombre={profile?.full_name ?? ""}
    />
  );
}
