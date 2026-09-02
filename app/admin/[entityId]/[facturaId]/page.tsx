import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import FacturaDetalle from "@/app/dashboard/facturacion/[id]/factura-detalle";

// Detalle de factura del portal de Admin/Secretaria — mismo componente que
// el dueño, en modoAdmin (sin Editar/Eliminar, ver el comentario en
// factura-detalle.tsx). "negocioNombre" viene del nombre de la ENTIDAD
// (no del dueño personal) porque es lo que se usa para armar el mensaje de
// WhatsApp — un admin no tiene "nombre completo" de dueño para eso.
export default async function AdminFacturaDetallePage({
  params,
}: {
  params: { entityId: string; facturaId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");
  if (params.entityId !== efectivo.entityIdForzado) redirect(`/admin/${efectivo.entityIdForzado}`);

  const ownerId = efectivo.ownerId;
  const entityId = efectivo.entityIdForzado;

  const { data: factura } = await supabase
    .from("invoices")
    .select(
      "id, numero, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, deposito_monto, estado, fecha_emision, fecha_vencimiento, metodo_pago, fecha_pago, notas, metodos_cobro_aceptados, late_fee_habilitado, late_fee_tipo, late_fee_monto, late_fee_dias_gracia, clients(name, email, telefono, tax_id), business_entities(name, ein, municipio, phone, address, zip, invoice_footer, ivu_applies)"
    )
    .eq("id", params.facturaId)
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (!factura) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("id, descripcion, detalle, cantidad, precio_unitario, subtotal_linea")
    .eq("invoice_id", params.facturaId)
    .order("created_at", { ascending: true });

  const { data: adjuntos } = await supabase
    .from("invoice_attachments")
    .select("id, nombre_archivo")
    .eq("invoice_id", params.facturaId)
    .order("created_at", { ascending: true });

  return (
    <FacturaDetalle
      factura={factura as any}
      items={items ?? []}
      adjuntosIniciales={adjuntos ?? []}
      negocioNombre={(factura as any).business_entities?.name ?? ""}
      basePath={`/admin/${entityId}`}
      modoAdmin
    />
  );
}
