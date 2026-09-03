import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdPara, esPlanValido, esCicloValido } from "@/lib/stripe";

// Crea una Stripe Checkout Session y devuelve la URL a la que hay que
// mandar al usuario. Se usa en dos momentos distintos: (1) justo después
// de /registro, para el primer pago (returnTo="/onboarding"), y (2) desde
// el paywall de Pro (/dashboard/equipo) cuando un usuario Core ya
// existente quiere subir de plan (returnTo="/dashboard/equipo"). En los
// dos casos el usuario YA tiene sesión de Supabase — esta ruta nunca crea
// la cuenta, solo la conecta a un pago real.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan;
  const ciclo = body?.ciclo;
  const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/onboarding";
  const cancelTo = typeof body?.cancelTo === "string" ? body.cancelTo : "/registro/completar-pago";

  if (!esPlanValido(plan) || !esCicloValido(ciclo)) {
    return NextResponse.json({ error: "Plan o ciclo inválido." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("stripe_customer_id, referred_by")
    .eq("id", user.id)
    .maybeSingle();

  // Precio de referido (30 agosto 2026): si a este usuario lo trajo el
  // link de otro (referred_by no es null — se guarda en el signup, ver
  // migración 0031), paga el Core con descuento en vez del precio normal.
  // Nunca se confía en nada que mande el cliente para esto — referred_by
  // se lee de la base de datos, no del body de este POST.
  const esReferido = !!perfil?.referred_by;
  const priceId = priceIdPara(plan, ciclo, esReferido);
  if (!priceId) {
    return NextResponse.json(
      { error: `Falta configurar el Price ID de Stripe para ${plan}/${ciclo} en las variables de entorno.` },
      { status: 500 }
    );
  }

  // Referido en Pro (3 sept 2026, pedido de Joel: "hay que hacer un link
  // para Pro pq la idea es vender todos los pro posibles pq los medicos
  // caen en Pro"). A diferencia de Core (que usa un Price ID paralelo con
  // descuento, arriba), Pro usa un trial de 30 días sobre el MISMO Price ID
  // — no hace falta crear precios nuevos en Stripe ni env vars nuevas. Se
  // confirmó que checkout.session.completed escribe plan_status="active" e
  // igual customer.subscription.updated trata "trialing" como "active", así
  // que el usuario referido queda con acceso completo a Pro desde que
  // termina el checkout, sin pagar nada el primer mes. Pro+ queda fuera a
  // propósito (ya no es autoservicio).
  const esReferidoProConTrial = plan === "pro" && esReferido;

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";
  const separadorReturn = returnTo.includes("?") ? "&" : "?";
  const separadorCancel = cancelTo.includes("?") ? "&" : "?";

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: perfil?.stripe_customer_id || undefined,
      customer_email: perfil?.stripe_customer_id ? undefined : user.email,
      metadata: { supabase_user_id: user.id, plan, ciclo },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, ciclo },
        ...(esReferidoProConTrial ? { trial_period_days: 30 } : {}),
      },
      success_url: `${origin}${returnTo}${separadorReturn}pago=exitoso`,
      cancel_url: `${origin}${cancelTo}${separadorCancel}plan=${plan}&ciclo=${ciclo}`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
      { status: 500 }
    );
  }
}
