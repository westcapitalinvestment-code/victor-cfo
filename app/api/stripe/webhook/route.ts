import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, esPlanValido, priceIdAddonTecnicos } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Saca las fechas de inicio/fin del ciclo de facturación actual de una
// suscripción — las usa el tope de gasto de IA (app/api/victor/route.ts,
// migración 0026) para no depender del mes calendario, que no coincide
// con cuándo Stripe realmente cobra. OJO: en esta versión del SDK de
// Stripe (22.x), current_period_start/end viven en el SUBSCRIPTION ITEM
// (subscription.items.data[0]), no en la suscripción misma — Stripe movió
// el campo ahí para soportar suscripciones con varios items en fechas
// distintas. Revisamos también el nivel viejo (subscription as any) por si
// alguna cuenta todavía lo reporta ahí.
function periodoDeSuscripcion(subscription: Stripe.Subscription): { inicio: string; fin: string } | null {
  const item = subscription.items?.data?.[0];
  const inicioUnix: number | undefined = item?.current_period_start ?? (subscription as any).current_period_start;
  const finUnix: number | undefined = item?.current_period_end ?? (subscription as any).current_period_end;
  if (!inicioUnix || !finUnix) return null;
  return {
    inicio: new Date(inicioUnix * 1000).toISOString().slice(0, 10),
    fin: new Date(finUnix * 1000).toISOString().slice(0, 10),
  };
}

// Stripe llama a esta ruta directamente (no el navegador del usuario), así
// que no hay sesión de Supabase que usar — de ahí el cliente admin. La
// verificación de firma (constructEvent) es lo único que nos garantiza que
// el POST viene realmente de Stripe y no de cualquiera que adivine esta
// URL y mande un "pago exitoso" falso.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Falta la firma o el webhook secret." }, { status: 400 });
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
      // Se dispara justo cuando el usuario termina de pagar en Checkout.
      // Aquí es donde de verdad "activamos" la cuenta: guardamos el
      // customer/subscription de Stripe y marcamos el plan elegido.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;

        if (!userId) break;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        const datosActualizar: Record<string, unknown> = {
          stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripe_subscription_id: subscriptionId,
          plan_status: "active",
        };
        if (esPlanValido(plan)) datosActualizar.plan = plan;

        // session.subscription normalmente solo trae el ID, no el objeto
        // completo — hace falta buscarlo aparte para sacar las fechas del
        // ciclo (ver periodoDeSuscripcion arriba). Si esto falla por lo que
        // sea, no bloqueamos la activación de la cuenta — el tope de gasto
        // simplemente cae al respaldo de mes calendario hasta que
        // customer.subscription.updated lo corrija en la próxima renovación.
        if (subscriptionId) {
          try {
            const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
            const ciclo = periodoDeSuscripcion(subscription);
            if (ciclo) {
              datosActualizar.ciclo_inicio = ciclo.inicio;
              datosActualizar.ciclo_fin = ciclo.fin;
            }
          } catch (err) {
            console.error("No se pudo obtener el ciclo de la suscripción:", err);
          }
        }

        await supabase.from("users").update(datosActualizar).eq("id", userId);
        break;
      }

      // Renovaciones, cambios de plan, o cuando un pago falla y Stripe pone
      // la suscripción en past_due/unpaid — reflejamos el estado real para
      // que el gate del middleware reaccione (ej. bloquear si past_due).
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        const estado = subscription.status; // active | past_due | unpaid | canceled | trialing | ...
        const plan = subscription.metadata?.plan;

        // Mapeamos los estados de Stripe a los 3 valores que ya usa el
        // resto de la app (active | incomplete | cancelled) en vez de
        // guardar el string crudo de Stripe — así el middleware solo
        // necesita conocer esos 3 valores, nunca los nombres de Stripe.
        let plan_status: "active" | "incomplete" | "cancelled" = "incomplete";
        if (estado === "active" || estado === "trialing") plan_status = "active";
        else if (estado === "canceled") plan_status = "cancelled";

        const datosActualizar: Record<string, unknown> = {
          stripe_subscription_id: subscription.id,
          plan_status,
        };
        if (esPlanValido(plan)) datosActualizar.plan = plan;

        // Aquí SÍ tenemos el objeto completo de la suscripción en el propio
        // evento — no hace falta una llamada aparte. Esto es lo que
        // mantiene ciclo_inicio/ciclo_fin correctos en cada renovación
        // mensual (Stripe manda este evento en cada ciclo nuevo).
        const ciclo = periodoDeSuscripcion(subscription);
        if (ciclo) {
          datosActualizar.ciclo_inicio = ciclo.inicio;
          datosActualizar.ciclo_fin = ciclo.fin;
        }

        // Addon Equipo (2 sept 2026): reconciliamos con lo que REALMENTE
        // tiene la suscripción en Stripe, no solo con lo que hizo nuestra
        // ruta /activar — así si alguien lo quita o lo pone a mano desde
        // el Dashboard de Stripe, la cuenta igual queda correcta en la
        // próxima renovación/cambio.
        const addonPriceId = priceIdAddonTecnicos();
        if (addonPriceId) {
          const itemAddon = subscription.items.data.find((it) => it.price.id === addonPriceId);
          datosActualizar.addon_tecnicos_status = itemAddon ? "activo" : "inactivo";
          datosActualizar.addon_tecnicos_item_id = itemAddon ? itemAddon.id : null;
        }

        await supabase.from("users").update(datosActualizar).eq("id", userId);
        break;
      }

      // El usuario canceló (o se venció definitivamente) — lo regresamos a
      // 'incomplete' para que el middleware lo mande de vuelta a pagar, en
      // vez de dejarlo con acceso gratis para siempre.
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        // cancelled_at (migración 0028) es lo que usa el Dashboard de
        // Operaciones para calcular cancelaciones-del-mes y churn rate —
        // sin esta fecha solo se sabe el estado actual, no cuándo pasó.
        //
        // cancellation_details (migración 0029) es la razón que Stripe le
        // pregunta al usuario en su Cancellation Flow del portal — si no
        // usó ese flow (ej. lo cancelamos nosotros a mano desde Stripe)
        // este campo viene null, así que no siempre va a haber razón.
        const cancelacion = (subscription as any).cancellation_details as
          | { reason?: string | null; comment?: string | null }
          | null
          | undefined;

        await supabase
          .from("users")
          .update({
            plan_status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: cancelacion?.reason ?? null,
            cancellation_comment: cancelacion?.comment ?? null,
            // Si se cancela la suscripción entera, el addon Equipo se va
            // con ella — no queda un item huérfano cobrando por su cuenta.
            addon_tecnicos_status: "inactivo",
            addon_tecnicos_item_id: null,
          })
          .eq("id", userId);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // No relanzamos el error como 500 hacia Stripe salvo que de verdad algo
    // haya fallado — si Stripe ve 500 reintenta el mismo evento varias
    // veces, lo cual está bien, pero preferimos loguear y devolver 200 para
    // eventos que simplemente no aplican (ej. userId ausente por diseño).
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error procesando el webhook." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
