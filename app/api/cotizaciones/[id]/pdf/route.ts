import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";

// PDF de una cotización — mismo patrón que /api/facturas/[id]/pdf: público
// por UUID (para compartir por WhatsApp sin que el cliente inicie sesión).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      "id, owner_id, numero, subtotal, ivu_pct, ivu_monto, total, estado, fecha_emision, fecha_vencimiento, notas, clients(name, email, tax_id), business_entities(name, ein, municipio)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !cotizacion) {
    return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("cotizacion_items")
    .select("descripcion, cantidad, precio_unitario, subtotal_linea")
    .eq("cotizacion_id", params.id)
    .order("created_at", { ascending: true });

  const { data: owner } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", (cotizacion as any).owner_id)
    .maybeSingle();

  const cliente = (cotizacion as any).clients as { name: string; email: string | null; tax_id: string | null } | null;
  const entidad = (cotizacion as any).business_entities as { name: string; ein: string | null; municipio: string | null } | null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const width = 612;
  let y = 792 - margin;

  const teal = rgb(0.114, 0.62, 0.459);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);

  function texto(contenido: string, x: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(contenido, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? negro });
  }
  function textoDerecha(contenido: string, xDerecha: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: xDerecha - w, y: yPos, size, font: f, color: opts.color ?? negro });
  }

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

  textoDerecha("COTIZACIÓN", width - margin, 792 - margin, { f: bold, size: 18, color: teal });
  textoDerecha(`# ${cotizacion.numero}`, width - margin, 792 - margin - 20, { size: 11 });
  textoDerecha(`Emitida: ${cotizacion.fecha_emision}`, width - margin, 792 - margin - 35, { size: 9, color: gris });
  if (cotizacion.fecha_vencimiento) {
    textoDerecha(`Válida hasta: ${cotizacion.fecha_vencimiento}`, width - margin, 792 - margin - 47, { size: 9, color: gris });
  }

  y -= 14;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: lineaGris });
  y -= 20;

  texto("PARA", margin, y, { f: bold, size: 8, color: gris });
  y -= 14;
  texto(cliente?.name ?? "Sin cliente", margin, y, { f: bold, size: 11 });
  y -= 14;
  if (cliente?.email) {
    texto(cliente.email, margin, y, { size: 9, color: gris });
    y -= 12;
  }
  if (cliente?.tax_id) {
    texto(`RUC: ${cliente.tax_id}`, margin, y, { size: 9, color: gris });
    y -= 12;
  }

  y -= 15;

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

  const filaTotales = (label: string, valor: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    texto(label, colPrecio - 40, y, { size: 10, color: opts.color ?? gris, f: opts.bold ? bold : font });
    textoDerecha(valor, colSubtotal - 5, y, { size: 10, color: opts.color ?? negro, f: opts.bold ? bold : font });
    y -= 16;
  };

  filaTotales("Subtotal", formatMoney(Number(cotizacion.subtotal)));
  if (Number(cotizacion.ivu_pct) > 0) {
    filaTotales(`IVU (${cotizacion.ivu_pct}%)`, `+${formatMoney(Number(cotizacion.ivu_monto))}`);
  }
  page.drawLine({ start: { x: colPrecio - 40, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
  y -= 4;
  filaTotales("TOTAL", formatMoney(Number(cotizacion.total)), { bold: true, color: teal });

  y -= 15;

  if (cotizacion.notas) {
    texto("Notas", margin, y, { f: bold, size: 8, color: gris });
    y -= 13;
    texto(String(cotizacion.notas).slice(0, 100), margin, y, { size: 9, color: gris });
    y -= 20;
  }

  textoDerecha("Cotización sujeta a cambios — ¡gracias por considerarnos!", width - margin, 40, { size: 9, color: gris });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotizacion-${cotizacion.numero}.pdf"`,
    },
  });
}
