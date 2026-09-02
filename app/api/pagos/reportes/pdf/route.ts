import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatFecha } from "@/lib/format";

// PDF del resumen de Pagos a contratistas (2 sept 2026, pedido de Joel) —
// mismo patrón que /api/facturas/reportes/pdf (pdf-lib, misma paginación),
// pero con un solo bloque: Resumen + Por contratista, para el 480.6A/B.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") || "0000-01-01";
  const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10);
  const entityId = searchParams.get("entityId");
  const vendorIdsParam = searchParams.get("vendorIds");
  const vendorIds = vendorIdsParam ? vendorIdsParam.split(",").filter(Boolean) : null;

  let query = supabase
    .from("vendor_retenciones")
    .select("vendor_id, gross_amount, retention_pct, retention_amount, net_paid, period_end, vendors(name, tax_id)")
    .eq("owner_id", user.id)
    .gte("period_end", desde)
    .lte("period_end", hasta);
  if (entityId) query = query.eq("entity_id", entityId);
  if (vendorIds && vendorIds.length > 0) query = query.in("vendor_id", vendorIds);

  const { data } = await query;
  const filas = (data ?? []) as any[];

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };

  const porContratista = (() => {
    const mapa = new Map<string, { nombre: string; taxId: string; bruto: number; retenido: number; neto: number; count: number }>();
    for (const r of filas) {
      const nombre = r.vendors?.name ?? "Contratista eliminado";
      const actual = mapa.get(r.vendor_id) ?? { nombre, taxId: r.vendors?.tax_id ?? "", bruto: 0, retenido: 0, neto: 0, count: 0 };
      actual.bruto += Number(r.gross_amount);
      actual.retenido += Number(r.retention_amount);
      actual.neto += Number(r.net_paid);
      actual.count += 1;
      mapa.set(r.vendor_id, actual);
    }
    return [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
  })();

  const totalBruto = porContratista.reduce((s, c) => s + c.bruto, 0);
  const totalRetenido = porContratista.reduce((s, c) => s + c.retenido, 0);
  const totalNeto = porContratista.reduce((s, c) => s + c.neto, 0);

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const width = 612;
  const teal = rgb(0.114, 0.62, 0.459);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);
  const amb = rgb(0.83, 0.62, 0.05);

  let y = 792 - margin;

  function nuevaPagina() {
    page = pdf.addPage([612, 792]);
    y = 792 - margin;
  }
  function espacio(minimo: number) {
    if (y < minimo) nuevaPagina();
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
  function encabezadoSeccion(titulo: string) {
    espacio(90);
    y -= 10;
    texto(titulo.toUpperCase(), margin, y, { f: bold, size: 11, color: teal });
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: lineaGris });
    y -= 16;
  }
  function filaTabla(izq: string, der: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    espacio(50);
    texto(izq, margin, y, { size: 10, f: opts.bold ? bold : font, color: opts.color ?? negro });
    textoDerecha(der, width - margin, y, { size: 10, f: opts.bold ? bold : font, color: opts.color ?? negro });
    y -= 15;
  }

  texto(entidad?.name || "VICTOR CFO", margin, y, { f: bold, size: 16 });
  y -= 18;
  texto("Reporte de Pagos a Contratistas", margin, y, { size: 11, color: gris });
  y -= 14;
  texto(`Período: ${formatFecha(desde)} — ${formatFecha(hasta)}`, margin, y, { size: 9, color: gris });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 24;

  encabezadoSeccion("Resumen");
  filaTabla("Bruto pagado", formatMoney(totalBruto));
  filaTabla("Retenido (crédito para remesar)", formatMoney(totalRetenido), { color: amb });
  filaTabla("Neto pagado", formatMoney(totalNeto), { bold: true, color: teal });

  encabezadoSeccion("Por contratista — para el 480.6A/B");
  if (porContratista.length === 0) {
    filaTabla("No hay pagos registrados en este período.", "");
  } else {
    for (const c of porContratista) {
      filaTabla(`${c.nombre}${c.taxId ? ` (${c.taxId})` : ""} — ${c.count} pago${c.count === 1 ? "" : "s"}`, formatMoney(c.retenido));
    }
    espacio(40);
    y -= 4;
    page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.75, color: lineaGris });
    filaTabla("Total retenido", formatMoney(totalRetenido), { bold: true, color: teal });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reporte-pagos_${desde}_a_${hasta}.pdf"`,
    },
  });
}
