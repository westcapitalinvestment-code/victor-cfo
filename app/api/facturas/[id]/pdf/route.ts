import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";

// Genera el PDF de una factura al vuelo (no se guarda nada — se arma cada
// vez que se pide). Esta ruta es PÚBLICA a propósito: el id de la factura
// es un UUID (prácticamente imposible de adivinar), igual que un link de
// pago de Stripe o una factura de FreshBooks — así el cliente puede abrir
// el PDF desde WhatsApp sin tener que crear cuenta ni iniciar sesión. Por
// eso usa el cliente admin (se salta RLS) en vez de pedir sesión de usuario.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: factura, error } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, numero, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, notas, metodos_cobro_aceptados, clients(name, email, telefono, tax_id), business_entities(name, ein, municipio)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("descripcion, cantidad, precio_unitario, subtotal_linea")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  const { data: owner } = await supabase.from("users").select("full_name").eq("id", (factura as any).owner_id).maybeSingle();

  const cliente = (factura as any).clients as { name: string; email: string | null; telefono: string | null; tax_id: string | null } | null;
  const entidad = (factura as any).business_entities as { name: string; ein: string | null; municipio: string | null } | null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // carta
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const width = 612;
  let y = 792 - margin;

  const teal = rgb(0.114, 0.62, 0.459); // #1D9E75
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);

  function texto(
    contenido: string,
    x: number,
    yPos: number,
    opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}
  ) {
    page.drawText(contenido, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? negro });
  }

  function textoDerecha(
    contenido: string,
    xDerecha: number,
    yPos: number,
    opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}
  ) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: xDerecha - w, y: yPos, size, font: f, color: opts.color ?? negro });
  }

  // --- Encabezado: negocio a la izquierda, "FACTURA" + número a la derecha ---
  texto(entidad?.name || owner?.full_name || "VICTOR CFO", margin, y, { f: bold, size: 15 });
  y -= 16;
  if (owner?.full_name && entidad?.name && owner.full_name !== entidad.name) {
    texto(owner.full_name, margin, y, { size: 9, color: gris });
    y -= 12;
  }
  if (entidad?.ein) {
    texto(`RUC/EIN: ${entidad.ein}`, margin, y, { size: 9, color: gris });
    y -= 12;
  }
  if (entidad?.municipio) {
    texto(`${entidad.municipio}, PR`, margin, y, { size: 9, color: gris });
    y -= 12;
  }

  textoDerecha("FACTURA", width - margin, 792 - margin, { f: bold, size: 20, color: teal });
  textoDerecha(`# ${factura.numero}`, width - margin, 792 - margin - 20, { size: 11 });
  textoDerecha(`Emitida: ${factura.fecha_emision}`, width - margin, 792 - margin - 35, { size: 9, color: gris });
  if (factura.fecha_vencimiento) {
    textoDerecha(`Vence: ${factura.fecha_vencimiento}`, width - margin, 792 - margin - 47, { size: 9, color: gris });
  }

  y -= 14;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: lineaGris });
  y -= 20;

  // --- Cliente ---
  texto("FACTURAR A", margin, y, { f: bold, size: 8, color: gris });
  y -= 14;
  texto(cliente?.name ?? "Sin cliente", margin, y, { f: bold, size: 11 });
  y -= 14;
  if (cliente?.email) {
    texto(cliente.email, margin, y, { size: 9, color: gris });
    y -= 12;
  }
  if (cliente?.telefono) {
    texto(cliente.telefono, margin, y, { size: 9, color: gris });
    y -= 12;
  }
  if (cliente?.tax_id) {
    texto(`RUC: ${cliente.tax_id}`, margin, y, { size: 9, color: gris });
    y -= 12;
  }

  y -= 15;

  // --- Tabla de líneas ---
  const colDesc = margin;
  const colCant = 330;
  const colPrecio = 400;
  const colSubtotal = width - margin;

  page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 20, color: rgb(0.96, 0.96, 0.96) });
  texto("Descripción", colDesc + 5, y + 2, { f: bold, size: 9, color: gris });
  texto("Cant.", colCant, y + 2, { f: bold, size: 9, color: gris });
  texto("Precio", colPrecio, y + 2, { f: bold, size: 9, color: gris });
  textoDerecha("Subtotal", colSubtotal - 5, y + 2, { f: bold, size: 9, color: gris });
  y -= 24;

  for (const it of items ?? []) {
    const subtotalLinea = Number(it.subtotal_linea ?? Number(it.cantidad) * Number(it.precio_unitario));
    texto(String(it.descripcion).slice(0, 55), colDesc + 5, y, { size: 10 });
    texto(String(it.cantidad), colCant, y, { size: 10 });
    texto(formatMoney(Number(it.precio_unitario)), colPrecio, y, { size: 10 });
    textoDerecha(formatMoney(subtotalLinea), colSubtotal - 5, y, { size: 10 });
    y -= 18;
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 0.5, color: lineaGris });
  }

  y -= 10;

  // --- Totales ---
  const filaTotales = (label: string, valor: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    texto(label, colPrecio - 40, y, { size: 10, color: opts.color ?? gris, f: opts.bold ? bold : font });
    textoDerecha(valor, colSubtotal - 5, y, { size: 10, color: opts.color ?? negro, f: opts.bold ? bold : font });
    y -= 16;
  };

  filaTotales("Subtotal", formatMoney(Number(factura.subtotal)));
  if (Number(factura.ivu_pct) > 0) {
    filaTotales(`IVU (${factura.ivu_pct}%)`, `+${formatMoney(Number(factura.ivu_monto))}`);
  }
  if (Number(factura.retencion_pct) > 0) {
    filaTotales(`Retención (${factura.retencion_pct}%)`, `-${formatMoney(Number(factura.retencion_monto))}`);
  }
  page.drawLine({ start: { x: colPrecio - 40, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
  y -= 4;
  filaTotales("TOTAL", formatMoney(Number(factura.total)), { bold: true, color: teal });

  y -= 15;

  if (factura.notas) {
    texto("Notas", margin, y, { f: bold, size: 8, color: gris });
    y -= 13;
    texto(String(factura.notas).slice(0, 100), margin, y, { size: 9, color: gris });
    y -= 20;
  }

  if (factura.metodos_cobro_aceptados && factura.metodos_cobro_aceptados.length > 0) {
    texto(`Métodos de cobro aceptados: ${factura.metodos_cobro_aceptados.join(", ")}`, margin, y, { size: 8, color: gris });
    y -= 14;
  }

  textoDerecha("¡Gracias por su preferencia!", width - margin, 40, { size: 9, color: gris });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factura-${factura.numero}.pdf"`,
    },
  });
}
