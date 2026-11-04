import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { calcularEstadoResultados } from "@/lib/estado-resultados";
import { calcularSeTax } from "@/lib/impuestos-estimados";
import { formatMoney, slugificar } from "@/lib/format";

export const runtime = "nodejs";

// Hoja de datos "Ganancia neta anual y self-employment" (4 nov 2026).
// Pedido de Joel: que el contable tenga a la mano lo que necesita para la
// planilla federal de seguro social de quien trabaja por cuenta propia
// (Anejo SE / Formulario 1040-SS para residentes de PR): ingresos, gastos
// por categoría, ganancia neta, base sujeta a self-employment y el cálculo
// del 15.3%. Reutiliza calcularEstadoResultados (mismas cifras que el Estado
// de Resultados) y calcularSeTax con los parámetros del año de tax_params.
// NO es un formulario oficial y no asigna números de línea: el contable
// valida y transcribe.
//
//   GET ?entityId=… | ?ownerId=…  &anio=2026  &formato=pdf|csv
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const entityId = p.get("entityId");
  const ownerParam = p.get("ownerId");
  const anio = Number(p.get("anio")) || new Date().getFullYear();
  const formato = p.get("formato") === "csv" ? "csv" : "pdf";
  if (!entityId && !ownerParam) return NextResponse.json({ error: "Falta entityId u ownerId." }, { status: 400 });

  // Misma resolución que el Estado de Resultados: RLS decide dueño vs contable con permiso.
  let entidad: { name: string; logo_r2_key: string | null; owner_id: string } | null = null;
  if (entityId) {
    const { data } = await supabase.from("business_entities").select("id, name, logo_r2_key, owner_id").eq("id", entityId).maybeSingle();
    entidad = data ? { name: data.name, logo_r2_key: data.logo_r2_key ?? null, owner_id: data.owner_id } : null;
  } else {
    const { data: u } = await supabase.from("users").select("id, full_name, email").eq("id", ownerParam!).maybeSingle();
    entidad = u ? { name: `${u.full_name || u.email || "Cliente"} — Personal`, logo_r2_key: null, owner_id: u.id } : null;
  }
  if (!entidad) return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });

  const er = await calcularEstadoResultados(supabase, { ownerId: entidad.owner_id, entityId: entityId ?? null, anio });

  // Parámetros federales del año (el más reciente <= anio gana, clave por clave).
  const { data: filas } = await supabase.from("tax_params").select("anio, clave, valor").eq("jurisdiccion", "federal").lte("anio", anio).order("anio", { ascending: true });
  const params: Record<string, number> = {};
  for (const f of (filas ?? []) as { anio: number; clave: string; valor: number | string }[]) params[f.clave] = Number(f.valor);

  const neta = Math.max(0, er.utilidadNeta);
  const factor = params.se_factor_neto ?? 0.9235;
  const baseSE = neta * factor;
  const tope = params.ss_wage_base ?? 184500;
  const minimo = params.se_minimo ?? 400;
  const aplica = baseSE >= minimo;
  const ss = aplica ? (params.se_tasa_seguro_social ?? 0.124) * Math.min(baseSE, tope) : 0;
  const medicare = aplica ? (params.se_tasa_medicare ?? 0.029) * baseSE : 0;
  const { seTax, mitad } = calcularSeTax(neta, params);
  const tieneParams = (filas ?? []).length > 0;

  const archivoBase = `ganancia-neta-se-${slugificar(entidad.name)}-${anio}`;

  if (formato === "csv") {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lineas: (string | number)[][] = [
      ["Ganancia neta anual y self-employment", entidad.name, anio],
      [],
      ["Ingresos por categoría"],
      ...er.ingresos.map((l) => [l.nombre, l.total.toFixed(2)]),
      ["Total ingresos", er.totalIngresos.toFixed(2)],
      [],
      ["Gastos por categoría", "Línea Schedule C (referencia)"],
      ...er.gastos.map((l) => [l.nombre, l.total.toFixed(2), l.lineaScheduleC ?? ""]),
      ["Total gastos", er.totalGastos.toFixed(2)],
      [],
      ["Ganancia neta", er.utilidadNeta.toFixed(2)],
      [`Base sujeta a self-employment (${(factor * 100).toFixed(2)}% de la ganancia neta)`, baseSE.toFixed(2)],
      ["Seguro Social (12.4% hasta el tope)", ss.toFixed(2)],
      ["Medicare (2.9%)", medicare.toFixed(2)],
      ["Self-employment tax total", seTax.toFixed(2)],
      ["Mitad deducible del self-employment tax", mitad.toFixed(2)],
    ];
    const csv = "﻿" + lineas.map((f) => f.map(q).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${archivoBase}.csv"` },
    });
  }

  // ---------------- PDF (carta, vertical) ----------------
  const pdf = await PDFDocument.create();
  const width = 612;
  const height = 792;
  let page = pdf.addPage([width, height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const teal = rgb(0.114, 0.62, 0.459);
  const tealOscuro = rgb(0.059, 0.42, 0.306);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const rojo = rgb(0.83, 0.3, 0.24);
  let y = height - margin;

  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(110 / logoImg.width, 40 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en la hoja de self-employment:", err);
    }
  }

  // Las fuentes estándar de pdf-lib solo codifican WinAnsi: cualquier otro carácter
  // (p. ej. un nombre de categoría con símbolos raros) tumbaría todo el PDF con un 500.
  const seguro = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018-\u201E\u2022\u2026]/g, "?");
  const txt = (s0: string, x: number, yy: number, o: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(seguro(s0), { x, y: yy, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? negro });
  const der = (s0: string, xd: number, yy: number, o: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const s = seguro(s0);
    const f = o.f ?? font; const size = o.size ?? 10;
    page.drawText(s, { x: xd - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: o.color ?? negro });
  };
  const xR = width - margin;
  const salto = (min = 70) => { if (y < min) { page = pdf.addPage([width, height]); y = height - margin; } };
  const seccion = (t: string) => { salto(110); y -= 6; txt(t.toUpperCase(), margin, y, { f: bold, size: 9, color: gris }); y -= 4; page.drawLine({ start: { x: margin, y }, end: { x: xR, y }, thickness: 0.5, color: gris }); y -= 14; };
  const fila = (a: string, v: number, o: { negrita?: boolean; color?: ReturnType<typeof rgb>; nota?: string } = {}) => {
    salto();
    txt(a.slice(0, 70), margin + 4, y, { f: o.negrita ? bold : font, color: o.color });
    if (o.nota) txt(o.nota, margin + 330, y, { size: 8, color: gris });
    der(formatMoney(v), xR, y, { f: o.negrita ? bold : font, color: o.color });
    y -= 15;
  };

  if (logoImg) page.drawImage(logoImg, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  const xT = logoImg ? margin + logoDims.width + 14 : margin;
  txt(entidad.name, xT, y - 4, { f: bold, size: 15 });
  txt("Ganancia neta y self-employment", xT, y - 20, { size: 10.5, color: gris });
  txt(`Año ${anio}  ·  Hoja de datos para el contable`, xT, y - 34, { size: 8.5, color: gris });
  y -= Math.max(logoDims.height, 40) + 10;
  page.drawLine({ start: { x: margin, y }, end: { x: xR, y }, thickness: 1.5, color: teal });
  y -= 18;

  seccion("Ingresos");
  if (er.ingresos.length === 0) { txt("Sin ingresos categorizados en este año.", margin + 4, y, { size: 9, color: gris }); y -= 15; }
  for (const l of er.ingresos) fila(l.nombre, l.total);
  fila("Total ingresos", er.totalIngresos, { negrita: true, color: tealOscuro });

  seccion("Gastos por categoría");
  if (er.gastos.length === 0) { txt("Sin gastos categorizados en este año.", margin + 4, y, { size: 9, color: gris }); y -= 15; }
  for (const l of er.gastos) fila(l.nombre, l.total, { nota: l.lineaScheduleC ? `Sched. C ${l.lineaScheduleC}` : undefined });
  fila("Total gastos", er.totalGastos, { negrita: true, color: rojo });

  seccion("Ganancia neta");
  fila("Ganancia neta del año (ingresos menos gastos)", er.utilidadNeta, { negrita: true, color: er.utilidadNeta >= 0 ? tealOscuro : rojo });

  seccion("Self-employment (Seguro Social y Medicare)");
  if (!tieneParams) {
    txt("No hay parámetros de impuestos cargados para este año; el cálculo no está disponible.", margin + 4, y, { size: 9, color: rojo });
    y -= 15;
  } else {
    fila(`Base sujeta a self-employment (${(factor * 100).toFixed(2)}% de la ganancia neta)`, baseSE);
    fila(`Seguro Social (12.4% hasta ${formatMoney(tope, 0)})`, ss);
    fila("Medicare (2.9%)", medicare);
    fila("Self-employment tax total", seTax, { negrita: true, color: tealOscuro });
    fila("Mitad deducible del self-employment tax", mitad);
    if (!aplica) { txt(`La base es menor de ${formatMoney(minimo, 0)}: normalmente no se paga self-employment.`, margin + 4, y, { size: 8.5, color: gris }); y -= 14; }
  }

  salto(150);
  y -= 10;
  const notas = [
    "Resumen preparado con las transacciones categorizadas en VICTOR CFO (sin transferencias ni duplicados). No es un formulario oficial.",
    "Aplica a quien trabaja por cuenta propia (dueño único o LLC de un miembro). Residentes bona fide de Puerto Rico informan el self-employment en el Formulario 1040-SS; otros contribuyentes, en el Anejo SE.",
    "El contable debe validar las cifras, la base y la elegibilidad antes de radicar. Las líneas de Schedule C son solo referencia.",
  ];
  for (const n of notas) {
    const palabras = n.split(" ");
    let linea = "";
    for (const w of palabras) {
      if (font.widthOfTextAtSize(linea + " " + w, 8) > width - margin * 2) { txt(linea.trim(), margin, y, { size: 8, color: gris }); y -= 11; linea = w; } else linea += " " + w;
    }
    if (linea.trim()) { txt(linea.trim(), margin, y, { size: 8, color: gris }); y -= 15; }
    salto(60);
  }

  for (const pg of pdf.getPages()) {
    pg.drawText("Generado con VICTOR CFO  ·  victorcfo.com", { x: margin, y: 24, size: 8, font, color: gris });
  }
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${archivoBase}.pdf"` },
  });
}
