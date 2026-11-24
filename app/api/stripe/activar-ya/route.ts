import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdPara, esPlanValido, todosLosPriceIdsDePlanes, planDesdePriceId, esPriceCoreTrading } from "@/lib/stripe";

// "Activar mi plan ya" durante la prueba de 7 días sin tarjeta (24 nov 2026,
// Joel: "si se le acaba el minuto diario, VICTOR le dice que continúa mañana
// o si no puede pagar el plan para tener más acceso").
//
// Un solo enlace que VICTOR y los correos pueden poner en texto:
//   /api/stripe/activar-ya?plan=core|pro|proplus
// 1) Sin session_id: abre un Stripe Checkout en modo "setup" (solo guarda la
//    tarjeta, no cobra) y vuelve aquí.
// 2) Con session_id: pone esa tarjeta como método de la suscripción, cambia
//    al plan escogido si es otro, y termina la prueba AHORA (Stripe cobra el
//    primer periodo en ese momento). Se limpia prueba_hasta para quitar el
//    tope de $7 de IA de la prueba; el webhook customer.subscription.updated
//    sincroniza plan/estado igual que siempre.
// Todos entran a la prueba en Pro; por eso el plan se escoge aquí y nunca se
// cobra Pro a quien escogió Core.

function volver(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return volver(req, "/login");

  const planPedido = req.nextUrl.searchParams.get("plan") ?? "pro";
  if (!esPlanValido(planPedido)) return volver(req, "/dashboard/config?activar=plan-invalido");

  const { data: perfil } = await supabase
    .from("users")
    .select("stripe_customer_id, stripe_subscription_id, billed_by_firma_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.stripe_customer_id || !perfil.stripe_subscription_id || perfil.billed_by_firma_id) {
    return volver(req, "/dashboard/config?activar=sin-suscripcion");
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(perfil.stripe_subscription_id);
  if (sub.status !== "trialing") return volver(req, "/dashboard/config?activar=ya-activo");

  const sessionId = req.nextUrl.searchParams.get("session_id");

  // Paso 1: pedir la tarjeta.
  if (!sessionId) {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: perfil.stripe_customer_id,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: { supabase_user_id: user.id, plan: planPedido, activar_ya: "1" },
      success_url: `${origin}/api/stripe/activar-ya?plan=${planPedido}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard`,
    });
    return NextResponse.redirect(session.url!, 303);
  }

  // Paso 2: confirmar y activar.
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
  const custId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (custId !== perfil.stripe_customer_id || session.mode !== "setup" || session.status !== "complete") {
    return volver(req, "/dashboard/config?activar=error");
  }
  const si = session.setup_intent;
  const pm = si && typeof si !== "string" ? (typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id) : null;
  if (!pm) return volver(req, "/dashboard/config?activar=error");

  // Plan escogido: mismo ciclo que la suscripción actual. Si era Core + Trading
  // y escoge Core, se queda con su precio de Trading.
  const idsPlanes = new Set(todosLosPriceIdsDePlanes());
  const itemPlan = sub.items.data.find((it) => idsPlanes.has(it.price.id));
  const actual = itemPlan ? planDesdePriceId(itemPlan.price.id) : null;
  const ciclo = actual?.ciclo ?? "mensual";
  const mantener = !itemPlan || actual?.plan === planPedido || (planPedido === "core" && esPriceCoreTrading(itemPlan.price.id));
  const nuevoPrice = mantener ? null : priceIdPara(planPedido, ciclo);
  if (!mantener && !nuevoPrice) return volver(req, "/dashboard/config?activar=error");

  try {
    await stripe.customers.update(perfil.stripe_customer_id, { invoice_settings: { default_payment_method: pm } });
    await stripe.subscriptions.update(sub.id, {
      default_payment_method: pm,
      ...(nuevoPrice && itemPlan ? { items: [{ id: itemPlan.id, price: nuevoPrice }] } : {}),
      metadata: { ...sub.metadata, plan: planPedido },
      proration_behavior: "none",
      trial_end: "now",
    });
  } catch (err) {
    console.error("activar-ya: no se pudo activar la suscripción:", err);
    return volver(req, "/dashboard/config?activar=error");
  }

  const admin = createAdminClient();
  await admin.from("users").update({ prueba_hasta: null, plan: planPedido }).eq("id", user.id);

  return volver(req, "/dashboard?activado=1");
}
