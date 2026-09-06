import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { formatMoney, formatFecha, slugificar } from "@/lib/format";

// PDF del reporte de Gastos (5 sept 2026) — hasta ahora Gastos solo tenía
// un CSV crudo para mandarle al contable (ver /api/transacciones/exportar);
// Joel lo subió como ejemplo de "reporte que da pena" al lado del resto de
// la app, que sí se ve impecable. Este PDF es el mismo tratamiento visual
// que /api/facturas/reportes/pdf: header con nombre de la entidad, resumen,
// tablas por categoría con línea de Anejo M/Schedule C, y marca VICTOR CFO
// al pie de cada página.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const entityId = searchParams.get("entityId");

  if (entityId) {
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!entidad) {
      return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });
    }
  }

  let query = supabase
    .from("transactions")
    .select("fecha, description_raw, amount, hacienda_category_id, tipo_flujo")
    .eq("owner_id", user.id)
    .eq("es_duplicada", false)
    .order("fecha", { ascending: true });
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);

  const { data: transacciones, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: categorias } = await supabase
    .from("hacienda_categories")
    .select("id, nombre, linea_anejo_m, linea_schedule_c");
  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c]));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";

  const filas = (transacciones ?? []).map((t) => {
    const cat = t.hacienda_category_id ? categoriaPorId.get(t.hacienda_category_id) : null;
    const tipo = t.tipo_flujo ?? (Number(t.amount) > 0 ? "gasto" : "ingreso");
    return {
      fecha: t.fecha as string,
      descripcion: t.description_raw as string,
      nombreCategoria: cat?.nombre ?? "Sin categorizar",
      linea: cat ? cat.linea_anejo_m || cat.linea_schedule_c || "" : "",
      tipo,
      monto: Math.abs(Number(t.amount)),
    };
  });

  const totalGasto = filas.filter((f) => f.tipo === "gasto").reduce((s, f) => s + f.monto, 0);
  const totalIngreso = filas.filter((f) => f.tipo === "ingreso").reduce((s, f) => s + f.monto, 0);
  const totalTransferencia = filas.filter((f) => f.tipo === "transferencia").reduce((s, f) => s + f.monto, 0);
  const neto = totalIngreso - totalGasto;

  function agruparPorCategoria(tipo: string) {
    const mapa = new Map<string, { nombre: string; linea: string; total: number; count: number }>();
    for (const f of filas) {
      if (f.tipo !== tipo) continue;
      const actual = mapa.get(f.nombreCategoria) ?? { nombre: f.nombreCategoria, linea: f.linea, total: 0, count: 0 };
      actual.total += f.monto;
      actual.count += 1;
      mapa.set(f.nombreCategoria, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }
  const gastosPorCategoria = agruparPorCategoria("gasto");
  const ingresosPorCategoria = agruparPorCategoria("ingreso");

  const topGastos = [...filas].filter((f) => f.tipo === "gasto").sort((a, b) => b.monto - a.monto).slice(0, 15);

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo de la entidad (pedido de Joel, 5 sept 2026: "el logo de la entidad
  // también, como la factura") — mismo patrón que app/api/facturas/[id]/pdf.
  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad?.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(120 / logoImg.width, 44 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en el PDF de Gastos:", err);
    }
  }

  const margin = 50;
  const width = 612;
  const teal = rgb(0.114, 0.62, 0.459);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const rojo = rgb(0.83, 0.3, 0.24);
  const lineaGris = rgb(0.85, 0.85, 0.85);

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

  if (logoImg) {
    page.drawImage(logoImg, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  }
  const xTexto = logoImg ? margin + logoDims.width + 14 : margin;
  texto(nombreTitular, xTexto, y, { f: bold, size: 16 });
  y -= 18;
  texto("Reporte de Ingresos/Gastos", xTexto, y, { size: 11, color: gris });
  y -= 14;
  const periodoTexto = desde || hasta ? `Período: ${desde ? formatFecha(desde) : "inicio"} — ${hasta ? formatFecha(hasta) : "hoy"}` : "Período: historial completo";
  texto(periodoTexto, xTexto, y, { size: 9, color: gris });
  y -= 6;
  if (logoImg) y = Math.min(y, 792 - margin - logoDims.height - 6);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 24;

  encabezadoSeccion("Resumen");
  filaTabla("Ingresos", formatMoney(totalIngreso), { color: teal });
  filaTabla("Gastos", formatMoney(totalGasto), { color: rojo });
  if (totalTransferencia > 0) filaTabla("Transferencias internas (no afectan neto)", formatMoney(totalTransferencia), { color: gris });
  filaTabla("Neto (ingresos - gastos)", formatMoney(neto), { bold: true, color: neto >= 0 ? teal : rojo });

  encabezadoSeccion("Gastos deducibles por categoría");
  if (gastosPorCategoria.length === 0) filaTabla("No hay gastos en este período.", "");
  for (const c of gastosPorCategoria) {
    filaTabla(`${c.nombre}${c.linea ? ` — ${c.linea}` : ""} (${c.count})`, formatMoney(c.total));
  }
  if (gastosPorCategoria.length > 0) {
    espacio(40);
    y -= 4;
    page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.75, color: lineaGris });
    filaTabla("Total gastos", formatMoney(totalGasto), { bold: true, color: rojo });
  }

  if (ingresosPorCategoria.length > 0) {
    encabezadoSeccion("Ingresos por categoría");
    for (const c of ingresosPorCategoria) {
      filaTabla(`${c.nombre} (${c.count})`, formatMoney(c.total));
    }
  }

  encabezadoSeccion("Top 15 gastos individuales");
  if (topGastos.length === 0) filaTabla("No hay gastos en este período.", "");
  for (const g of topGastos) {
    filaTabla(`${formatFecha(g.fecha)} — ${g.descripcion.slice(0, 45)}`, formatMoney(g.monto));
  }

  // Marca al pie de cada página (pedido de Joel, 5 sept 2026: "ponle la
  // marca de Victor para que el que vea el reporte bonito lo quiera").
  for (const p of pdf.getPages()) {
    const marca = "Generado con VICTOR CFO  ·  victorcfo.com";
    const size = 8;
    const w = font.widthOfTextAtSize(marca, size);
    p.drawText(marca, { x: (width - w) / 2, y: 24, size, font, color: gris });
  }

  const bytes = await pdf.save();
  const nombreArchivo = `${slugificar(nombreTitular)}-gastos${desde ? `_${desde}` : ""}${hasta ? `_a_${hasta}` : ""}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}"`,
    },
  });
}
