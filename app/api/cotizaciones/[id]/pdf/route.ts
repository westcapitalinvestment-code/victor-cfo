import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarBytesR2 } from "@/lib/r2";
import { formatMoney, formatFecha } from "@/lib/format";

// PDF de una cotización — mismo patrón que /api/facturas/[id]/pdf: público
// por UUID (para compartir por WhatsApp sin que el cliente inicie sesión).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      "id, owner_id, numero, subtotal, ivu_pct, ivu_monto, total, estado, fecha_emision, fecha_vencimiento, notas, clients(name, email, tax_id), business_entities(name, ein, municipio, phone, address, zip, invoice_footer, logo_r2_key, ivu_applies)"
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
  const entidad = (cotizacion as any).business_entities as {
    name: string;
    ein: string | null;
    municipio: string | null;
    phone: string | null;
    address: string | null;
    zip: string | null;
    invoice_footer: string | null;
    logo_r2_key: string | null;
    ivu_applies: boolean;
  } | null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad?.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(140 / logoImg.width, 50 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en el PDF:", err);
    }
  }

  const margin = 50;
  const width = 612;

  const teal = rgb(0.114, 0.62, 0.459);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);

  function envolverTexto(contenido: string, f: typeof font, size: number, anchoMax: number): string[] {
    const palabras = contenido.split(/\s+/);
    const lineas: string[] = [];
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (f.widthOfTextAtSize(prueba, size) > anchoMax && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
    return lineas.slice(0, 6);
  }

  function texto(contenido: string, x: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(contenido, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? negro });
  }
  function textoDerecha(contenido: string, xDerecha: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: xDerecha - w, y: yPos, size, font: f, color: opts.color ?? negro });
  }

  // --- Encabezado estilo FreshBooks (mismo patrón que /api/facturas): logo
  // + negocio arriba a la derecha (sin nombre personal ni EIN), línea de
  // color, y una fila con el cliente a la izquierda y el número + fechas +
  // el total bien grande a la derecha. ---
  let yLogo = 792 - margin;
  if (logoImg) {
    page.drawImage(logoImg, { x: margin, y: yLogo - logoDims.height, width: logoDims.width, height: logoDims.height });
  }

  let yNeg = 792 - margin - 2;
  textoDerecha(entidad?.name || owner?.full_name || "VICTOR CFO", width - margin, yNeg, { f: bold, size: 14 });
  yNeg -= 15;
  if (entidad?.phone) {
    textoDerecha(entidad.phone, width - margin, yNeg, { size: 9, color: gris });
    yNeg -= 12;
  }
  if (entidad?.address) {
    textoDerecha(entidad.address, width - margin, yNeg, { size: 9, color: gris });
    yNeg -= 12;
  }
  if (entidad?.municipio) {
    textoDerecha(`${entidad.municipio}, PR${entidad?.zip ? " " + entidad.zip : ""}`, width - margin, yNeg, { size: 9, color: gris });
    yNeg -= 12;
  }

  const yLogoAbajo = logoImg ? yLogo - logoDims.height - 24 : yLogo;
  let y = Math.min(yLogoAbajo, yNeg) - 14;

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 26;

  const yFila = y;
  texto("PARA", margin, yFila, { f: bold, size: 8, color: gris });
  textoDerecha("COTIZACIÓN #", width - margin, yFila, { f: bold, size: 8, color: gris });

  let yIzq = yFila - 14;
  texto(cliente?.name ?? "Sin cliente", margin, yIzq, { f: bold, size: 12 });
  let yDer = yFila - 14;
  textoDerecha(cotizacion.numero, width - margin, yDer, { f: bold, size: 12 });

  yIzq -= 14;
  if (cliente?.email) {
    texto(cliente.email, margin, yIzq, { size: 9, color: gris });
    yIzq -= 12;
  }
  if (cliente?.tax_id) {
    texto(`RUC: ${cliente.tax_id}`, margin, yIzq, { size: 9, color: gris });
    yIzq -= 12;
  }

  yDer -= 14;
  textoDerecha(`Emitida: ${formatFecha(cotizacion.fecha_emision)}`, width - margin, yDer, { size: 9, color: gris });
  yDer -= 12;
  if (cotizacion.fecha_vencimiento) {
    textoDerecha(`Válida hasta: ${formatFecha(cotizacion.fecha_vencimiento)}`, width - margin, yDer, { size: 9, color: gris });
    yDer -= 12;
  }
  yDer -= 8;
  textoDerecha("TOTAL COTIZADO", width - margin, yDer, { f: bold, size: 8, color: gris });
  yDer -= 22;
  textoDerecha(formatMoney(Number(cotizacion.total)), width - margin, yDer, { f: bold, size: 22, color: teal });

  y = Math.min(yIzq, yDer) - 20;

  const colDesc = margin;
  const colPrecio = 330;
  const colCant = 420;
  const colSubtotal = width - margin;

  page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 20, color: rgb(0.96, 0.96, 0.96) });
  texto("Descripción", colDesc + 5, y + 2, { f: bold, size: 9, color: gris });
  texto("Precio", colPrecio, y + 2, { f: bold, size: 9, color: gris });
  texto("Cant.", colCant, y + 2, { f: bold, size: 9, color: gris });
  textoDerecha("Subtotal", colSubtotal - 5, y + 2, { f: bold, size: 9, color: gris });
  y -= 24;

  for (const it of items ?? []) {
    const subtotalLinea = Number(it.subtotal_linea ?? Number(it.cantidad) * Number(it.precio_unitario));
    texto(String(it.descripcion).slice(0, 50), colDesc + 5, y, { size: 10 });
    texto(formatMoney(Number(it.precio_unitario)), colPrecio, y, { size: 10 });
    texto(String(it.cantidad), colCant, y, { size: 10 });
    textoDerecha(formatMoney(subtotalLinea), colSubtotal - 5, y, { size: 10 });
    y -= 18;
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 0.5, color: lineaGris });
  }

  y -= 10;

  const filaTotales = (label: string, valor: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    texto(label, colPrecio - 10, y, { size: 10, color: opts.color ?? gris, f: opts.bold ? bold : font });
    textoDerecha(valor, colSubtotal - 5, y, { size: 10, color: opts.color ?? negro, f: opts.bold ? bold : font });
    y -= 16;
  };

  filaTotales("Subtotal", formatMoney(Number(cotizacion.subtotal)));
  // Siempre visible si la entidad cobra IVU, igual que FreshBooks siempre
  // muestra "Tax" aunque sea $0.00 (pedido de Joel, 1 sept 2026).
  if (entidad?.ivu_applies) {
    filaTotales(`IVU (${cotizacion.ivu_pct}%)`, `+${formatMoney(Number(cotizacion.ivu_monto))}`);
  }
  page.drawLine({ start: { x: colPrecio - 10, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
  y -= 4;
  filaTotales("TOTAL", formatMoney(Number(cotizacion.total)), { bold: true, color: teal });

  y -= 15;

  if (cotizacion.notas) {
    const notaTexto = String(cotizacion.notas).slice(0, 220);
    const lineas = envolverTexto(notaTexto, font, 9, width - margin * 2 - 20);
    const alturaCaja = 16 + lineas.length * 12 + 6;
    page.drawRectangle({
      x: margin,
      y: y - alturaCaja + 10,
      width: width - margin * 2,
      height: alturaCaja,
      color: rgb(0.97, 0.98, 0.97),
      borderColor: lineaGris,
      borderWidth: 0.5,
    });
    texto("NOTAS", margin + 10, y, { f: bold, size: 7, color: teal });
    y -= 13;
    for (const linea of lineas) {
      texto(linea, margin + 10, y, { size: 9, color: negro });
      y -= 12;
    }
    y -= 14;
  }

  // Mismo patrón que /api/facturas: el pie de la cotización va anclado
  // abajo junto a la nota final, no donde termine de fluir el contenido.
  if (entidad?.invoice_footer) {
    const lineasPie = envolverTexto(String(entidad.invoice_footer).slice(0, 300), font, 8, width - margin * 2 - 260);
    let piePieY = 55;
    for (const linea of lineasPie) {
      texto(linea, margin, piePieY, { size: 8, color: gris });
      piePieY -= 11;
    }
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
