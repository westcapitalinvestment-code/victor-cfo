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
    .select("stripe_customer_id, referred_by, referido_por_socio_id")
    .eq("id", user.id)
    .maybeSingle();

  // Referido (30 agosto 2026, ajustado 4 sept 2026 — pedido de Joel: "que
  // los 2 sean iguales"; extendido 5 sept 2026 al Programa de Socios —
  // pedido de Joel: "que reciba su mes gratis... para que vea que es
  // real"). Si a este usuario lo trajo el link de OTRO usuario
  // (referred_by, migración 0031) O el código de un socio aprobado
  // (referido_por_socio_id, migración 0070), paga el precio NORMAL de Core
  // o Pro, pero con 30 días de trial — mismo mecanismo para los dos
  // planes y los dos programas, sin Price ID aparte ni env vars nuevas.
  // Simétrico a propósito: un CPA/influencer que trae un cliente real le da
  // el mismo empujón que un usuario refiriendo a otro — y de paso, si el
  // socio se refiere a SÍ MISMO como su primer cliente, siente el programa
  // completo (mes gratis + su propia comisión cuando empiece a pagar de
  // verdad) antes de salir a referir gente de verdad. El socio sigue
  // ganando su $7/$25 normal recién en la PRIMERA factura real (Stripe no
  // manda invoice.paid durante el trial), así que sigue siendo
  // autofinanciado igual que antes — nada cambia en esa garantía. Nunca se
  // confía en nada que mande el cliente para esto — los dos campos se leen
  // de la base de datos, no del body de este POST.
  const esReferido = !!perfil?.referred_by || !!perfil?.referido_por_socio_id;
  const priceId = priceIdPara(plan, ciclo);
  if (!priceId) {
    return NextResponse.json(
      { error: `Falta configurar el Price ID de Stripe para ${plan}/${ciclo} en las variables de entorno.` },
      { status: 500 }
    );
  }

  // Se confirmó que checkout.session.completed escribe plan_status="active"
  // e igual customer.subscription.updated trata "trialing" como "active",
  // así que el usuario referido queda con acceso completo desde que termina
  // el checkout, sin pagar nada el primer mes. Pro+ queda fuera a propósito
  // (ya no es autoservicio).
  const esReferidoConTrial = esReferido && (plan === "core" || plan === "pro");

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
        ...(esReferidoConTrial ? { trial_period_days: 30 } : {}),
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
