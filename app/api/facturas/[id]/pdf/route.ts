import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarBytesR2 } from "@/lib/r2";
import { formatMoney, formatFecha } from "@/lib/format";

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
      "id, owner_id, numero, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, deposito_monto, estado, fecha_emision, fecha_vencimiento, metodo_pago, fecha_pago, notas, metodos_cobro_aceptados, clients(name, email, telefono, tax_id), business_entities(name, ein, municipio, phone, address, zip, invoice_footer, logo_r2_key, ivu_applies, brand_color)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("descripcion, detalle, cantidad, precio_unitario, subtotal_linea")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  const { data: owner } = await supabase.from("users").select("full_name").eq("id", (factura as any).owner_id).maybeSingle();

  const cliente = (factura as any).clients as { name: string; email: string | null; telefono: string | null; tax_id: string | null } | null;
  const entidad = (factura as any).business_entities as {
    name: string;
    ein: string | null;
    municipio: string | null;
    phone: string | null;
    address: string | null;
    zip: string | null;
    invoice_footer: string | null;
    logo_r2_key: string | null;
    ivu_applies: boolean;
    brand_color: string | null;
  } | null;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // carta
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo del negocio (opcional) — si todavía no lo ha subido, simplemente
  // no se dibuja nada y el encabezado se queda como estaba.
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

  const teal = rgb(0.114, 0.62, 0.459); // #1D9E75
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);

  // Color de marca de la entidad (pedido de Joel, 1 sept 2026): la línea del
  // encabezado y los totales van en el color que el negocio escogió para
  // que la factura vaya acorde con su logo, en vez del verde de VICTOR
  // siempre por default. Si no configuró nada, cae en el mismo verde.
  function hexToRgb(hex: string | null | undefined): ReturnType<typeof rgb> {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return teal;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
  }
  const marca = hexToRgb(entidad?.brand_color);

  // Parte un texto largo en líneas que quepan dentro de anchoMax, para las
  // notas — que ahora pueden ser bastante más largas que el resumen de una
  // sola línea que había antes.
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
    return lineas.slice(0, 6); // tope razonable para que no se salga de la página
  }

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

  // Dibuja varios segmentos con distinta fuente (bold/normal) pegados uno
  // detrás del otro en UNA sola línea, alineados a la derecha en conjunto —
  // para el mensaje de agradecimiento fijo, que necesita la primera frase en
  // bold y el resto en texto normal sin partirse en dos líneas (pedido de
  // Joel, 1 sept 2026).
  function textoDerechaMixto(segmentos: { texto: string; f: typeof font; color?: ReturnType<typeof rgb> }[], xDerecha: number, yPos: number, size: number) {
    const anchoTotal = segmentos.reduce((acc, s) => acc + s.f.widthOfTextAtSize(s.texto, size), 0);
    let x = xDerecha - anchoTotal;
    for (const s of segmentos) {
      page.drawText(s.texto, { x, y: yPos, size, font: s.f, color: s.color ?? negro });
      x += s.f.widthOfTextAtSize(s.texto, size);
    }
  }

  // pdf-lib no trae un helper de "link clickeable" — se arma a mano como
  // anotación tipo Link con acción URI, y se agrega al arreglo Annots de
  // la página (pedido de Joel: la marca de VICTOR CFO debe llevar a
  // victorcfo.com al tocarla, 1 sept 2026).
  function agregarLinkPDF(x: number, y: number, w: number, h: number, url: string) {
    const anotacion = pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [x, y, x + w, y + h],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "URI",
          URI: PDFString.of(url),
        },
      })
    );
    const anotsExistentes = page.node.Annots();
    if (anotsExistentes) {
      anotsExistentes.push(anotacion);
    } else {
      page.node.set(PDFName.of("Annots"), pdf.context.obj([anotacion]));
    }
  }

  // --- Encabezado estilo FreshBooks (pedido de Joel, 1 sept 2026): logo +
  // negocio arriba a la derecha (sin nombre personal ni EIN — eso también
  // lo pidió quitar), línea de color debajo, y una fila con el cliente a la
  // izquierda y el número de factura + fechas + el total bien grande a la
  // derecha, calcando el peso visual que le da FreshBooks al "Amount Due".
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

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: marca });
  y -= 26;

  const yFila = y;
  texto("FACTURAR A", margin, yFila, { f: bold, size: 8, color: gris });
  textoDerecha("FACTURA #", width - margin, yFila, { f: bold, size: 8, color: gris });

  let yIzq = yFila - 14;
  texto(cliente?.name ?? "Sin cliente", margin, yIzq, { f: bold, size: 12 });
  let yDer = yFila - 14;
  textoDerecha(factura.numero, width - margin, yDer, { f: bold, size: 12 });

  yIzq -= 14;
  if (cliente?.email) {
    texto(cliente.email, margin, yIzq, { size: 9, color: gris });
    yIzq -= 12;
  }
  if (cliente?.telefono) {
    texto(cliente.telefono, margin, yIzq, { size: 9, color: gris });
    yIzq -= 12;
  }
  if (cliente?.tax_id) {
    texto(`RUC: ${cliente.tax_id}`, margin, yIzq, { size: 9, color: gris });
    yIzq -= 12;
  }

  yDer -= 14;
  textoDerecha(`Emitida: ${formatFecha(factura.fecha_emision)}`, width - margin, yDer, { size: 9, color: gris });
  yDer -= 12;
  if (factura.fecha_vencimiento) {
    textoDerecha(`Vence: ${formatFecha(factura.fecha_vencimiento)}`, width - margin, yDer, { size: 9, color: gris });
    yDer -= 12;
  }
  // Factura pagada (2 sept 2026, pedido de Joel, calcado de FreshBooks): el
  // número grande del encabezado pasa a mostrar el BALANCE real ($0.00, ya
  // no queda nada por cobrar) en vez de seguir mostrando el total original
  // como si todavía se debiera — eso confundía. La ruptura de depósito solo
  // aplica mientras la factura sigue sin pagar del todo.
  const estaPagada = factura.estado === "pagada";
  const tieneDeposito = !estaPagada && Number(factura.deposito_monto) > 0;
  yDer -= 8;
  textoDerecha(estaPagada ? "PAGADA — BALANCE" : tieneDeposito ? "BALANCE A PAGAR" : "TOTAL A PAGAR", width - margin, yDer, {
    f: bold,
    size: 8,
    color: gris,
  });
  yDer -= 22;
  textoDerecha(
    formatMoney(estaPagada ? 0 : tieneDeposito ? Number(factura.total) - Number(factura.deposito_monto) : Number(factura.total)),
    width - margin,
    yDer,
    { f: bold, size: 22, color: estaPagada ? teal : marca }
  );
  if (estaPagada && factura.metodo_pago) {
    yDer -= 14;
    textoDerecha(
      `Pagada vía ${factura.metodo_pago}${factura.fecha_pago ? ` — ${formatFecha(factura.fecha_pago)}` : ""}`,
      width - margin,
      yDer,
      { size: 9, color: gris }
    );
  }

  y = Math.min(yIzq, yDer) - 20;

  // --- Tabla de líneas (orden Descripción / Precio / Cant. / Subtotal, como FreshBooks) ---
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
    // Descripción corta debajo del nombre, en gris — calcado de FreshBooks
    // (Invoice 0001540.pdf, ej. "AHA" / "Annual evaluation"), pedido de
    // Joel el 1 sept 2026. Cada renglón crece si tiene descripción.
    if (it.detalle) {
      texto(String(it.detalle).slice(0, 60), colDesc + 5, y - 11, { size: 8, color: gris });
      y -= 29;
    } else {
      y -= 18;
    }
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 0.5, color: lineaGris });
  }

  y -= 10;

  // --- Totales ---
  const filaTotales = (label: string, valor: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    texto(label, colPrecio - 10, y, { size: 10, color: opts.color ?? gris, f: opts.bold ? bold : font });
    textoDerecha(valor, colSubtotal - 5, y, { size: 10, color: opts.color ?? negro, f: opts.bold ? bold : font });
    y -= 16;
  };

  filaTotales("Subtotal", formatMoney(Number(factura.subtotal)));
  // Siempre visible si la entidad cobra IVU, igual que FreshBooks siempre
  // muestra "Tax" aunque sea $0.00 (pedido de Joel, 1 sept 2026).
  if (entidad?.ivu_applies) {
    filaTotales(`IVU (${factura.ivu_pct}%)`, `+${formatMoney(Number(factura.ivu_monto))}`);
  }
  if (Number(factura.retencion_pct) > 0) {
    filaTotales(`Retención (${factura.retencion_pct}%)`, `-${formatMoney(Number(factura.retencion_monto))}`);
  }
  page.drawLine({ start: { x: colPrecio - 10, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
  y -= 4;
  filaTotales("TOTAL", formatMoney(Number(factura.total)), { bold: true, color: marca });

  if (estaPagada) {
    // Factura pagada (2 sept 2026, pedido de Joel, calcado de FreshBooks):
    // en vez de la ruptura de depósito, se muestra lo que de verdad importa
    // una vez cobrada — cuánto se pagó y que el balance quedó en $0.00.
    filaTotales("Monto pagado", formatMoney(Number(factura.total)), { color: teal });
    page.drawLine({ start: { x: colPrecio - 10, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
    y -= 4;
    filaTotales("BALANCE", formatMoney(0), { bold: true, color: teal });
  } else if (Number(factura.deposito_monto) > 0) {
    // Depósito ya recibido (2 sept 2026, pedido de Joel) — se resta del
    // total para mostrar el balance real pendiente de cobro, mientras la
    // factura sigue sin pagarse del todo.
    filaTotales("Depósito recibido", `-${formatMoney(Number(factura.deposito_monto))}`);
    page.drawLine({ start: { x: colPrecio - 10, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 1, color: lineaGris });
    y -= 4;
    filaTotales("BALANCE A PAGAR", formatMoney(Number(factura.total) - Number(factura.deposito_monto)), { bold: true, color: marca });
  }

  y -= 15;

  if (factura.notas) {
    const notaTexto = String(factura.notas).slice(0, 220);
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
    texto("NOTAS PARA EL CLIENTE", margin + 10, y, { f: bold, size: 7, color: teal });
    y -= 13;
    for (const linea of lineas) {
      texto(linea, margin + 10, y, { size: 9, color: negro });
      y -= 12;
    }
    y -= 14;
  }

  if (factura.metodos_cobro_aceptados && factura.metodos_cobro_aceptados.length > 0) {
    texto(`Métodos de cobro aceptados: ${factura.metodos_cobro_aceptados.join(", ")}`, margin, y, { size: 8, color: gris });
    y -= 14;
  }

  // El pie de factura va anclado abajo (pedido de Joel) — no donde termine
  // de fluir el resto del contenido, así siempre queda en el mismo sitio sin
  // importar cuántas líneas tenga la factura arriba. Antes se mostraba
  // SIEMPRE el mensaje genérico "¡Gracias por su preferencia!" además del
  // pie personalizado de la entidad, lo que salía como 2 mensajes distintos
  // (bug reportado por Joel, 1 sept 2026). Ahora el genérico solo aparece
  // como respaldo cuando la entidad no configuró su propio pie de factura.
  // Letras más grandes y todo el bloque más arriba — se veía muy chiquito y
  // se perdía muy abajo en la factura (pedido de Joel, 1 sept 2026).
  if (entidad?.invoice_footer) {
    // Ancho casi completo (antes se reservaban 180pt de más, sobrante de
    // cuando la marca de VICTOR CFO iba al lado del pie — ahora va centrada
    // abajo por separado, así que el pie ya no necesita cederle espacio;
    // esto evitaba que un pie corto como "Gracias por confiar..." se
    // partiera en 2 líneas sin necesidad — reportado por Joel, 1 sept 2026).
    const lineasPie = envolverTexto(String(entidad.invoice_footer).slice(0, 300), font, 10, width - margin * 2 - 20);
    let piePieY = 75;
    for (const linea of lineasPie) {
      texto(linea, margin, piePieY, { size: 10, color: negro });
      piePieY -= 13;
    }
  } else {
    // Mensaje de agradecimiento fijo pedido por Joel (1 sept 2026): una sola
    // línea, con la primera frase en bold y el resto en texto normal (antes
    // se partía en dos líneas y se veía cortado).
    textoDerechaMixto(
      [
        { texto: "Gracias por confiar en nuestro trabajo. ", f: bold },
        { texto: "Su éxito también es nuestro compromiso.", f: font },
      ],
      width - margin,
      58,
      10
    );
  }

  // Marca de VICTOR CFO al pie, centrada, en azul y clickeable — lleva a
  // victorcfo.com al tocarla (pedido de Joel, 1 sept 2026).
  const marcaTexto = "Generado con VICTOR CFO";
  const marcaSize = 9;
  const marcaAncho = bold.widthOfTextAtSize(marcaTexto, marcaSize);
  const marcaX = width / 2 - marcaAncho / 2;
  const azulLink = rgb(0.086, 0.451, 0.812);
  texto(marcaTexto, marcaX, 38, { f: bold, size: marcaSize, color: azulLink });
  agregarLinkPDF(marcaX, 36, marcaAncho, marcaSize + 3, "https://victorcfo.com");

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factura-${factura.numero}.pdf"`,
    },
  });
}
