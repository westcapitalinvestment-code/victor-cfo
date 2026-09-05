import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, esPlanValido, priceIdAddonTecnicos, todosLosPriceIdsDePlanes } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITES_MENSUALES_CENTAVOS } from "@/lib/limites-ia";

// Rollover de créditos de IA (migración 0064, 3 sept 2026, pedido de Joel:
// "me gustaria que se renueve que no lo pierda pq asi no se siente
// engañado el cliente"). Se llama justo ANTES de sobrescribir
// ciclo_inicio/ciclo_fin del usuario con el ciclo nuevo — mientras
// users.ciclo_inicio TODAVÍA apunta al ciclo que está cerrando.
//
// La pregunta que responde: de lo que el usuario compró en créditos ese
// ciclo, ¿cuánto le sobró sin usar? Como el crédito se suma COMPLETO (sin
// ritmo-parejo) al presupuesto del ciclo, y el presupuesto del PLAN solo
// (sin crédito) termina el ciclo exactamente en su límite mensual completo
// (limiteMensual, porque ritmo-parejo con día=días da presupuesto=límite),
// cualquier gasto del ciclo por ENCIMA del límite del plan solo pudo
// pagarse con crédito. Lo que quede del crédito después de cubrir ese
// exceso es lo que rueda al ciclo nuevo.
async function rodarCreditoAlNuevoCiclo(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  cicloNuevoClave: string
) {
  const { data: perfilAnterior } = await supabase
    .from("users")
    .select("ciclo_inicio, plan")
    .eq("id", userId)
    .maybeSingle();

  const cicloAntiguoClave = perfilAnterior?.ciclo_inicio as string | null | undefined;
  // Sin ciclo anterior (primera activación) o el ciclo "nuevo" es el mismo
  // que ya tenía (ej. Stripe reenvía el mismo evento) — no hay nada que
  // rodar.
  if (!cicloAntiguoClave || cicloAntiguoClave === cicloNuevoClave) return;

  const { data: creditoFila } = await supabase
    .from("creditos_ia_ciclo")
    .select("credito_centavos")
    .eq("owner_id", userId)
    .eq("ciclo_clave", cicloAntiguoClave)
    .maybeSingle();

  const creditoAntiguo = Number(creditoFila?.credito_centavos ?? 0);
  if (creditoAntiguo <= 0) return; // no compró créditos ese ciclo, nada que rodar

  const { data: usoFila } = await supabase
    .from("uso_ia_mensual")
    .select("costo_centavos")
    .eq("owner_id", userId)
    .eq("ciclo_clave", cicloAntiguoClave)
    .maybeSingle();

  const costoFinalCicloAnterior = Number(usoFila?.costo_centavos ?? 0);
  const planAnterior = (perfilAnterior?.plan as string | null) ?? "core";
  const limiteMensualAnterior = LIMITES_MENSUALES_CENTAVOS[planAnterior] ?? LIMITES_MENSUALES_CENTAVOS.core;

  const consumoCredito = Math.min(creditoAntiguo, Math.max(0, costoFinalCicloAnterior - limiteMensualAnterior));
  const remanente = Math.max(0, creditoAntiguo - consumoCredito);
  if (remanente <= 0) return;

  const { data: creditoNuevoFila } = await supabase
    .from("creditos_ia_ciclo")
    .select("credito_centavos")
    .eq("owner_id", userId)
    .eq("ciclo_clave", cicloNuevoClave)
    .maybeSingle();

  await supabase.from("creditos_ia_ciclo").upsert({
    owner_id: userId,
    ciclo_clave: cicloNuevoClave,
    credito_centavos: Number(creditoNuevoFila?.credito_centavos ?? 0) + remanente,
    actualizado_en: new Date().toISOString(),
  });
}

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

        // Créditos de IA (migración 0064, 3 sept 2026) — un checkout de pago
        // ÚNICO (mode: "payment"), NUNCA trae session.subscription, así que
        // se resuelve aparte y por completo antes de tocar la lógica de
        // planes de abajo (esa lógica asume una suscripción).
        if (session.metadata?.tipo === "creditos_ia") {
          const ownerId = session.metadata?.supabase_user_id;
          const cicloClave = session.metadata?.ciclo_clave;
          const creditoCentavos = Number(session.metadata?.credito_centavos);

          if (ownerId && cicloClave && creditoCentavos > 0) {
            // Idempotencia: si Stripe reintenta la entrega de este mismo
            // evento (pasa si nuestra respuesta tarda o falla una vez), el
            // UNIQUE de stripe_checkout_session_id hace que el segundo
            // intento de INSERT falle solo, sin duplicar el crédito.
            const { error: errorCompra } = await supabase.from("creditos_ia_compras").insert({
              owner_id: ownerId,
              ciclo_clave: cicloClave,
              credito_centavos: creditoCentavos,
              precio_pagado_centavos: session.amount_total ?? 0,
              stripe_checkout_session_id: session.id,
            });

            // errorCompra != null casi siempre significa "ya existía" (la
            // unique constraint) — en ese caso NO volvemos a sumar el
            // crédito al saldo, porque ya se sumó la primera vez.
            if (!errorCompra) {
              const { data: saldoActual } = await supabase
                .from("creditos_ia_ciclo")
                .select("credito_centavos")
                .eq("owner_id", ownerId)
                .eq("ciclo_clave", cicloClave)
                .maybeSingle();

              await supabase.from("creditos_ia_ciclo").upsert({
                owner_id: ownerId,
                ciclo_clave: cicloClave,
                credito_centavos: Number(saldoActual?.credito_centavos ?? 0) + creditoCentavos,
                actualizado_en: new Date().toISOString(),
              });
            }
          }
          break;
        }

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
              // Si esta cuenta ya tenía un ciclo anterior con crédito de IA
              // sin gastar (ej. alguien que canceló y vuelve a suscribirse),
              // se rueda antes de pisar ciclo_inicio con el nuevo valor.
              await rodarCreditoAlNuevoCiclo(supabase, userId, ciclo.inicio);
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
          // Este es el punto real donde ocurre una renovación mensual —
          // aquí es donde rodamos el crédito de IA que sobró del ciclo que
          // está cerrando (migración 0064, 3 sept 2026, pedido de Joel: que
          // no se pierda el crédito sin usar).
          await rodarCreditoAlNuevoCiclo(supabase, userId, ciclo.inicio);
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

      // Crédito de referido para el que REFIERE (3 sept 2026, rediseñado 5
      // sept 2026 — decisión de Joel de sesgar el crecimiento hacia Pro).
      // Se dispara con CUALQUIER factura pagada de verdad (amount_paid > 0)
      // de un usuario que tiene referred_by — cubre tanto al que nunca tuvo
      // trial (Core) como al que sí (Pro con los 30 días gratis: Stripe no
      // manda invoice.paid durante el trial, así que este evento solo llega
      // cuando de verdad empieza a cobrar). Esto es lo que hace el
      // programa "autofinanciado": nunca se suelta un crédito sin que el
      // dólar que lo paga ya esté en la cuenta de Stripe primero.
      //
      // Mecánica nueva (asimétrica, a propósito):
      //   - El monto del crédito se calcula del plan del REFERIDO (no del
      //     plan del referidor, como era antes) — si el referido entró a
      //     Pro, el referidor gana un crédito de un mes de Pro completo,
      //     sin importar si el referidor mismo está en Core. El mismo
      //     esfuerzo de compartir un link paga ~3.3x más si el referido es
      //     Pro — empuja a la gente a referir negocios sin forzar nada.
      //   - Tope anual por referidor (protección de caja, no un requisito
      //     contributivo — la retención de la 1062.03 aplica a partir de
      //     $1,500/año, no antes; este tope es más conservador a propósito):
      //     equivalente a la anualidad de SU propio plan.
      //   - Guardarraíl anti-fraude: si el referido es Pro, no se suelta el
      //     crédito hasta que haya evidencia de actividad real de negocio
      //     (al menos una transacción de negocio o una factura creada) —
      //     cierra el hueco de crear una entidad vacía solo para farmear el
      //     crédito. Si todavía no hay actividad, no se registra nada y se
      //     vuelve a intentar en la próxima factura (mes siguiente).
      // referral_rewards (migración 0062) tiene UNIQUE en referred_id —
      // solo se premia la PRIMERA vez que un referido paga, nunca en cada
      // renovación mensual (una vez se registra, no se vuelve a intentar).
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.amount_paid || invoice.amount_paid <= 0) break;

        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        const { data: referido } = await supabase
          .from("users")
          .select("id, referred_by, referido_por_socio_id, plan, stripe_subscription_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        // Ninguno de los dos programas aplica — nada más que hacer.
        if (!referido || (!referido.referred_by && !referido.referido_por_socio_id)) break;

        // Guardarraíl anti-fraude (solo aplica si el REFERIDO es Pro/Pro+):
        // exige evidencia real de negocio antes de soltar CUALQUIER
        // recompensa (crédito peer-to-peer O comisión de socio) — una
        // entidad vacía sin transacciones ni facturas no cuenta. Se calcula
        // una sola vez y se reusa en los dos programas de abajo.
        let hayActividadRealPro = true;
        if (referido.plan === "pro" || referido.plan === "proplus") {
          const [{ count: transaccionesNegocio }, { count: facturas }] = await Promise.all([
            supabase
              .from("transactions")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", referido.id)
              .not("entity_id", "is", null),
            supabase.from("invoices").select("id", { count: "exact", head: true }).eq("owner_id", referido.id),
          ]);
          hayActividadRealPro = (transaccionesNegocio ?? 0) > 0 || (facturas ?? 0) > 0;
        }

        // --- Programa peer-to-peer (crédito en cuenta, migración 0031/0062) ---
        if (referido.referred_by && hayActividadRealPro) {
          await procesarCreditoReferido(supabase, invoice, referido);
        }

        // --- Programa de Socios (comisión en efectivo, migración 0070) ---
        if (referido.referido_por_socio_id && hayActividadRealPro) {
          await procesarComisionSocio(referido);
        }

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

// Crédito de referido para el que REFIERE (3 sept 2026, rediseñado 5 sept
// 2026 — decisión de Joel de sesgar el crecimiento hacia Pro). Se dispara
// con CUALQUIER factura pagada de verdad (amount_paid > 0) de un usuario
// que tiene referred_by — cubre tanto al que nunca tuvo trial (Core) como
// al que sí (Pro con los 30 días gratis: Stripe no manda invoice.paid
// durante el trial, así que este evento solo llega cuando de verdad
// empieza a cobrar). Esto es lo que hace el programa "autofinanciado":
// nunca se suelta un crédito sin que el dólar que lo paga ya esté en la
// cuenta de Stripe primero.
//
// Mecánica (asimétrica, a propósito):
//   - El monto del crédito se calcula del plan del REFERIDO (no del plan
//     del referidor) — si el referido entró a Pro, el referidor gana un
//     crédito de un mes de Pro completo, sin importar si el referidor
//     mismo está en Core. El mismo esfuerzo de compartir un link paga
//     ~3.3x más si el referido es Pro — empuja a la gente a referir
//     negocios sin forzar nada.
//   - Tope anual por referidor (protección de caja, no un requisito
//     contributivo): equivalente a la anualidad de SU propio plan.
// referral_rewards (migración 0062) tiene UNIQUE en referred_id — solo se
// premia la PRIMERA vez que un referido paga, nunca en cada renovación.
async function procesarCreditoReferido(
  supabase: ReturnType<typeof createAdminClient>,
  invoice: Stripe.Invoice,
  referido: { id: string; referred_by: string | null; stripe_subscription_id: string | null }
) {
  if (!referido.referred_by) return;

  const { data: yaPremiado } = await supabase
    .from("referral_rewards")
    .select("id")
    .eq("referred_id", referido.id)
    .maybeSingle();
  if (yaPremiado) return;

  const { data: referidor } = await supabase
    .from("users")
    .select("id, stripe_customer_id, stripe_subscription_id, plan")
    .eq("id", referido.referred_by)
    .maybeSingle();
  // Si el que refirió nunca ha pagado (plan gratis, sin suscripción real en
  // Stripe), no hay factura a la cual aplicarle un crédito — por diseño no
  // se premia en ese caso (ver migración 0031: el descuento de referido
  // siempre fue pensado para "quien ya paga").
  if (!referidor?.stripe_customer_id || !referidor.stripe_subscription_id) return;
  if (!referido.stripe_subscription_id) return;

  try {
    // El monto sale del plan del REFERIDO (no del plan del referidor, como
    // era antes) — mismo principio autofinanciado: se lee directo de su
    // suscripción real en Stripe, nunca hardcodeado, para que siga correcto
    // si los precios cambian.
    const subReferido = await getStripe().subscriptions.retrieve(referido.stripe_subscription_id);
    const priceIdsDePlanes = new Set(todosLosPriceIdsDePlanes());
    const itemPlanReferido = subReferido.items.data.find((it) => priceIdsDePlanes.has(it.price.id));
    const montoBase = itemPlanReferido?.price.unit_amount ?? null;
    if (!montoBase) return;

    // Si el referido paga anual, "un mes gratis" para el referidor es 1/12
    // del precio anual, no el año completo.
    const montoCredito =
      itemPlanReferido?.price.recurring?.interval === "year" ? Math.round(montoBase / 12) : montoBase;

    // Tope anual del referidor — protección de caja, calculado sobre SU
    // propio plan (a más alto el plan del referidor, más margen tiene para
    // acumular). Redondeado a números limpios, no a la anualidad exacta
    // ($179.88/$599.88) — más fácil de comunicar.
    const TOPE_ANUAL_CORE_CENTAVOS = 17_500; // $175/año
    const TOPE_ANUAL_PRO_CENTAVOS = 50_000; // $500/año
    const topeAnual =
      referidor.plan === "pro" || referidor.plan === "proplus" ? TOPE_ANUAL_PRO_CENTAVOS : TOPE_ANUAL_CORE_CENTAVOS;

    const inicioAñoISO = `${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`;
    const { data: creditosEsteAño } = await supabase
      .from("referral_rewards")
      .select("credit_cents")
      .eq("referrer_id", referidor.id)
      .gte("created_at", inicioAñoISO);
    const acumuladoEsteAño = (creditosEsteAño ?? []).reduce((sum, r) => sum + Number(r.credit_cents), 0);

    const montoCreditoConTope = Math.max(0, Math.min(montoCredito, topeAnual - acumuladoEsteAño));
    if (montoCreditoConTope <= 0) return; // tope alcanzado este año — se reintenta cuando el año ruede

    await getStripe().customers.createBalanceTransaction(referidor.stripe_customer_id, {
      amount: -montoCreditoConTope,
      currency: invoice.currency || "usd",
      description:
        montoCreditoConTope < montoCredito
          ? "VICTOR CFO — crédito por referido (parcial, tope anual alcanzado)"
          : "VICTOR CFO — crédito por referido: un colega tuyo empezó a pagar",
    });

    await supabase.from("referral_rewards").insert({
      referrer_id: referidor.id,
      referred_id: referido.id,
      credit_cents: montoCreditoConTope,
    });
  } catch (err) {
    // No relanzamos — perder un crédito de referido no debe tumbar el
    // webhook ni afectar la activación de la cuenta del referido.
    console.error("No se pudo aplicar el crédito de referido:", err);
  }
}

// Comisión del Programa de Socios (CPAs/influencers, migración 0070, 5
// sept 2026). A diferencia del programa peer-to-peer, aquí NO se toca
// Stripe balance — el pago es efectivo real por transferencia/ATH
// Business que Joel hace a mano por fuera de la app; esta función solo deja
// registrada la comisión como 'pendiente' en socios_comisiones para que el
// Dashboard de Operaciones la muestre y él la marque 'pagada' cuando
// transfiera (ver app/api/socios/comisiones/[id]/route.ts).
//
// Montos fijos (no calculados del precio de Stripe, a propósito — para
// efectivo real conviene un número fijo y presupuestable, no algo que se
// mueva solo si cambian los precios de los planes): $7 si el referido
// entró a Core, $25 si entró a Pro/Pro+ — aproximadamente la mitad de cada
// plan (decisión de Joel, 5 sept 2026), deja margen de sobra sobre lo que
// esa factura específica acaba de cobrar (autofinanciado) y mantiene un
// sesgo real hacia Pro (3.57x, similar al 3.3x del programa peer-to-peer).
// UNA sola vez por cliente (socios_comisiones.referred_id es UNIQUE), SIN
// tope anual — a diferencia del peer-to-peer, un socio aprobado es una
// relación de negocio deliberada: "mientras más traiga, más cobra".
const COMISION_SOCIO_CORE_CENTAVOS = 700; // $7.00
const COMISION_SOCIO_PRO_CENTAVOS = 2_500; // $25.00

async function procesarComisionSocio(referido: {
  id: string;
  referido_por_socio_id: string | null;
  plan: string | null;
}) {
  if (!referido.referido_por_socio_id) return;

  const admin = createAdminClient();

  const { data: yaPremiado } = await admin
    .from("socios_comisiones")
    .select("id")
    .eq("referred_id", referido.id)
    .maybeSingle();
  if (yaPremiado) return;

  const comisionCentavos =
    referido.plan === "pro" || referido.plan === "proplus"
      ? COMISION_SOCIO_PRO_CENTAVOS
      : COMISION_SOCIO_CORE_CENTAVOS;

  const { error } = await admin.from("socios_comisiones").insert({
    socio_id: referido.referido_por_socio_id,
    referred_id: referido.id,
    plan: referido.plan ?? "core",
    comision_centavos: comisionCentavos,
  });
  if (error) {
    // No relanzamos — perder una comisión de socio no debe tumbar el
    // webhook ni afectar la activación de la cuenta del referido.
    console.error("No se pudo registrar la comisión de socio:", error);
  }
}
