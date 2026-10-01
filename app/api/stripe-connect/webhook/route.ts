import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook APARTE del de suscripciones (app/api/stripe/webhook/route.ts) —
// Stripe Connect (migración 0065, 3 sept 2026) manda los eventos de las
// cuentas CONECTADAS (las de cada usuario Pro) a un endpoint distinto, con
// su propio signing secret, cuando activas "Listen to events on connected
// accounts" en el Dashboard de Stripe (Developers → Webhooks → este
// endpoint). Mezclarlos con el webhook de plataforma sería confuso — este
// solo le importa a la parte de cobro con tarjeta de Facturación.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Falta la firma o el webhook secret de Connect." }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Firma inválida: ${err instanceof Error ? err.message : "desconocido"}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      // Se dispara cada vez que cambia el estado de una cuenta conectada —
      // lo que nos importa es el momento en que charges_enabled pasa a
      // true (terminó el onboarding y ya puede cobrar de verdad).
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        await supabase
          .from("business_entities")
          .update({
            stripe_connect_charges_enabled: !!account.charges_enabled,
            stripe_connect_details_submitted: !!account.details_submitted,
          })
          .eq("stripe_connect_account_id", account.id);

        break;
      }

      // El cliente del usuario Pro pagó una factura con tarjeta — event.account
      // trae el ID de la cuenta CONECTADA dueña de ese Checkout Session (no
      // viene en el objeto session mismo, viene en el evento).
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const invoiceId = session.metadata?.invoice_id;
        if (!invoiceId) break;

        // Idempotencia simple: si ya está marcada pagada, no la volvemos a
        // tocar (evita pisar una fecha_pago distinta si Stripe reintenta
        // la entrega del mismo evento).
        const { data: factura } = await supabase
          .from("invoices")
          .select("estado, entity_id, business_entities(stripe_connect_account_id)")
          .eq("id", invoiceId)
          .maybeSingle();
        if (!factura || factura.estado === "pagada") break;

        // Defensa extra: la cuenta conectada que mandó este evento (event.account)
        // debe ser la misma que la entidad dueña de la factura — evita que un
        // evento de una cuenta ajena marque pagada una factura que no es suya.
        const cuentaEsperada = (factura as any).business_entities?.stripe_connect_account_id;
        if (cuentaEsperada && cuentaEsperada !== event.account) break;

        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

        // Fase 1 de reconciliación bruto/neto (1 oct 2026): hasta hoy nunca
        // pedíamos el fee real de Stripe — feeProcesamiento() en
        // facturacion-portal.tsx solo estimaba con 2.9%+$0.30. Expandimos el
        // payment_intent hasta su balance_transaction (ahí vive el fee real
        // que Stripe se cobró) para guardar el dato exacto. Nunca bloquea el
        // marcar-pagada si esto falla — el pago ya ocurrió, lo único que se
        // pierde es la precisión del fee (se queda en null y el frontend
        // sigue usando el estimado como fallback).
        let feeReal: number | null = null;
        let montoNetoReal: number | null = null;
        let stripeChargeId: string | null = null;
        if (paymentIntentId) {
          try {
            const pi = await getStripe().paymentIntents.retrieve(
              paymentIntentId,
              { expand: ["latest_charge.balance_transaction"] },
              { stripeAccount: event.account ?? undefined }
            );
            const charge = pi.latest_charge as Stripe.Charge | null;
            const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
            if (bt) {
              feeReal = bt.fee / 100;
              montoNetoReal = bt.net / 100;
              stripeChargeId = typeof charge === "object" ? charge?.id ?? null : null;
            }
          } catch (err) {
            console.error("No se pudo obtener el fee real de Stripe (se usará el estimado):", err);
          }
        }

        await supabase
          .from("invoices")
          .update({
            estado: "pagada",
            // Antes decía "Tarjeta (Stripe)" — no coincidía con el string
            // "Tarjeta" que usa feeProcesamiento() en los 3 lugares que lo
            // comparan (facturacion-portal.tsx, factura-detalle.tsx,
            // reportes/pdf y reportes/excel), así que un pago automático vía
            // Stripe Connect SIEMPRE mostraba $0 de fee estimado. Bug de
            // raíz, no cosmético.
            metodo_pago: "Tarjeta",
            fecha_pago: new Date().toISOString().slice(0, 10),
            stripe_payment_intent: paymentIntentId,
            stripe_charge_id: stripeChargeId,
            fee_real: feeReal,
            monto_neto_real: montoNetoReal,
            fee_fuente: feeReal !== null ? "real" : null,
          })
          .eq("id", invoiceId);

        break;
      }

      default:
        break;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error procesando el webhook de Connect." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
