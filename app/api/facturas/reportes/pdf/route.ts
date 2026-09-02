import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatFecha } from "@/lib/format";

// PDF del reporte de Facturación (2 sept 2026) — a diferencia del CSV (que
// exporta la tabla exacta de la "vista" activa), este PDF es un resumen fijo
// y completo — Resumen + Por cliente + Por servicio + Retenciones SURI —
// pensado para mandarle un solo documento al CPA sin importar qué vista
// tenía Joel abierta en pantalla al pedirlo.
function estaVencida(estado: string, fechaVencimiento: string | null): boolean {
  return estado !== "pagada" && estado !== "borrador" && !!fechaVencimiento && fechaVencimiento < new Date().toISOString().slice(0, 10);
}
function estadoMostrado(estado: string, fechaVencimiento: string | null): string {
  if (estado === "pagada" || estado === "borrador") return estado;
  return estaVencida(estado, fechaVencimiento) ? "vencida" : estado;
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
  const desde = searchParams.get("desde") || "0000-01-01";
  const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10);
  const clienteId = searchParams.get("clienteId");
  const estadoFiltro = searchParams.get("estado");
  const email = searchParams.get("email");
  const entityId = searchParams.get("entityId");

  let facturasQuery = supabase
    .from("invoices")
    .select("id, total, retencion_pct, retencion_monto, estado, fecha_emision, fecha_vencimiento, client_id, clients(name, email)")
    .eq("owner_id", user.id)
    .neq("estado", "borrador")
    .gte("fecha_emision", desde)
    .lte("fecha_emision", hasta);
  if (clienteId) facturasQuery = facturasQuery.eq("client_id", clienteId);
  if (entityId) facturasQuery = facturasQuery.eq("entity_id", entityId);

  const { data: facturasData } = await facturasQuery;
  let facturas = (facturasData ?? []) as any[];
  if (estadoFiltro) facturas = facturas.filter((f) => estadoMostrado(f.estado, f.fecha_vencimiento) === estadoFiltro);
  if (email) facturas = facturas.filter((f) => (f.clients?.email ?? "").toLowerCase().includes(email.toLowerCase()));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };

  const totalFacturado = facturas.reduce((s, f) => s + Number(f.total), 0);
  const facturasPagadas = facturas.filter((f) => f.estado === "pagada");
  const totalCobrado = facturasPagadas.reduce((s, f) => s + Number(f.total), 0);
  const totalPendiente = facturas.filter((f) => f.estado !== "pagada").reduce((s, f) => s + Number(f.total), 0);
  const tasaCobro = totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0;

  const porCliente = (() => {
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturas) {
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.total);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    return [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
  })();

  const porRetencion = (() => {
    const mapa = new Map<string, { nombre: string; retenido: number; pct: number; count: number }>();
    for (const f of facturas) {
      if (f.estado !== "pagada") continue;
      const monto = Number(f.retencion_monto || 0);
      if (monto <= 0) continue;
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, retenido: 0, pct: Number(f.retencion_pct || 0), count: 0 };
      actual.retenido += monto;
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    return [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
  })();
  const totalRetenido = porRetencion.reduce((s, c) => s + c.retenido, 0);

  const { data: itemsData } = facturas.length
    ? await supabase
        .from("invoice_items")
        .select("invoice_id, descripcion, service_id, subtotal_linea, cantidad, precio_unitario, services(nombre)")
        .in("invoice_id", facturas.map((f) => f.id))
    : { data: [] };

  const porServicio = (() => {
    const mapa = new Map<string, { nombre: string; total: number; count: number }>();
    for (const it of itemsData ?? []) {
      const key = (it as any).service_id ?? `desc:${(it as any).descripcion}`;
      const nombre = (it as any).services?.nombre ?? (it as any).descripcion;
      const total = Number((it as any).subtotal_linea ?? (it as any).cantidad * (it as any).precio_unitario);
      const actual = mapa.get(key) ?? { nombre, total: 0, count: 0 };
      actual.total += total;
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 15);
  })();

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
  texto("Reporte de Facturación", margin, y, { size: 11, color: gris });
  y -= 14;
  texto(`Período: ${formatFecha(desde)} — ${formatFecha(hasta)}`, margin, y, { size: 9, color: gris });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 24;

  encabezadoSeccion("Resumen");
  filaTabla("Facturado", formatMoney(totalFacturado));
  filaTabla("Cobrado", formatMoney(totalCobrado), { color: teal });
  filaTabla("Pendiente", formatMoney(totalPendiente), { color: rgb(0.83, 0.62, 0.05) });
  filaTabla("Tasa de cobro", `${tasaCobro}%`, { bold: true, color: teal });

  encabezadoSeccion("Por cliente");
  if (porCliente.length === 0) filaTabla("No hay facturas en este período.", "");
  for (const c of porCliente) {
    filaTabla(`${c.nombre} (${c.count})`, formatMoney(c.facturado));
  }

  encabezadoSeccion("Por servicio (top 15)");
  if (porServicio.length === 0) filaTabla("No hay líneas de factura en este período.", "");
  for (const s of porServicio) {
    filaTabla(`${s.nombre} (${s.count})`, formatMoney(s.total));
  }

  encabezadoSeccion("Retenciones SURI");
  if (porRetencion.length === 0) {
    filaTabla("No hay retenciones en este período.", "");
  } else {
    for (const r of porRetencion) {
      filaTabla(`${r.nombre} — ${r.pct}%`, formatMoney(r.retenido));
    }
    espacio(40);
    y -= 4;
    page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.75, color: lineaGris });
    filaTabla("Total retenido (crédito en Hacienda)", formatMoney(totalRetenido), { bold: true, color: teal });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reporte-facturacion_${desde}_a_${hasta}.pdf"`,
    },
  });
}
