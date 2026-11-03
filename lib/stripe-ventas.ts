import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { fechaHoyPR } from "@/lib/hora-pr";

// Importa a VICTOR las ventas cobradas en la cuenta de Stripe CONECTADA del
// usuario (Stripe Connect Standard, migración 0065) aunque no se hayan hecho
// desde una factura de VICTOR — link de pago, suscripción, checkout propio…
// (3 nov 2026, pedido de Joel: que las Estadísticas funcionen para todos, sin
// tener que crear facturas a mano). Cada cargo exitoso crea/une el cliente y
// una factura PAGADA con su canal (origen). Reembolsos → nota de crédito.
// Idempotente por (owner_id, stripe_charge_id), así que el webhook y la
// importación de historial pueden correr varias veces sin duplicar.

type Resultado = "creada" | "duplicada" | "omitida";

const r2 = (n: number) => Math.round(n * 100) / 100;

function origenDeCargo(c: Stripe.Charge): string {
  const m = (c.metadata ?? {}) as Record<string, string>;
  const explicito = m.origen || m.utm_source || m.source;
  if (explicito) return String(explicito).trim().slice(0, 60);
  if ((c as any).invoice) return "Suscripción / factura de Stripe";
  return "Stripe (cobro directo)";
}

async function aplicarReembolso(admin: any, entidad: any, facturaId: string, clientId: string | null, cargo: Stripe.Charge) {
  const reembolsado = r2((cargo.amount_refunded ?? 0) / 100);
  if (reembolsado <= 0) return;
  const numero = `NC-ST-${cargo.id.slice(-8)}`;
  const original = r2((cargo.amount_captured ?? cargo.amount) / 100);

  const { data: existente } = await admin
    .from("notas_credito")
    .select("id, monto")
    .eq("owner_id", entidad.owner_id)
    .eq("numero", numero)
    .maybeSingle();

  if (existente) {
    if (Number(existente.monto) !== reembolsado) {
      await admin.from("notas_credito").update({ monto: reembolsado }).eq("id", existente.id);
    }
  } else {
    await admin.from("notas_credito").insert({
      owner_id: entidad.owner_id,
      entity_id: entidad.id,
      invoice_id: facturaId,
      client_id: clientId,
      numero,
      tipo: "reembolso",
      monto: reembolsado,
      motivo: "Reembolso hecho en Stripe",
      fecha: fechaHoyPR(),
      metodo_reembolso: "Tarjeta",
    });
  }

  const nuevoTotal = Math.max(0, r2(original - reembolsado));
  await admin.from("invoices").update({ total: nuevoTotal, subtotal: nuevoTotal }).eq("id", facturaId);
}

