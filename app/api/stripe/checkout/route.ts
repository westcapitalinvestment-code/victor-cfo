import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Si lo trajo un socio, hay que saber de qué TIPO es antes de decidir el
  // trial — ver el bloque de abajo (2 oct 2026, migración 0135). Se lee con
  // el cliente admin porque socios no tiene políticas de RLS (a propósito,
  // mismo patrón que referral_rewards).
  const supabaseAdmin = createAdminClient();
  let socioTipo: string | null = null;
  if (perfil?.referido_por_socio_id) {
    const { data: socio } = await supabaseAdmin
      .from("socios")
      .select("tipo")
      .eq("id", perfil.referido_por_socio_id)
      .maybeSingle();
    socioTipo = socio?.tipo ?? null;
  }

  // Referido (30 agosto 2026, ajustado 4 sept 2026 — pedido de Joel: "que
  // los 2 sean iguales"; extendido 5 sept 2026 al Programa de Socios —
  // pedido de Joel: "que reciba su mes gratis... para que vea que es
  // real"). Si a este usuario lo trajo el link de OTRO usuario
  // (referred_by, migración 0031) O el código de un Embajador aprobado
  // (referido_por_socio_id con tipo cpa/influencer/otro, migración 0070),
  // paga el precio NORMAL de Core o Pro, pero con 30 días de trial — mismo
  // mecanismo para los dos planes y los dos programas, sin Price ID aparte
  // ni env vars nuevas.
  //
  // EXCEPCIÓN (2 oct 2026, migración 0135, pedido explícito de Joel: "no
  // quiero ya mes gratis... que entren al link del vendedor y compren como
  // cualquiera con 7 días de prueba"): un referido de un socio tipo
  // 'vendedor' específicamente YA NO recibe el mes gratis — paga como
  // cualquier cliente nuevo, con el trial estándar de 7 días de abajo. El
  // Embajador (cpa/influencer/otro) y el referido peer-to-peer SIGUEN
  // recibiendo los 30 días exactamente igual que siempre; esto solo afecta
  // al tipo 'vendedor'.
  const esReferidoPeerOEmbajador =
    !!perfil?.referred_by || (!!perfil?.referido_por_socio_id && socioTipo !== "vendedor");
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
  const esReferidoConTrial = esReferidoPeerOEmbajador && (plan === "core" || plan === "pro");

  // Trial de 7 días para CUALQUIER primera suscripción (10 sept 2026,
  // pedido de Joel tras comparar con la competencia — Luna Money muestra
  // "FREE for 7 days" como titular antes de pedir pago; nuestra pantalla no
  // mencionaba trial en ningún lado). Se calcula por "primera suscripción"
  // (sin stripe_customer_id todavía), NO por si el usuario ya pagó antes —
  // así un usuario Core existente que sube a Pro desde el paywall NO recibe
  // otro trial (ya es cliente, cobrarle de una vez es lo correcto). Un
  // referido de vendedor (ver arriba) cae aquí igual que cualquier cliente
  // nuevo — 7 días, nunca 30.
  const esPrimeraSuscripcion = !perfil?.stripe_customer_id;
  let trialDias = esReferidoConTrial ? 30 : esPrimeraSuscripcion ? 7 : 0;

  // Crédito de referido pendiente de activación (25 sept 2026, migración
  // 0099) — si este usuario refirió gente mientras estaba en plan gratis y
  // esos referidos ya pagaron, tiene crédito acumulado sin canjear (ver
  // procesarCreditoReferido en el webhook). Se convierte en días extra de
  // trial AQUÍ, en vez de como balance de Stripe, porque hasta este momento
  // no existía stripe_customer_id al cual aplicárselo. Se SUMA al trial que
  // ya tocara (no lo reemplaza) — un referido-con-trial que además trajo
  // gente en su época gratis se lleva los dos beneficios. Usa el cliente
  // admin porque referral_rewards no tiene políticas de RLS (a propósito,
  // ver migración 0062) — mismo patrón que app/dashboard/config/page.tsx.
  // (supabaseAdmin ya se creó arriba para leer el tipo de socio.)
  const { data: creditosPendientes } = await supabaseAdmin
    .from("referral_rewards")
    .select("id, credit_cents")
    .eq("referrer_id", user.id)
    .eq("pendiente_activacion", true)
    .is("redeemed_at", null)
    .gte("expires_at", new Date().toISOString());

  let idsCreditosCanjeados: string[] = [];
  if (creditosPendientes && creditosPendientes.length > 0) {
    const totalCreditoCentavos = creditosPendientes.reduce((sum, c) => sum + Number(c.credit_cents), 0);
    try {
      // El precio mensual real del plan elegido, sin importar si el usuario
      // escogió ciclo anual — un crédito de "un mes" siempre vale un mes,
      // nunca 1/12 de año, para que sea fácil de explicar en el correo.
      const precioMensualId = priceIdPara(plan, "mensual");
      if (precioMensualId) {
        const precioMensual = await getStripe().prices.retrieve(precioMensualId);
        const montoMensual = precioMensual.unit_amount ?? 0;
        if (montoMensual > 0) {
          const mesesGanados = Math.floor(totalCreditoCentavos / montoMensual);
          if (mesesGanados > 0) {
            trialDias += mesesGanados * 30;
            idsCreditosCanjeados = creditosPendientes.map((c) => c.id);
          }
        }
      }
    } catch (err) {
      console.error("No se pudo convertir el crédito de referido pendiente a días de trial:", err);
    }
  }

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";
  const separadorReturn = returnTo.includes("?") ? "&" : "?";
  const separadorCancel = cancelTo.includes("?") ? "&" : "?";

  // Meta Conversions API (22 sept 2026) — se capturan aquí porque este es el
  // único momento en que hay una request real del navegador del usuario de
  // la que leer las cookies _fbp/_fbc y la IP/user-agent reales. Para
  // cuando Stripe llama al webhook de checkout.session.completed, ya no hay
  // navegador — solo el servidor de Stripe — así que sin guardar esto ahora
  // en metadata, el evento de Purchase llegaría a Meta sin poder
  // emparejarse bien con la sesión de anuncio que originó el clic.
  const fbp = req.cookies.get("_fbp")?.value;
  const fbc = req.cookies.get("_fbc")?.value;
  const metaIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
  const metaUa = req.headers.get("user-agent")?.slice(0, 490) || undefined;
  const metaMetadata = {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    ...(metaIp ? { meta_ip: metaIp } : {}),
    ...(metaUa ? { meta_ua: metaUa } : {}),
  };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: perfil?.stripe_customer_id || undefined,
      customer_email: perfil?.stripe_customer_id ? undefined : user.email,
      metadata: { supabase_user_id: user.id, plan, ciclo, ...metaMetadata },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, ciclo },
        ...(trialDias > 0 ? { trial_period_days: trialDias } : {}),
      },
      success_url: `${origin}${returnTo}${separadorReturn}pago=exitoso`,
      cancel_url: `${origin}${cancelTo}${separadorCancel}plan=${plan}&ciclo=${ciclo}`,
      allow_promotion_codes: true,
    });

    // Marcar los créditos pendientes como canjeados AHORA que el checkout
    // se creó de verdad — si la persona abandona el checkout sin pagar, el
    // trial nunca se activa igual (Stripe no confirma nada hasta que hay
    // método de pago real), pero ya gastamos el crédito. Riesgo aceptado a
    // propósito: es el mismo comportamiento que un cupón de un solo uso en
    // cualquier tienda — si lo generas y no lo usas, se perdió. Evita el
    // caso peor (que alguien reintente el checkout una y otra vez sumando
    // el mismo crédito varias veces al trial).
    if (idsCreditosCanjeados.length > 0) {
      await supabaseAdmin
        .from("referral_rewards")
        .update({ redeemed_at: new Date().toISOString() })
        .in("id", idsCreditosCanjeados);
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
      { status: 500 }
    );
  }
}
