import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { formatMoney, formatFecha, slugificar } from "@/lib/format";

// Certificado Anual de Gastos (#791, 1 oct 2026, pedido de Joel vía el
// pitch de su Gem CPA: "para que el cliente se lo reenvíe directo a su CPA
// en enero y lo meta en el Anejo B/M... sin tener que juntar 12 recibos
// sueltos"). Es un PDF de 1 página que consolida TODO lo pagado a VICTOR
// CFO en el año contributivo pedido (suscripción + cualquier addon —
// Técnicos/Secretaria/Administrador/Entidad adicional/Créditos IA — ya
// que todos esos son subscription items o payments en el MISMO Stripe
// Customer, así que un solo invoices.list() los trae todos juntos sin
// tener que distinguirlos uno a uno).
//
// Fuente de la verdad: Stripe, no nuestra base de datos — las facturas
// reales con lo que el cliente pagó de verdad (incluye prorrateos, cambios
// de plan a mitad de año, etc.) viven ahí, no en una tabla nuestra.
//
// Datos fiscales de VICTOR CFO LLC como proveedor (ver #790): el EIN y el
// Registro de Comerciante de SURI se pegan en Vercel cuando Joel los tenga
// a mano — mientras tanto el PDF sale igual, solo que sin esas dos líneas
// (nunca inventamos un número fiscal).
const VICTOR_CFO_EIN = process.env.VICTOR_CFO_EIN || null;
const VICTOR_CFO_REGISTRO_COMERCIANTE = process.env.VICTOR_CFO_REGISTRO_COMERCIANTE || null;
const VICTOR_CFO_DIRECCION = process.env.VICTOR_CFO_DIRECCION || null;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const hoy = new Date();
  // Default: año contributivo que acaba de cerrar si estamos en los
  // primeros 2 meses del año (ene/feb — la ventana real en que un cliente
  // pide esto para su CPA), si no el año en curso.
  const anioDefault = hoy.getMonth() <= 1 ? hoy.getFullYear() - 1 : hoy.getFullYear();
  const anio = Number(searchParams.get("anio")) || anioDefault;

  const { data: perfil } = await supabase
    .from("users")
    .select("full_name, stripe_customer_id, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Todavía no tienes una suscripción pagada con VICTOR CFO — no hay nada que certificar." },
      { status: 400 }
    );
  }

  const inicioAnio = Math.floor(new Date(Date.UTC(anio, 0, 1)).getTime() / 1000);
  const finAnio = Math.floor(new Date(Date.UTC(anio + 1, 0, 1)).getTime() / 1000);

  const stripe = getStripe();
  const facturasPagadas: { numero: string; fecha: string; monto: number }[] = [];
  let totalPagado = 0;
  let startingAfter: string | undefined;
  // Paginar por si acaso (addons + créditos IA sueltos pueden pasar de 12
  // facturas/año) — en la práctica casi nunca hace falta una 2da página.
  for (;;) {
    const pagina = await stripe.invoices.list({
      customer: perfil.stripe_customer_id,
      status: "paid",
      created: { gte: inicioAnio, lt: finAnio },
      limit: 100,
      starting_after: startingAfter,
    });
    for (const inv of pagina.data) {
      const monto = (inv.amount_paid ?? 0) / 100;
      totalPagado += monto;
      facturasPagadas.push({
        numero: inv.number || inv.id,
        fecha: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString().slice(0, 10)
          : new Date(inv.created * 1000).toISOString().slice(0, 10),
        monto,
      });
    }
    if (!pagina.has_more || pagina.data.length === 0) break;
    startingAfter = pagina.data[pagina.data.length - 1].id;
  }
  facturasPagadas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (facturasPagadas.length === 0) {
    return NextResponse.json(
      { error: `No encontramos pagos a VICTOR CFO en ${anio}. Verifica el año o si tu suscripción empezó después.` },
      { status: 400 }
    );
  }

  // "Cero balance pendiente" (el texto que pide #791) — se verifica de
  // verdad contra Stripe en vez de asumirlo: si hay alguna factura abierta
  // (open/uncollectible) del cliente AHORA MISMO, el certificado lo dice
  // explícito en vez de mentir con una frase fija.
  const facturasAbiertas = await stripe.invoices.list({
    customer: perfil.stripe_customer_id,
    status: "open",
    limit: 5,
  });
  const balancePendiente = facturasAbiertas.data.reduce((s, f) => s + (f.amount_remaining ?? 0) / 100, 0);
  const sinBalance = balancePendiente <= 0;

  const nombreTitular = perfil.full_name || user.email || "Cliente VICTOR CFO";

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const width = 612;
  const teal = rgb(0.114, 0.62, 0.459);
  const gris = rgb(0.45, 0.45, 0.45);
  const negro = rgb(0.1, 0.1, 0.1);
  const lineaGris = rgb(0.85, 0.85, 0.85);

  let y = 792 - margin;
  function texto(contenido: string, x: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    page.drawText(contenido, { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? negro });
  }
  function textoDerecha(contenido: string, xDerecha: number, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: xDerecha - w, y: yPos, size, font: f, color: opts.color ?? negro });
  }
  function centrado(contenido: string, yPos: number, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(contenido, size);
    page.drawText(contenido, { x: (width - w) / 2, y: yPos, size, font: f, color: opts.color ?? negro });
  }

  // Encabezado
  texto("VICTOR CFO LLC", margin, y, { f: bold, size: 18, color: teal });
  y -= 20;
  if (VICTOR_CFO_DIRECCION) {
    texto(VICTOR_CFO_DIRECCION, margin, y, { size: 8.5, color: gris });
    y -= 12;
  }
  const lineasFiscales: string[] = [];
  if (VICTOR_CFO_EIN) lineasFiscales.push(`EIN: ${VICTOR_CFO_EIN}`);
  if (VICTOR_CFO_REGISTRO_COMERCIANTE) lineasFiscales.push(`Registro de Comerciante SURI: ${VICTOR_CFO_REGISTRO_COMERCIANTE}`);
  if (lineasFiscales.length > 0) {
    texto(lineasFiscales.join("   ·   "), margin, y, { size: 8.5, color: gris });
    y -= 12;
  }
  texto("victorcfo.com", margin, y, { size: 8.5, color: gris });
  y -= 24;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: teal });
  y -= 36;

  centrado(`CERTIFICADO DE GASTOS OPERACIONALES`, y, { f: bold, size: 15 });
  y -= 20;
  centrado(`Año Contributivo ${anio}`, y, { size: 12, color: gris });
  y -= 40;

  texto("Proveedor:", margin, y, { f: bold, size: 10 });
  texto("VICTOR CFO — software de administración financiera", margin + 80, y, { size: 10 });
  y -= 18;
  texto("Cliente:", margin, y, { f: bold, size: 10 });
  texto(nombreTitular, margin + 80, y, { size: 10 });
  y -= 18;
  texto("Plan:", margin, y, { f: bold, size: 10 });
  texto(perfil.plan ? perfil.plan.toUpperCase() : "—", margin + 80, y, { size: 10 });
  y -= 36;

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: lineaGris });
  y -= 8;
  texto("Fecha de pago", margin, y - 14, { f: bold, size: 9, color: gris });
  texto("Factura #", margin + 150, y - 14, { f: bold, size: 9, color: gris });
  textoDerecha("Monto pagado", width - margin, y - 14, { f: bold, size: 9, color: gris });
  y -= 22;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: lineaGris });
  y -= 16;

  for (const f of facturasPagadas) {
    texto(formatFecha(f.fecha), margin, y, { size: 9.5 });
    texto(f.numero, margin + 150, y, { size: 9.5, color: gris });
    textoDerecha(formatMoney(f.monto), width - margin, y, { size: 9.5 });
    y -= 15;
  }

  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: teal });
  y -= 20;
  texto("Total pagado en el año", margin, y, { f: bold, size: 12 });
  textoDerecha(formatMoney(totalPagado), width - margin, y, { f: bold, size: 12, color: teal });
  y -= 30;

  if (sinBalance) {
    texto("Balance pendiente: $0.00 — cuenta al día, sin facturas abiertas.", margin, y, { size: 10, color: teal });
  } else {
    texto(`Balance pendiente a la fecha de este certificado: ${formatMoney(balancePendiente)}.`, margin, y, { size: 10, color: rgb(0.83, 0.62, 0.05) });
  }
  y -= 40;

  texto(
    "Este certificado consolida los pagos reales procesados por Stripe a nombre de VICTOR CFO LLC",
    margin,
    y,
    { size: 8.5, color: gris }
  );
  y -= 11;
  texto(
    "durante el año contributivo indicado — sirve como comprobante contemporáneo del gasto operacional",
    margin,
    y,
    { size: 8.5, color: gris }
  );
  y -= 11;
  texto("de administración financiera para efectos de la Sección 1033.15 del Código de Rentas Internas de PR.", margin, y, { size: 8.5, color: gris });

  const marca = `Generado automáticamente por VICTOR CFO el ${formatFecha(new Date().toISOString().slice(0, 10))}`;
  const sizeMarca = 8;
  const wMarca = font.widthOfTextAtSize(marca, sizeMarca);
  page.drawText(marca, { x: (width - wMarca) / 2, y: 30, size: sizeMarca, font, color: gris });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slugificar(nombreTitular)}-certificado-gastos-victorcfo-${anio}.pdf"`,
    },
  });
}