export async function registrarCargoStripe(
  admin: any,
  cuentaConectada: string,
  cargoEntrante: Stripe.Charge,
  opciones: { verificarSesionVictor?: boolean } = {}
): Promise<Resultado> {
  if (cargoEntrante.status !== "succeeded" || !cargoEntrante.paid) return "omitida";

  const { data: entidad } = await admin
    .from("business_entities")
    .select("id, owner_id, invoice_prefix, invoice_start_number, default_payment_terms")
    .eq("stripe_connect_account_id", cuentaConectada)
    .maybeSingle();
  if (!entidad) return "omitida";

  const paymentIntentId =
    typeof cargoEntrante.payment_intent === "string" ? cargoEntrante.payment_intent : cargoEntrante.payment_intent?.id ?? null;

  // 1) ¿Ya está registrada? (por cargo o por payment_intent de una factura de VICTOR)
  const { data: yaPorCargo } = await admin
    .from("invoices")
    .select("id, client_id, notas")
    .eq("owner_id", entidad.owner_id)
    .eq("stripe_charge_id", cargoEntrante.id)
    .maybeSingle();
  if (yaPorCargo) {
    // Solo las facturas importadas desde Stripe se ajustan aquí; las facturas
    // creadas en VICTOR (con impuestos/retención) las maneja su propio flujo.
    if (typeof yaPorCargo.notas === "string" && yaPorCargo.notas.startsWith("Importada automáticamente desde Stripe")) {
      await aplicarReembolso(admin, entidad, yaPorCargo.id, yaPorCargo.client_id, cargoEntrante);
    }
    return "duplicada";
  }
  if (paymentIntentId) {
    const { data: yaPorPI } = await admin
      .from("invoices")
      .select("id")
      .eq("owner_id", entidad.owner_id)
      .eq("stripe_payment_intent", paymentIntentId)
      .maybeSingle();
    if (yaPorPI) return "duplicada";
  }

  // 2) Cobros de facturas de VICTOR (Checkout con metadata.invoice_id) los
  //    marca el webhook de checkout.session.completed; aquí no se duplican.
  if (opciones.verificarSesionVictor !== false && paymentIntentId) {
    try {
      const sesiones = await getStripe().checkout.sessions.list(
        { payment_intent: paymentIntentId, limit: 1 },
        { stripeAccount: cuentaConectada }
      );
      if (sesiones.data[0]?.metadata?.invoice_id) return "omitida";
    } catch {
      // Si no se pudo verificar, seguimos: la dedup por payment_intent de arriba cubre la mayoría de los casos.
    }
  }

  // 3) Fee real (balance_transaction) — mejor esfuerzo.
  let cargo = cargoEntrante;
  let bt = cargo.balance_transaction as Stripe.BalanceTransaction | string | null;
  if (bt && typeof bt === "string") {
    try {
      cargo = await getStripe().charges.retrieve(cargo.id, { expand: ["balance_transaction"] }, { stripeAccount: cuentaConectada });
      bt = cargo.balance_transaction as Stripe.BalanceTransaction | null;
    } catch {
      bt = null;
    }
  }
  const btObj = bt && typeof bt === "object" ? (bt as Stripe.BalanceTransaction) : null;

  // 4) Cliente: por email dentro de la cuenta del dueño; si no, se crea.
  const email = (cargo.billing_details?.email ?? cargo.receipt_email ?? null)?.toLowerCase() ?? null;
  const nombre = cargo.billing_details?.name?.trim() || email || "Cliente de Stripe";
  let clientId: string | null = null;
  if (email) {
    const { data: existente } = await admin
      .from("clients")
      .select("id")
      .eq("owner_id", entidad.owner_id)
      .eq("entity_id", entidad.id)
      .ilike("email", email)
      .maybeSingle();
    clientId = existente?.id ?? null;
  }
  if (!clientId) {
    const { data: nuevo, error } = await admin
      .from("clients")
      .insert({
        owner_id: entidad.owner_id,
        entity_id: entidad.id,
        name: nombre,
        email,
        phone: cargo.billing_details?.phone ?? null,
        fuente: "stripe",
      })
      .select("id")
      .maybeSingle();
    if (error || !nuevo) throw new Error(`No se pudo crear el cliente de Stripe: ${error?.message ?? "desconocido"}`);
    clientId = nuevo.id;
  }

  // 5) Factura pagada.
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", entidad.owner_id)
    .eq("entity_id", entidad.id);
  const numero = `${entidad.invoice_prefix ?? "INV"}-${(entidad.invoice_start_number ?? 1001) + (count ?? 0)}`;
  const fecha = fechaHoyPR(new Date(cargo.created * 1000));
  const bruto = r2((cargo.amount_captured ?? cargo.amount) / 100);

  const { data: factura, error: errFactura } = await admin
    .from("invoices")
    .insert({
      owner_id: entidad.owner_id,
      entity_id: entidad.id,
      client_id: clientId,
      numero,
      subtotal: bruto,
      ivu_pct: 0,
      ivu_monto: 0,
      retencion_pct: 0,
      retencion_monto: 0,
      total: bruto,
      estado: "pagada",
      metodo_pago: "Tarjeta",
      fecha_emision: fecha,
      fecha_vencimiento: fecha,
      fecha_pago: fecha,
      stripe_charge_id: cargo.id,
      stripe_payment_intent: paymentIntentId,
      fee_real: btObj ? btObj.fee / 100 : null,
      monto_neto_real: btObj ? btObj.net / 100 : null,
      fee_fuente: btObj ? "real" : null,
      origen: origenDeCargo(cargo),
      notas: "Importada automáticamente desde Stripe.",
    })
    .select("id")
    .maybeSingle();
  if (errFactura || !factura) throw new Error(`No se pudo crear la factura de Stripe: ${errFactura?.message ?? "desconocido"}`);

  await admin.from("invoice_items").insert({
    invoice_id: factura.id,
    descripcion: cargo.description?.slice(0, 200) || "Pago recibido por Stripe",
    cantidad: 1,
    precio_unitario: bruto,
    subtotal_linea: bruto,
  });

  await aplicarReembolso(admin, entidad, factura.id, clientId, cargo);
  return "creada";
}
