import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { formatMoney, slugificar } from "@/lib/format";

// PDF branded de la exportación año-fiscal del Modelo 480.6SP (30 sept 2026,
// mismo pedido que la versión Excel al lado: Joel quiere poder entregarle
// esto a su CPA en el mismo formato cuidado que el resto de los reportes de
// la app, no el CSV plano original). Mismo patrón pdf-lib que
// /api/pagos/reportes/pdf, pero con las 4 casillas reales y SSN/EIN en vez
// del resumen bruto/retenido/neto por rango libre.
function casilla(retentionType: string | null, isCorporation: boolean): number {
  const sujeto = retentionType === "480.6B";
  if (!sujeto && !isCorporation) return 1;
  if (!sujeto && isCorporation) return 2;
  if (sujeto && !isCorporation) return 3;
  return 4;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const anio = Number(searchParams.get("anio") || new Date().getFullYear());
  const entityId = searchParams.get("entityId");
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;

  let query = supabase
    .from("vendor_retenciones")
    .select("vendor_id, gross_amount, retention_amount, period_end, vendors(name, tax_id, retention_type, is_corporation)")
    .eq("owner_id", user.id)
    .gte("period_end", desde)
    .lte("period_end", hasta);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapa = new Map<
    string,
    { nombre: string; taxId: string; retentionType: string | null; isCorporation: boolean; bruto: number; retenido: number }
  >();
  for (const r of (data ?? []) as any[]) {
    const v = r.vendors;
    const nombre = v?.name ?? "Contratista eliminado";
    const actual =
      mapa.get(r.vendor_id) ??
      {
        nombre,
        taxId: v?.tax_id ?? "",
        retentionType: v?.retention_type ?? null,
        isCorporation: !!v?.is_corporation,
        bruto: 0,
        retenido: 0,
      };
    actual.bruto += Number(r.gross_amount);
    actual.retenido += Number(r.retention_amount);
    mapa.set(r.vendor_id, actual);
  }

  const filas = [...mapa.values()]
    .filter((f) => f.bruto >= 500)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad?.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(120 / logoImg.width, 44 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en el PDF de 480.6SP:", err);
    }
  }

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

  // Columnas: Casilla | Contratista (SSN/EIN) | Tipo | Bruto | Retenido
  const xCasilla = margin;
  const xContratista = margin + 36;
  const xTipo = width - margin - 190;
  const xBruto = width - margin - 110;
  const xRetenido = width - margin;
  function filaEncabezadoTabla() {
    espacio(50);
    texto("Cas.", xCasilla, y, { size: 9, f: bold, color: gris });
    texto("Contratista (SSN/EIN)", xContratista, y, { size: 9, f: bold, color: gris });
    texto("Tipo", xTipo, y, { size: 9, f: bold, color: gris });
    textoDerecha("Bruto", xBruto, y, { size: 9, f: bold, color: gris });
    textoDerecha("Retenido", xRetenido, y, { size: 9, f: bold, color: gris });
    y -= 14;
  }
  function filaContratista(
    num: number | "",
    nombreConTax: string,
    tipo: string,
    bruto: string,
    retenido: string,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) {
    espacio(50);
    const f = opts.bold ? bold : font;
    texto(num === "" ? "" : String(num), xCasilla, y, { size: 9.5, f, color: opts.color ?? negro });
    // Nombre truncado si es muy largo para no chocar con Tipo.
    const maxAncho = xTipo - xContratista - 8;
    let nombreMostrar = nombreConTax;
    while (f.widthOfTextAtSize(nombreMostrar, 9.5) > maxAncho && nombreMostrar.length > 10) {
      nombreMostrar = nombreMostrar.slice(0, -4) + "…";
    }
    texto(nombreMostrar, xContratista, y, { size: 9.5, f, color: opts.color ?? negro });
    texto(tipo, xTipo, y, { size: 9.5, f, color: opts.color ?? negro });
    textoDerecha(bruto, xBruto, y, { size: 9.5, f, color: opts.color ?? negro });
    textoDerecha(retenido, xRetenido, y, { size: 9.5, f, color: opts.color ?? negro });
    y -= 15;
  }

  if (logoImg) {
    page.drawImage(logoImg, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  }
  const xTexto = logoImg ? margin + logoDims.width + 14 : margin;
  texto(nombreTitular, xTexto, y, { f: bold, size: 16 });
  y -= 18;
  texto(`Modelo 480.6SP — Año fiscal ${anio}`, xTexto, y, { size: 11, color: gris });
  y -= 14;
  texto("Para el CPA · solo contratistas que cruzaron los $500 (Sección 1062.03)", xTexto, y, { size: 9, color: gris });
  y -= 6;
  if (logoImg) y = Math.min(y, 792 - margin - logoDims.height - 6);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 24;

  const totalBruto = filas.reduce((s, f) => s + f.bruto, 0);
  const totalRetenido = filas.reduce((s, f) => s + f.retenido, 0);

  encabezadoSeccion("Resumen");
  texto("Bruto pagado", margin, y, { size: 10 });
  textoDerecha(formatMoney(totalBruto), width - margin, y, { size: 10 });
  y -= 15;
  texto("Retenido (crédito para remesar)", margin, y, { size: 10, color: amb });
  textoDerecha(formatMoney(totalRetenido), width - margin, y, { size: 10, color: amb });
  y -= 20;

  encabezadoSeccion("Por contratista — casilla real del Modelo 480.6SP");
  if (filas.length === 0) {
    texto("No hay contratistas que crucen los $500 este año.", margin, y, { size: 10, color: gris });
    y -= 15;
  } else {
    filaEncabezadoTabla();
    for (const f of filas) {
      const num = casilla(f.retentionType, f.isCorporation);
      const tipo = f.isCorporation ? "Corp/entidad" : "Individuo";
      const nombreConTax = `${f.nombre}${f.taxId ? ` (${f.taxId})` : " (FALTA SSN/EIN)"}`;
      filaContratista(num, nombreConTax, tipo, formatMoney(f.bruto), formatMoney(f.retenido));
    }
    espacio(40);
    y -= 4;
    page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.75, color: lineaGris });
    filaContratista("", "Total", "", formatMoney(totalBruto), formatMoney(totalRetenido), { bold: true, color: teal });
  }

  for (const p of pdf.getPages()) {
    const marca = "Generado con VICTOR CFO  ·  victorcfo.com";
    const size = 8;
    const w = font.widthOfTextAtSize(marca, size);
    p.drawText(marca, { x: (width - w) / 2, y: 24, size, font, color: gris });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slugificar(nombreTitular)}-480.6SP_${anio}.pdf"`,
    },
  });
}
