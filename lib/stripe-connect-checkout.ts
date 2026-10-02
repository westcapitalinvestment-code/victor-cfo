import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Resuelve el link de cobro real de una factura (Stripe Connect Standard,
// migración 0065) — REUSA la Checkout Session guardada en
// invoices.stripe_checkout_session_id si sigue viva, o crea una nueva si no
// hay, expiró, o ya se pagó/canceló.
//
// FIX 2 oct 2026 (caso real: Dr. Serrano pagó $480 dos veces, 3 minutos
// aparte — ver migración 0133): este campo ANTES se llamaba igual que
// invoices.stripe_payment_intent, compartido con el webhook — un reintento
// de pago podía pisar el payment_intent ya confirmado con el id de una
// sesión nueva. Ahora cada quien escribe su propio campo. Y más importante:
// antes de crear una sesión nueva, esta función le pregunta a STRIPE
// directamente si la sesión guardada ya se pagó — no solo a nuestra propia
// invoices.estado, que puede estar unos segundos atrasada mientras el
// webhook todavía procesa. Si Stripe dice que ya se pagó, NO genera un
// cobro nuevo aunque nuestra base de datos no se haya enterado todavía.
//
// Por qué reusar (3 sept 2026, pedido de Joel: que el link del correo/PDF
// "jale" el cobro): una Checkout Session de Stripe expira a las 24h de
// creada, pero el link que va en el PDF y en el correo de facturas
// recurrentes es ESTABLE — vive para siempre en /api/facturas/[id]/pagar.
// Si cada visita creara una sesión nueva, el cliente podría abrir el correo
// tres días después de que el negocio ya conectó su Stripe y aun así
// funcionaría, PERO también se acumularían sesiones huérfanas en Stripe
// cada vez que alguien solo abre el correo sin pagar. Esta función checa
// primero si la sesión guardada sigue "open"/sin pagar/sin expirar antes de
// pedirle una nueva a Stripe.
//
// Usa el cliente ADMIN (bypassa RLS) a propósito — la llama tanto la ruta
// autenticada del botón manual (factura-detalle.tsx) como la ruta pública
// del link estable (sin sesión, igual que el PDF) — la verificación de
// dueño/acceso vive en cada ruta, no aquí.
export type ResultadoLinkCobro = { ok: true; url: string } | { ok: false; error: string; status: number };

export async function resolverLinkCobro(facturaId: string): Promise<ResultadoLinkCobro> {
  const supabase = createAdminClient();

  const { data: factura, error: errorFactura } = await supabase
    .from("invoices")
    .select(
      "id, numero, total, estado, stripe_checkout_session_id, business_entities(name, stripe_connect_account_id, stripe_connect_charges_enabled)"
    )
    .eq("id", facturaId)
    .maybeSingle();

  if (errorFactura || !factura) {
    return { ok: false, error: "Factura no encontrada.", status: 404 };
  }

  if (factura.estado === "pagada") {
    return { ok: false, error: "Esta factura ya está pagada.", status: 400 };
  }

  const entidad = (factura as any).business_entities as {
    name: string;
    stripe_connect_account_id: string | null;
    stripe_connect_charges_enabled: boolean;
  } | null;

  if (!entidad?.stripe_connect_account_id || !entidad.stripe_connect_charges_enabled) {
    return { ok: false, error: "Este negocio todavía no activó el cobro con tarjeta.", status: 400 };
  }

  const total = Number((factura as any).total ?? 0);
  if (!(total > 0)) {
    return { ok: false, error: "La factura no tiene un total válido para cobrar.", status: 400 };
  }

  const sesionGuardadaId = (factura as any).stripe_checkout_session_id as string | null;

  if (sesionGuardadaId && sesionGuardadaId.startsWith("cs_")) {
    try {
      const sesion = await getStripe().checkout.sessions.retrieve(sesionGuardadaId, undefined, {
        stripeAccount: entidad.stripe_connect_account_id,
      });

      // Ya se pagó en Stripe — aunque nuestro invoices.estado todavía no lo
      // refleje (el webhook puede tardar unos segundos), NO generamos un
      // cobro nuevo. Esto es lo que faltaba para evitar el doble cobro real
      // del 2 oct 2026: antes, si esta condición no aplicaba exactamente
      // como "reusable", la función caía directo a crear una sesión nueva
      // sin preguntarse POR QUÉ no era reusable.
      if (sesion.payment_status === "paid") {
        return { ok: false, error: "Esta factura ya está pagada.", status: 409 };
      }

      const sigueViva = !sesion.expires_at || sesion.expires_at * 1000 > Date.now();
      if (sesion.status === "open" && sigueViva && sesion.url) {
        return { ok: true, url: sesion.url };
      }
    } catch {
      // Sesión borrada/inválida en Stripe — sigue abajo y crea una nueva.
    }
  }

  const origin = "https://www.victorcfo.com";

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(total * 100),
              product_data: {
                name: `Factura #${(factura as any).numero ?? factura.id.slice(0, 8)}`,
                description: entidad.name || undefined,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { invoice_id: factura.id },
        success_url: `${origin}/dashboard/facturacion/${factura.id}?cobro=exitoso`,
        cancel_url: `${origin}/dashboard/facturacion/${factura.id}`,
      },
      { stripeAccount: entidad.stripe_connect_account_id }
    );

    await supabase.from("invoices").update({ stripe_checkout_session_id: session.id }).eq("id", factura.id);

    if (!session.url) {
      return { ok: false, error: "Stripe no devolvió un link de cobro.", status: 500 };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar el link de cobro.", status: 500 };
  }
}
