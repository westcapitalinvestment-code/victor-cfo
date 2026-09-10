import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { calcularEstadoResultados, MESES_CORTOS, type LineaEstadoResultados } from "@/lib/estado-resultados";
import { formatMoney, slugificar } from "@/lib/format";

// PDF del Estado de Resultados (10 sept 2026) — matriz mes-a-mes en vez del
// total plano del reporte de Gastos existente. Landscape (792x612) porque
// son 14 columnas (Categoría + 12 meses + Total) — no caben en portrait sin
// que el texto quede ilegible. Mismo tratamiento visual que el resto de
// reportes de la app (app/api/transacciones/exportar/pdf): header con logo,
// resumen, tabla, marca al pie.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");
  const anio = Number(searchParams.get("anio")) || new Date().getFullYear();

  if (!entityId) {
    return NextResponse.json({ error: "Falta entityId — el Estado de Resultados es exclusivo de negocio." }, { status: 400 });
  }
  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name, logo_r2_key")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });

  const er = await calcularEstadoResultados(supabase, { ownerId: user.id, entityId, anio });

  const pdf = await PDFDocument.create();
  const width = 792;
  const height = 612;
  let page = pdf.addPage([width, height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(110 / logoImg.width, 40 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en el PDF del Estado de Resultados:", err);
    }
  }

  const margin = 36;
  const teal = rgb(0.114, 0.62, 0.459);
  const tealOscuro = rgb(0.059, 0.42, 0.306);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const rojo = rgb(0.83, 0.3, 0.24);
  const filaAlterna = rgb(0.965, 0.965, 0.965);

  // Columnas: Categoría (ancha) + 12 meses + Total, dentro del ancho útil.
  const colCategoria = 170;
  const colMes = (width - margin * 2 - colCategoria - 58) / 12;
  const colTotal = 58;
  const xCategoria = margin;
  const xMeses = MESES_CORTOS.map((_, i) => xCategoria + colCategoria + i * colMes);
  const xTotal = xCategoria + colCategoria + 12 * colMes;

  let y = height - margin;

  function nuevaPagina() {
    page = pdf.addPage([width, height]);
    y = height - margin;
  }
  function espacio(minimo: number) {
    if (y < minimo) {
      nuevaPagina();
      encabezadoTabla();
    }
  }
  function texto(contenido: string, x: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(contenido, { x, y: yPos, size: opts.size ?? 9, font: opts.f ?? font, color: opts.color ?? negro });
  }
  function textoDerecha(contenido: string, xDerecha: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 9;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: xDerecha - w, y: yPos, size, font: f, color: opts.color ?? negro });
  }

  function encabezadoTabla() {
    page.drawRectangle({ x: margin, y: y - 16, width: width - margin * 2, height: 18, color: tealOscuro });
    texto("Categoría", xCategoria + 4, y - 12, { f: bold, size: 8, color: rgb(1, 1, 1) });
    MESES_CORTOS.forEach((m, i) => {
      textoDerecha(m, xMeses[i] + colMes - 3, y - 12, { f: bold, size: 8, color: rgb(1, 1, 1) });
    });
    textoDerecha("Total", xTotal + colTotal - 3, y - 12, { f: bold, size: 8, color: rgb(1, 1, 1) });
    y -= 22;
  }

  function filaSeccion(titulo: string) {
    espacio(50);
    y -= 4;
    texto(titulo.toUpperCase(), xCategoria, y, { f: bold, size: 8.5, color: gris });
    y -= 13;
  }

  let filaIdx = 0;
  function filaLinea(l: LineaEstadoResultados, colorTotal: ReturnType<typeof rgb>) {
    espacio(40);
    if (filaIdx % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 14, color: filaAlterna });
    }
    filaIdx++;
    const etiqueta = l.lineaScheduleC ? `${l.nombre.slice(0, 26)} (${l.lineaScheduleC})` : l.nombre.slice(0, 30);
    texto(etiqueta, xCategoria + 4, y, { size: 7.5 });
    l.porMes.forEach((v, i) => {
      if (v) textoDerecha(formatMoney(v, 0).replace("$", ""), xMeses[i] + colMes - 3, y, { size: 7.5 });
    });
    textoDerecha(formatMoney(l.total, 0), xTotal + colTotal - 3, y, { f: bold, size: 7.5, color: colorTotal });
    y -= 14;
  }

  function filaTotal(etiqueta: string, porMes: number[], total: number, color: ReturnType<typeof rgb>) {
    espacio(40);
    y -= 3;
    page.drawLine({ start: { x: margin, y: y + 11 }, end: { x: width - margin, y: y + 11 }, thickness: 1, color: teal });
    texto(etiqueta, xCategoria + 4, y, { f: bold, size: 8, color });
    porMes.forEach((v, i) => {
      textoDerecha(formatMoney(v, 0), xMeses[i] + colMes - 3, y, { f: bold, size: 7.5, color });
    });
    textoDerecha(formatMoney(total, 0), xTotal + colTotal - 3, y, { f: bold, size: 8, color });
    y -= 16;
    filaIdx = 0;
  }

  // --- Encabezado ---
  if (logoImg) {
    page.drawImage(logoImg, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  }
  const xTexto = logoImg ? margin + logoDims.width + 14 : margin;
  texto(entidad.name, xTexto, y, { f: bold, size: 15 });
  y -= 17;
  texto("Estado de Resultados", xTexto, y, { size: 10, color: gris });
  y -= 13;
  texto(`Año ${anio}`, xTexto, y, { size: 8.5, color: gris });
  y -= 5;
  if (logoImg) y = Math.min(y, height - margin - logoDims.height - 6);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 18;

  texto("Ingresos", xCategoria, y, { size: 9, color: teal });
  textoDerecha(formatMoney(er.totalIngresos), xCategoria + 160, y, { f: bold, size: 9, color: teal });
  texto("Gastos", xCategoria + 190, y, { size: 9, color: rojo });
  textoDerecha(formatMoney(er.totalGastos), xCategoria + 350, y, { f: bold, size: 9, color: rojo });
  texto("Utilidad neta", xCategoria + 380, y, { size: 9, color: er.utilidadNeta >= 0 ? teal : rojo });
  textoDerecha(formatMoney(er.utilidadNeta), xCategoria + 560, y, { f: bold, size: 9, color: er.utilidadNeta >= 0 ? teal : rojo });
  y -= 20;

  encabezadoTabla();

  filaSeccion("Ingresos");
  if (er.ingresos.length === 0) {
    texto("Sin ingresos categorizados en este año.", xCategoria + 4, y, { size: 8, color: gris });
    y -= 14;
  }
  for (const l of er.ingresos) filaLinea(l, teal);
  filaTotal("Total ingresos", er.totalIngresosPorMes, er.totalIngresos, tealOscuro);

  filaSeccion("Gastos");
  if (er.gastos.length === 0) {
    texto("Sin gastos categorizados en este año.", xCategoria + 4, y, { size: 8, color: gris });
    y -= 14;
  }
  for (const l of er.gastos) filaLinea(l, rojo);
  filaTotal("Total gastos", er.totalGastosPorMes, er.totalGastos, rojo);

  filaTotal("Utilidad neta", er.utilidadPorMes, er.utilidadNeta, er.utilidadNeta >= 0 ? tealOscuro : rojo);

  for (const p of pdf.getPages()) {
    const marca = "Generado con VICTOR CFO  ·  victorcfo.com";
    const size = 8;
    const w = font.widthOfTextAtSize(marca, size);
    p.drawText(marca, { x: (width - w) / 2, y: 18, size, font, color: gris });
  }

  const bytes = await pdf.save();
  const nombreArchivo = `${slugificar(entidad.name)}-estado-de-resultados-${anio}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}"`,
    },
  });
}
