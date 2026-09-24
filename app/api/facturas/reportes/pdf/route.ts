import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { formatMoney, formatFecha, slugificar } from "@/lib/format";

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
  // "0001-01-01" y no "0000-01-01" (14 sept 2026, fix de raíz): Postgres
  // rechaza el año 0000 como fecha inválida — la query .gte("fecha_emision",
  // desde) fallaba en silencio para "Todo" y el PDF salía en $0 sin avisar
  // (no se revisaba el error de la query, ver abajo).
  const desde = searchParams.get("desde") || "0001-01-01";
  const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10);
  // getAll, no get (24 sept 2026, pedido de Joel: "si quiero agrupar más
  // clientes me deja también" — antes solo se podía filtrar por UN cliente
  // a la vez; ahora la pantalla manda ?clienteId=... repetido por cada uno
  // seleccionado, igual que FreshBooks permite marcar varios).
  const clienteIds = searchParams.getAll("clienteId");
  const estadoFiltro = searchParams.get("estado");
  const email = searchParams.get("email");
  const entityId = searchParams.get("entityId");

  let facturasQuery = supabase
    .from("invoices")
    .select(
      "id, numero, subtotal, total, retencion_pct, retencion_monto, estado, fecha_emision, fecha_vencimiento, metodo_pago, entity_id, client_id, clients(name, email)"
    )
    .eq("owner_id", user.id)
    .neq("estado", "borrador")
    .gte("fecha_emision", desde)
    .lte("fecha_emision", hasta);
  if (clienteIds.length > 0) facturasQuery = facturasQuery.in("client_id", clienteIds);
  if (entityId) facturasQuery = facturasQuery.eq("entity_id", entityId);

  const { data: facturasData, error: facturasError } = await facturasQuery;
  if (facturasError) return NextResponse.json({ error: facturasError.message }, { status: 500 });
  let facturas = (facturasData ?? []) as any[];
  if (estadoFiltro) facturas = facturas.filter((f) => estadoMostrado(f.estado, f.fecha_vencimiento) === estadoFiltro);
  if (email) facturas = facturas.filter((f) => (f.clients?.email ?? "").toLowerCase().includes(email.toLowerCase()));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";

  // pATH de ATH Móvil Business configurado, para el mismo gate de fee que
  // usa la pantalla (ver facturacion-portal.tsx: feeProcesamiento) — este
  // PDF es lo que Joel le manda al CPA, así que tiene que cuadrar con lo
  // que ve en pantalla, incluyendo el gasto de procesamiento y el ingreso
  // bruto real (subtotal, no total neto de retención).
  let entidadesQuery = supabase.from("business_entities").select("id, ath_movil_business_path").eq("owner_id", user.id);
  if (entityId) entidadesQuery = entidadesQuery.eq("id", entityId);
  const { data: entidadesData } = await entidadesQuery;
  const entidadesConAth = new Set((entidadesData ?? []).filter((e) => e.ath_movil_business_path).map((e) => e.id));

  const ATH_FEE_PCT = 0.0225;
  const ATH_FEE_MINIMO = 0.06;
  const STRIPE_FEE_PCT = 0.029;
  const STRIPE_FEE_FIJO = 0.3;
  function feeProcesamiento(f: any): number {
    if (f.metodo_pago === "ATH Móvil Business") {
      if (!f.entity_id || !entidadesConAth.has(f.entity_id)) return 0;
      return Math.max(Number(f.total) * ATH_FEE_PCT, ATH_FEE_MINIMO);
    }
    if (f.metodo_pago === "Tarjeta") return Number(f.total) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
    return 0;
  }

  // "Facturado" = ingreso bruto real (subtotal, antes de retención) — no
  // invoices.total, que ya viene neto de retención. Corrección pedida por
  // Joel (2 sept 2026): la retención y las comisiones de pasarela no
  // reducen las ventas brutas, solo el efectivo que llega al banco.
  const totalFacturado = facturas.reduce((s, f) => s + Number(f.subtotal), 0);
  const facturasPagadas = facturas.filter((f) => f.estado === "pagada");
  const totalCobrado = facturasPagadas.reduce((s, f) => s + Number(f.total), 0);
  const totalPendiente = facturas.filter((f) => f.estado !== "pagada").reduce((s, f) => s + Number(f.total), 0);
  const tasaCobro = totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0;
  const brutoCobrado = facturasPagadas.reduce((s, f) => s + Number(f.subtotal), 0);
  const gastoProcesamiento = facturasPagadas.reduce((s, f) => s + feeProcesamiento(f), 0);
  const depositoNetoBanco = totalCobrado - gastoProcesamiento;

  const porCliente = (() => {
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturas) {
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.subtotal);
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

  // Ventas por ítem (24 sept 2026, pedido de Joel: "no se que hicistes pero
  // no me sirve ese reporte, mira como lo hace freshbook" + "en ambos
  // reportes deben salir los items" + "me sigue gustando mas la opcion de
  // freshbook pq me pone la fecha... y esa categoria de Top 15 creo q no
  // debe existir"). Reemplaza el viejo resumen "Por servicio (top 15)":
  // ya NO colapsa a un total por servicio ni corta en 15 — lista cada línea
  // real de factura (cliente, factura #, fecha, precio unit., cantidad,
  // total), agrupada por servicio, igual que el Item Sales de FreshBooks y
  // que la vista "Ventas por ítem" en pantalla/Excel. Sin límite: si Joel
  // filtra a un cliente con 750 líneas, las 750 salen.
  const facturaPorId = new Map(facturas.map((f) => [f.id, f]));
  const ventasPorItem = (() => {
    const mapa = new Map<
      string,
      {
        nombre: string;
        total: number;
        unidades: number;
        filas: { cliente: string; numero: string; fecha: string; precioUnitario: number; cantidad: number; total: number }[];
      }
    >();
    for (const it of itemsData ?? []) {
      const key = (it as any).service_id ?? `desc:${(it as any).descripcion}`;
      const nombre = (it as any).services?.nombre ?? (it as any).descripcion;
      const total = Number((it as any).subtotal_linea ?? (it as any).cantidad * (it as any).precio_unitario);
      const f = facturaPorId.get((it as any).invoice_id);
      const actual = mapa.get(key) ?? {
        nombre,
        total: 0,
        unidades: 0,
        filas: [] as { cliente: string; numero: string; fecha: string; precioUnitario: number; cantidad: number; total: number }[],
      };
      actual.total += total;
      // unidades (24 sept 2026, pedido de Joel) — suma la columna cantidad
      // real de invoice_items, no el número de líneas: "(1)" antes era 1
      // LÍNEA, no las 22 unidades de CHRA que esa línea representaba.
      actual.unidades += Number((it as any).cantidad ?? 1);
      actual.filas.push({
        cliente: f?.clients?.name ?? "Sin cliente",
        numero: f?.numero ?? "",
        fecha: f?.fecha_emision ?? "",
        precioUnitario: Number((it as any).precio_unitario ?? 0),
        cantidad: Number((it as any).cantidad ?? 1),
        total,
      });
      mapa.set(key, actual);
    }
    const grupos = [...mapa.values()].sort((a, b) => b.total - a.total);
    for (const g of grupos) g.filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return grupos;
  })();

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo de la entidad (pedido de Joel, 5 sept 2026: "el logo de la entidad
  // también, como la factura") — mismo patrón que app/api/facturas/[id]/pdf:
  // si no hay logo subido, simplemente no se dibuja nada.
  let logoImg = null;
  let logoDims = { width: 0, height: 0 };
  if (entidad?.logo_r2_key) {
    try {
      const bytes = await descargarBytesR2(entidad.logo_r2_key);
      logoImg = entidad.logo_r2_key.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const escala = Math.min(120 / logoImg.width, 44 / logoImg.height, 1);
      logoDims = { width: logoImg.width * escala, height: logoImg.height * escala };
    } catch (err) {
      console.error("No se pudo incrustar el logo en el PDF de reportes:", err);
    }
  }

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

  if (logoImg) {
    page.drawImage(logoImg, { x: margin, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
  }
  const xTexto = logoImg ? margin + logoDims.width + 14 : margin;
  texto(nombreTitular, xTexto, y, { f: bold, size: 16 });
  y -= 18;
  texto("Reporte de Facturación", xTexto, y, { size: 11, color: gris });
  y -= 14;
  texto(`Período: ${formatFecha(desde)} — ${formatFecha(hasta)}`, xTexto, y, { size: 9, color: gris });
  y -= 6;
  if (logoImg) y = Math.min(y, 792 - margin - logoDims.height - 6);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 24;

  encabezadoSeccion("Resumen");
  filaTabla("Facturado (ingreso bruto)", formatMoney(totalFacturado));
  filaTabla("Cobrado", formatMoney(totalCobrado), { color: teal });
  filaTabla("Pendiente", formatMoney(totalPendiente), { color: rgb(0.83, 0.62, 0.05) });
  filaTabla("Tasa de cobro", `${tasaCobro}%`, { bold: true, color: teal });

  if (facturasPagadas.length > 0) {
    encabezadoSeccion("Cuadre de recaudo (facturas cobradas)");
    filaTabla("Facturación bruta cobrada", formatMoney(brutoCobrado));
    if (totalRetenido > 0) filaTabla("Retenciones en la fuente", `-${formatMoney(totalRetenido)}`, { color: rgb(0.83, 0.62, 0.05) });
    filaTabla("Recaudado (neto de retención)", formatMoney(totalCobrado));
    if (gastoProcesamiento > 0) filaTabla("Comisiones de pasarela (ATH/Stripe)", `-${formatMoney(gastoProcesamiento)}`, { color: rgb(0.83, 0.62, 0.05) });
    filaTabla("Depósito neto en banco", formatMoney(depositoNetoBanco), { bold: true, color: teal });
  }

  encabezadoSeccion("Resumen ejecutivo para planilla");
  filaTabla("Ingreso reportable (planilla)", formatMoney(totalFacturado), { bold: true });
  if (gastoProcesamiento > 0) filaTabla("Gasto deducible (merchant fees)", formatMoney(gastoProcesamiento), { color: rgb(0.83, 0.62, 0.05) });
  if (totalRetenido > 0) filaTabla("Crédito contributivo acumulado (SURI)", formatMoney(totalRetenido), { color: teal });

  encabezadoSeccion("Por cliente");
  if (porCliente.length === 0) filaTabla("No hay facturas en este período.", "");
  for (const c of porCliente) {
    filaTabla(`${c.nombre} (${c.count})`, formatMoney(c.facturado));
  }

  // "Ventas por ítem" con formato de tabla real (24 sept 2026, pedido de
  // Joel: "puedes hacerlo asi como freshbook con sus titulos lineas y todo
  // separadito bonito?" — mandó el PDF "Item Sales" de FreshBooks como
  // referencia). Calca esa estructura: resumen arriba (Total unidades /
  // Total ventas), luego una tabla por servicio con encabezado de columnas
  // (Cliente, Factura #, Fecha, Precio unit., Cant., Total), líneas con
  // separador fino, y fila "Total" en negrita al cierre de cada tabla.
  // Columnas (24 sept 2026, ajuste pedido por Joel: "en nombres largos
  // freshbook lo pone en 2 lineas... tiene bastante espacio entre Cant y
  // total" — con un nombre largo como "Oficina Médica Dr. Emmanuel Serrano"
  // el nombre se cortaba con "…" y a la derecha sobraba espacio en blanco
  // entre Cant. y Total). Cliente ahora tiene casi el doble de ancho
  // (145pt → 200pt) y el resto de columnas se recorrieron hacia la
  // izquierda para llenar ese espacio sobrante; además, si el nombre igual
  // no cabe en una línea, se parte en 2 (como FreshBooks) en vez de
  // truncarse con "…".
  const xCliente = margin;
  const xFactura = margin + 200;
  const xFecha = margin + 255;
  const xCostoDer = margin + 365;
  const xCantDer = margin + 410;
  const xTotalDer = width - margin;
  const anchoCliente = xFactura - xCliente - 10;

  // Envuelve un texto en hasta 2 líneas que quepan en `anchoMax` — si aun
  // así no cabe, trunca la 2da línea con "…" (nunca más de 2 líneas, para
  // no descuadrar la altura de la fila con casos extremos).
  function envolverTexto(contenido: string, anchoMax: number, f: typeof font, size: number): string[] {
    const palabras = contenido.split(" ");
    const lineas: string[] = [];
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (f.widthOfTextAtSize(prueba, size) <= anchoMax || !actual) {
        actual = prueba;
      } else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    if (actual) lineas.push(actual);
    if (lineas.length > 2) {
      let segunda = lineas[1];
      while (f.widthOfTextAtSize(segunda + "…", size) > anchoMax && segunda.length > 1) {
        segunda = segunda.slice(0, -1);
      }
      return [lineas[0], segunda + "…"];
    }
    return lineas;
  }

  function encabezadoTablaItems() {
    espacio(60);
    texto("Cliente", xCliente, y, { f: bold, size: 8, color: gris });
    texto("Factura #", xFactura, y, { f: bold, size: 8, color: gris });
    texto("Fecha", xFecha, y, { f: bold, size: 8, color: gris });
    textoDerecha("Precio unit.", xCostoDer, y, { f: bold, size: 8, color: gris });
    textoDerecha("Cant.", xCantDer, y, { f: bold, size: 8, color: gris });
    textoDerecha("Total", xTotalDer, y, { f: bold, size: 8, color: gris });
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: lineaGris });
    y -= 12;
  }

  encabezadoSeccion("Ventas por ítem");
  if (ventasPorItem.length === 0) {
    filaTabla("No hay líneas de factura en este período.", "");
  } else {
    const totalUnidadesItem = ventasPorItem.reduce((s, g) => s + g.unidades, 0);
    const totalVentasItem = ventasPorItem.reduce((s, g) => s + g.total, 0);
    filaTabla("Total unidades", String(totalUnidadesItem), { bold: true });
    filaTabla("Total ventas por ítem", formatMoney(totalVentasItem), { bold: true, color: teal });
    y -= 8;

    for (const g of ventasPorItem) {
      espacio(90);
      y -= 6;
      texto(g.nombre, margin, y, { f: bold, size: 12, color: teal });
      y -= 5;
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.25, color: teal });
      y -= 14;

      encabezadoTablaItems();
      for (const fila of g.filas) {
        const lineasCliente = envolverTexto(fila.cliente, anchoCliente, font, 8.5);
        const altoFila = lineasCliente.length > 1 ? 21 : 11.5;
        espacio(34 + (altoFila - 11.5));
        lineasCliente.forEach((linea, i) => texto(linea, xCliente, y - i * 9.5, { size: 8.5 }));
        texto(fila.numero ? `#${fila.numero}` : "—", xFactura, y, { size: 8.5, color: teal });
        texto(fila.fecha ? formatFecha(fila.fecha) : "", xFecha, y, { size: 8.5, color: gris });
        textoDerecha(formatMoney(fila.precioUnitario), xCostoDer, y, { size: 8.5 });
        textoDerecha(String(fila.cantidad), xCantDer, y, { size: 8.5 });
        textoDerecha(formatMoney(fila.total), xTotalDer, y, { size: 8.5 });
        y -= altoFila;
      }

      espacio(35);
      y -= 2;
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: lineaGris });
      y -= 13;
      texto("Total", xCliente, y, { f: bold, size: 9 });
      textoDerecha(String(g.unidades), xCantDer, y, { f: bold, size: 9 });
      textoDerecha(formatMoney(g.total), xTotalDer, y, { f: bold, size: 9, color: teal });
      y -= 22;
    }
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

  // Marca al pie de cada página (pedido de Joel, 5 sept 2026: "ponle la
  // marca de Victor para que el que vea el reporte bonito lo quiera") —
  // este PDF es lo que Joel le manda a clientes/CPA, así que es el mejor
  // vehículo de marca que tiene la app.
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
      "Content-Disposition": `inline; filename="${slugificar(nombreTitular)}-facturacion_${desde}_a_${hasta}.pdf"`,
    },
  });
}
