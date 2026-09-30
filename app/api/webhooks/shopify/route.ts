import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { verificarFirmaWebhook, type ShopifyOrderPaidPayload } from "@/lib/shopify";
import { fechaHoyPR } from "@/lib/hora-pr";

// Receptor público del webhook orders/paid de Shopify (migración 0109, 30
// sept 2026, integración directa — no Zapier). Por cada orden pagada crea
// (o reusa) el Cliente y crea la Factura ya "pagada", usando el monto EXACTO
// que Shopify ya cobró (decisión explícita de Joel: no se recalcula IVU/
// retención de VICTOR encima de un cobro que ya salió con la lógica fiscal
// de la propia tienda).
//
// Sin sesión de usuario — la autenticación es la firma HMAC del webhook
// (verificarFirmaWebhook) más el hecho de que el shop domain tiene que
// coincidir con una entidad shopify_conectado=true. Usa el cliente admin
// (service role) porque no hay usuario logueado que dispare RLS.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");

  if (!shopDomain) {
    return NextResponse.json({ error: "Falta X-Shopify-Shop-Domain." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: entidad, error: entidadError } = await admin
    .from("business_entities")
    .select(
      "id, owner_id, shopify_webhook_secret, shopify_conectado, invoice_prefix, invoice_start_number, default_payment_terms"
    )
    .eq("shopify_shop_domain", shopDomain.toLowerCase())
    .eq("shopify_conectado", true)
    .maybeSingle();

  // 200 aunque no encontremos la entidad — así Shopify no reintenta
  // infinitamente un webhook de una tienda que el dueño ya desconectó.
  if (entidadError || !entidad || !entidad.shopify_webhook_secret) {
    return NextResponse.json({ received: true, ignorado: "Tienda no conectada." });
  }

  let webhookSecret: string;
  try {
    webhookSecret = decryptSecret(entidad.shopify_webhook_secret);
  } catch {
    return NextResponse.json({ received: true, ignorado: "No se pudo descifrar el secreto." });
  }

  if (!verificarFirmaWebhook(rawBody, hmacHeader, webhookSecret)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  // Solo nos interesan órdenes pagadas — si en algún momento el dueño
  // registra otro topic a mano en Shopify, esto lo ignora sin tronar.
  if (topic && topic !== "orders/paid") {
    return NextResponse.json({ received: true, ignorado: `Topic no soportado: ${topic}` });
  }

  let orden: ShopifyOrderPaidPayload;
  try {
    orden = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const shopifyOrderId = String(orden.id);

  // Idempotencia: si Shopify reintenta el mismo evento (no respondimos 200
  // a tiempo, timeout, etc.), no se duplica la factura.
  const { data: yaExiste } = await admin
    .from("invoices")
    .select("id")
    .eq("owner_id", entidad.owner_id)
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();
  if (yaExiste) {
    return NextResponse.json({ received: true, ya_procesada: true });
  }

  // Resolver/crear Cliente — primero por shopify_customer_id (dedup fuerte),
  // si la orden no trae customer (compra de invitado) cae a email suelto.
  const shopifyCustomerId = orden.customer?.id != null ? String(orden.customer.id) : null;
  const emailCliente = orden.customer?.email ?? orden.email ?? null;
  const nombreCliente =
    [orden.customer?.first_name, orden.customer?.last_name].filter(Boolean).join(" ").trim() ||
    emailCliente ||
    "Cliente de Shopify";

  let clientId: string | null = null;

  if (shopifyCustomerId) {
    const { data: clienteExistente } = await admin
      .from("clients")
      .select("id")
      .eq("owner_id", entidad.owner_id)
      .eq("shopify_customer_id", shopifyCustomerId)
      .maybeSingle();
    clientId = clienteExistente?.id ?? null;
  }

  if (!clientId && emailCliente) {
    const { data: clientePorEmail } = await admin
      .from("clients")
      .select("id")
      .eq("owner_id", entidad.owner_id)
      .eq("email", emailCliente)
      .maybeSingle();
    clientId = clientePorEmail?.id ?? null;
    // Si lo encontramos por email pero todavía no tenía shopify_customer_id
    // guardado, lo completamos para que la próxima orden haga match directo.
    if (clientId && shopifyCustomerId) {
      await admin.from("clients").update({ shopify_customer_id: shopifyCustomerId }).eq("id", clientId);
    }
  }

  if (!clientId) {
    const { data: clienteNuevo, error: clienteError } = await admin
      .from("clients")
      .insert({
        owner_id: entidad.owner_id,
        entity_id: entidad.id,
        name: nombreCliente,
        email: emailCliente,
        phone: orden.customer?.phone ?? null,
        shopify_customer_id: shopifyCustomerId,
      })
      .select("id")
      .maybeSingle();
    if (clienteError || !clienteNuevo) {
      return NextResponse.json(
        { error: `No se pudo crear el cliente: ${clienteError?.message ?? "desconocido"}` },
        { status: 500 }
      );
    }
    clientId = clienteNuevo.id;
  }

  // Número consecutivo por entidad — mismo criterio que /api/v1/facturas.
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", entidad.owner_id)
    .eq("entity_id", entidad.id);
  const numero = `${entidad.invoice_prefix ?? "INV"}-${(entidad.invoice_start_number ?? 1001) + (count ?? 0)}`;

  const subtotal = Number(orden.subtotal_price ?? 0);
  const taxMonto = Number(orden.total_tax ?? 0);
  const total = Number(orden.total_price ?? subtotal + taxMonto);
  const hoyStr = fechaHoyPR();
  const fechaOrden = orden.created_at ? orden.created_at.slice(0, 10) : hoyStr;

  const { data: factura, error: facturaError } = await admin
    .from("invoices")
    .insert({
      owner_id: entidad.owner_id,
      entity_id: entidad.id,
      client_id: clientId,
      numero,
      subtotal,
      // El "IVU" de VICTOR aquí es literalmente el tax que Shopify ya cobró
      // — no un recálculo con las tasas configuradas en la entidad.
      ivu_pct: subtotal > 0 ? Number(((taxMonto / subtotal) * 100).toFixed(3)) : 0,
      ivu_monto: taxMonto,
      retencion_pct: 0,
      retencion_monto: 0,
      total,
      estado: "pagada",
      metodo_pago: "Shopify",
      fecha_emision: fechaOrden,
      fecha_vencimiento: fechaOrden,
      fecha_pago: fechaOrden,
      shopify_order_id: shopifyOrderId,
    })
    .select("id")
    .maybeSingle();

  if (facturaError || !factura) {
    return NextResponse.json(
      { error: `No se pudo crear la factura: ${facturaError?.message ?? "desconocido"}` },
      { status: 500 }
    );
  }

  const lineas = orden.line_items ?? [];
  if (lineas.length > 0) {
    await admin.from("invoice_items").insert(
      lineas.map((l) => ({
        invoice_id: factura.id,
        descripcion: l.title,
        cantidad: l.quantity,
        precio_unitario: Number(l.price),
        subtotal_linea: l.quantity * Number(l.price),
      }))
    );
  } else {
    // Orden sin desglose de líneas (raro, pero por si acaso) — una sola
    // línea con el subtotal completo para que la factura no quede vacía.
    await admin.from("invoice_items").insert({
      invoice_id: factura.id,
      descripcion: "Orden de Shopify",
      cantidad: 1,
      precio_unitario: subtotal,
      subtotal_linea: subtotal,
    });
  }

  return NextResponse.json({ received: true, factura_id: factura.id, numero });
}
