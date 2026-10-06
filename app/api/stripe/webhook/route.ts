import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import {
  getStripe,
  esPlanValido,
  priceIdAddonTecnicos,
  priceIdAddonPagos,
  priceIdAddonSecretaria,
  priceIdAddonAdministrador,
  priceIdAddonEntidadAdicional,
  todosLosPriceIdsDePlanes,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { limiteMensualIaCentavos } from "@/lib/limites-ia";
import { sendReferralCreditEmail, sendReferralCreditoPendienteEmail, sendWelcomeEmail, sendCancellationWinbackEmail, sendPaymentFailedEmail, sendFirmaInvitationEmail } from "@/lib/email";
import { enviarEventoCAPI } from "@/lib/meta-capi";

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
    .select("ciclo_inicio, plan, billed_by_firma_id")
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
  const limiteMensualAnterior = limiteMensualIaCentavos(planAnterior, perfilAnterior?.billed_by_firma_id as string | null | undefined);

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

        // Programa "Firma Accountant" (migración 0139, 4 oct 2026) — la
        // PRIMERA invitación de una Firma dispara este Checkout (ver
        // app/api/firma/invitar/route.ts). Aquí es donde de verdad se activa
        // la suscripción wholesale Y se manda el correo de invitación al
        // cliente — antes de este momento, nunca existió ni suscripción de
        // Stripe ni correo mandado, a propósito (nunca invitar a nadie sin
        // que ya haya un medio de pago real cobrándose).
        if (session.metadata?.tipo === "firma_wholesale") {
          const firmaId = session.metadata?.firma_id;
          const invitacionId = session.metadata?.invitacion_id;
          const subscriptionIdFirma =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

          if (firmaId && subscriptionIdFirma) {
            const subscriptionFirma = await getStripe().subscriptions.retrieve(subscriptionIdFirma);
            const itemFirma = subscriptionFirma.items.data[0]; // un solo line item, quantity=1 en la primera invitación

            await supabase
              .from("users")
              .update({
                firma_stripe_customer_id:
                  typeof session.customer === "string" ? session.customer : session.customer?.id,
                firma_stripe_subscription_id: subscriptionIdFirma,
                firma_subscription_item_id: itemFirma?.id ?? null,
                firma_seats_activos: itemFirma?.quantity ?? 1,
              })
              .eq("id", firmaId);

            if (invitacionId) {
              const { data: invitacion } = await supabase
                .from("firma_invitaciones")
                .select("id, nombre_negocio, email, invitation_token, status")
                .eq("id", invitacionId)
                .maybeSingle();

              const { data: firma } = await supabase.from("users").select("full_name").eq("id", firmaId).maybeSingle();

              // Idempotencia: si Stripe reintenta este evento, status ya no
              // es 'pending' la segunda vez — no se manda el correo dos veces.
              if (invitacion && invitacion.status === "pending") {
                await sendFirmaInvitationEmail({
                  clienteEmail: invitacion.email,
                  nombreNegocio: invitacion.nombre_negocio,
                  firmaName: firma?.full_name ?? null,
                  firmaEmail: session.customer_details?.email || "",
                  invitationToken: String(invitacion.invitation_token),
                });
              }
            }
          }
          break;
        }

        // Addon de un cliente SIN suscripción propia (4 oct 2026, típico de
        // un cliente de Firma Accountant) — ver lib/addon-checkout-cliente.ts
        // para el porqué completo. A diferencia de firma_wholesale (que
        // siempre es un solo line item), aquí puede venir más de un addon a
        // la vez (ej. Secretaria + Administrador juntos), así que en vez de
        // asumir "el primer item" se recorren TODOS los items de la
        // suscripción y se identifica cada uno por su Price ID — más
        // robusto que depender de metadata para saber cuál addon es cuál.
        if (session.metadata?.tipo === "addon_cliente_sin_plan") {
          const clienteId = session.metadata?.supabase_user_id;
          const subscriptionIdCliente =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

          if (clienteId && subscriptionIdCliente) {
            const subscriptionCliente = await getStripe().subscriptions.retrieve(subscriptionIdCliente);

            const priceAAddon: Record<string, { statusCol: string; itemIdCol: string; seatsCol?: string }> = {
              [priceIdAddonTecnicos() || "__none_tecnicos__"]: {
                statusCol: "addon_tecnicos_status",
                itemIdCol: "addon_tecnicos_item_id",
              },
              [priceIdAddonPagos() || "__none_pagos__"]: {
                statusCol: "addon_pagos_status",
                itemIdCol: "addon_pagos_item_id",
              },
              [priceIdAddonSecretaria() || "__none_secretaria__"]: {
                statusCol: "addon_admin_status",
                itemIdCol: "addon_admin_item_id",
                seatsCol: "addon_admin_seats",
              },
              [priceIdAddonAdministrador() || "__none_administrador__"]: {
                statusCol: "addon_administrador_status",
                itemIdCol: "addon_administrador_item_id",
                seatsCol: "addon_administrador_seats",
              },
              [priceIdAddonEntidadAdicional() || "__none_entidades__"]: {
                statusCol: "addon_entidades_status",
                itemIdCol: "addon_entidades_item_id",
                seatsCol: "addon_entidades_seats",
              },
            };

            const datosActualizar: Record<string, unknown> = {
              stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripe_subscription_id: subscriptionIdCliente,
            };

            for (const item of subscriptionCliente.items.data) {
              const priceId = typeof item.price === "string" ? item.price : item.price?.id;
              const cfg = priceId ? priceAAddon[priceId] : undefined;
              if (!cfg) continue;
              datosActualizar[cfg.statusCol] = "activo";
              datosActualizar[cfg.itemIdCol] = item.id;
              if (cfg.seatsCol) datosActualizar[cfg.seatsCol] = item.quantity ?? 1;
            }

            await supabase.from("users").update(datosActualizar).eq("id", clienteId);
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
        // Cliente liberado por su firma que contrata su propio plan (6 oct
        // 2026): termina la gracia — el cron firma-gracia ya no lo baja.
        datosActualizar.firma_gracia_hasta = null;
        datosActualizar.firma_liberado_de_id = null;

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

        const { data: nuevoUsuario } = await supabase
          .from("users")
          .select("email, full_name, plan")
          .eq("id", userId)
          .maybeSingle();

        // Correo de bienvenida (21 sept 2026, pedido de Joel) — el plan que
        // se guardó puede venir de esta misma sesión (metadata.plan) o, si
        // el checkout no lo trajo por lo que sea, del valor que ya tenía el
        // usuario en la tabla. Si el envío falla (ej. RESEND_API_KEY no
        // configurada, o dominio del remitente sin verificar todavía), no
        // tumbamos el webhook — la cuenta ya quedó activa, que es lo que
        // de verdad importa; el correo es un extra, no la fuente de verdad.
        try {
          if (nuevoUsuario?.email) {
            await sendWelcomeEmail({
              toEmail: nuevoUsuario.email,
              toName: nuevoUsuario.full_name,
              plan: (nuevoUsuario.plan as "core" | "pro" | "proplus") ?? "core",
            });
          }
        } catch (err) {
          console.error("No se pudo enviar el correo de bienvenida:", err);
        }

        // Meta Conversions API — evento Purchase (22 sept 2026, pedido de
        // Joel: "lo que haga falta para optimizar y coger más clientes").
        // Este es el momento real de "alguien pagó de verdad" — el pixel del
        // navegador (lib/fbpixel.ts) nunca mandaba esta señal, así que Meta
        // optimizaba la campaña solo por Lead/CompleteRegistration (formulario
        // lleno), no por quién de verdad se convierte en cliente pagando.
        // fbp/fbc/meta_ip/meta_ua vienen de session.metadata, capturados en
        // /api/stripe/checkout justo cuando el usuario hizo clic para pagar
        // (ver ese archivo) — para cuando Stripe llama aquí ya no hay
        // request del navegador de la que leerlos.
        try {
          await enviarEventoCAPI({
            eventName: "Purchase",
            eventId: `purchase_${session.id}`,
            // OJO: este request lo manda Stripe server-a-server, no el
            // navegador — no hay header "origin" real que leer aquí, así
            // que se usa el dominio fijo de producción.
            eventSourceUrl: "https://www.victorcfo.com/onboarding",
            email: nuevoUsuario?.email,
            fbp: session.metadata?.fbp,
            fbc: session.metadata?.fbc,
            clientIp: session.metadata?.meta_ip,
            userAgent: session.metadata?.meta_ua,
            value: (session.amount_total ?? 0) / 100,
            currency: session.currency ?? "usd",
            customData: { plan: nuevoUsuario?.plan ?? plan },
          });
        } catch (err) {
          console.error("No se pudo enviar el evento Purchase a Meta CAPI:", err);
        }
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

        // Aviso de pago fallido (28 sept 2026, pedido de Joel: caso real de
        // un usuario cuyo trial de 7 días terminó, el cobro real falló por
        // fondos insuficientes, y se quedó fuera del dashboard sin saber
        // por qué). Leemos el estado ANTES de pisar la fila, para detectar
        // el momento exacto en que pasa de active→incomplete — no en cada
        // evento con estado incomplete (Stripe reintenta el cobro varias
        // veces y no queremos mandar el correo cada vez).
        const { data: perfilPrevio } = await supabase
          .from("users")
          .select("plan_status, email, full_name, stripe_customer_id, payment_failed_notified_at")
          .eq("id", userId)
          .maybeSingle();

        const datosActualizar: Record<string, unknown> = {
          stripe_subscription_id: subscription.id,
          plan_status,
        };
        if (esPlanValido(plan)) datosActualizar.plan = plan;

        const eraActivo = perfilPrevio?.plan_status === "active";
        const yaAvisado = !!perfilPrevio?.payment_failed_notified_at;

        if (plan_status === "incomplete" && eraActivo && !yaAvisado && perfilPrevio?.stripe_customer_id) {
          try {
            const portalSession = await getStripe().billingPortal.sessions.create({
              customer: perfilPrevio.stripe_customer_id,
              return_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.victorcfo.com"}/dashboard/config`,
            });
            await sendPaymentFailedEmail({
              toEmail: perfilPrevio.email as string,
              toName: (perfilPrevio.full_name as string) ?? null,
              portalUrl: portalSession.url,
            });
            datosActualizar.payment_failed_notified_at = new Date().toISOString();
          } catch (err) {
            console.error("[stripe-webhook] error enviando aviso de pago fallido:", err);
          }
        } else if (plan_status === "active" && yaAvisado) {
          // Se recuperó el pago — limpiamos la marca para que un fallo
          // FUTURO sí vuelva a avisar.
          datosActualizar.payment_failed_notified_at = null;
        }

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

        // Addon Pagos (2 oct 2026, migración 0134): mismo patrón plano que
        // Equipo/Técnicos arriba — reconciliamos con lo que REALMENTE tiene
        // la suscripción en Stripe en cada evento, no solo con lo que hizo
        // /api/stripe/addon-pagos/activar.
        const addonPagosPriceId = priceIdAddonPagos();
        if (addonPagosPriceId) {
          const itemAddonPagos = subscription.items.data.find((it) => it.price.id === addonPagosPriceId);
          datosActualizar.addon_pagos_status = itemAddonPagos ? "activo" : "inactivo";
          datosActualizar.addon_pagos_item_id = itemAddonPagos ? itemAddonPagos.id : null;
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

        // Guardarraíl de idempotencia (27 sept 2026) — Stripe puede
        // reintentar la entrega de este webhook (timeout, 5xx nuestro,
        // etc.). Sin este check, un reintento generaría un SEGUNDO código
        // promo y un SEGUNDO correo de "¿qué pasó?" para la misma
        // cancelación. Si el usuario YA está 'cancelled', no repetimos
        // nada de lo de abajo — solo dejamos que el resto del case corra
        // por si acaso (no hay nada más después).
        const { data: usuarioAntesDeCancelar } = await supabase
          .from("users")
          .select("email, full_name, plan, plan_status, referido_por_socio_id")
          .eq("id", userId)
          .maybeSingle();
        const yaEstabaCancelado = usuarioAntesDeCancelar?.plan_status === "cancelled";

        // cancelled_at (migración 0028) es lo que usa el Dashboard de
        // Operaciones para calcular cancelaciones-del-mes y churn rate —
        // sin esta fecha solo se sabe el estado actual, no cuándo pasó.
        //
        // cancellation_details (migración 0029) es la razón que Stripe le
        // pregunta al usuario en su Cancellation Flow del portal — si no
        // usó ese flow (ej. lo cancelamos nosotros a mano desde Stripe)
        // este campo viene null, así que no siempre va a haber razón.
        //
        // FIX (28 sept 2026, bug real encontrado por Joel con la
        // cancelación de Luis Vélez: Stripe mostraba "too_expensive" en su
        // propio Dashboard pero no llegaba al nuestro) — Stripe tiene DOS
        // campos distintos dentro de cancellation_details: `reason` es el
        // TRIGGER técnico de la cancelación (cancellation_requested,
        // payment_disputed, payment_failed — casi siempre
        // cancellation_requested), y `feedback` es la categoría que el
        // usuario de verdad escogió en el Cancellation Flow (too_expensive,
        // unused, missing_features, etc. — exactamente las llaves de
        // RAZON_CANCELACION_LABEL en dashboard/cfo/page.tsx). Estábamos
        // leyendo `reason` en vez de `feedback`, así que este campo casi
        // siempre venía "cancellation_requested" (que no está en el mapa de
        // labels) o null — nunca la razón real que el usuario marcó.
        const cancelacion = (subscription as any).cancellation_details as
          | { reason?: string | null; feedback?: string | null; comment?: string | null }
          | null
          | undefined;

        // Token de un solo uso para /encuesta-cancelacion (27 sept 2026) —
        // así el link del correo identifica al usuario sin exponer su id
        // real ni pedirle que inicie sesión (la cuenta ya está cancelada).
        // Se genera SIEMPRE que no estuviera ya cancelado, aunque luego el
        // envío del correo falle — no hace daño tener el token guardado.
        const encuestaToken = !yaEstabaCancelado ? randomUUID() : null;

        await supabase
          .from("users")
          .update({
            plan_status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: cancelacion?.feedback ?? null,
            cancellation_comment: cancelacion?.comment ?? null,
            ...(encuestaToken ? { cancellation_survey_token: encuestaToken } : {}),
            // Si se cancela la suscripción entera, el addon Equipo se va
            // con ella — no queda un item huérfano cobrando por su cuenta.
            addon_tecnicos_status: "inactivo",
            addon_tecnicos_item_id: null,
            // Mismo razonamiento para Pagos (2 oct 2026, migración 0134).
            addon_pagos_status: "inactivo",
            addon_pagos_item_id: null,
          })
          .eq("id", userId);

        // Modelo 70/30 de vendedores (migración 0107, 29 sept 2026,
        // reemplaza el clawback de $50 de entrada de la 0106) — si este
        // cliente cancela con su 30% todavía 'pendiente' (no llegó a su 3er
        // pago mensual, o no llegaron los 3 meses calendario del caso
        // anual), ese 30% simplemente nunca se paga: no hay nada que
        // revertir porque nunca se pagó (a diferencia del bono de entrada
        // viejo, que si acababa de pagarse SÍ había que revertir). Solo se
        // marca 'perdida' para que el reporte del founder y el portal del
        // vendedor dejen de mostrarlo como pendiente para siempre — el
        // caso anual con pago ya facturado pero cancelado ANTES de los 3
        // meses también cae aquí; el cron de liberación anual nunca lo va
        // a tocar porque ya no sigue 'pendiente'.
        if (usuarioAntesDeCancelar?.referido_por_socio_id) {
          await supabase
            .from("socios_vendedor_clientes")
            .update({ treinta_estado: "perdida" })
            .eq("referred_id", userId)
            .eq("treinta_estado", "pendiente");
        }

        // Correo de "win-back" al cancelar (27 sept 2026, pedido de Joel:
        // "que de manera automatica como el email de bienvenida se le
        // envia uno si cancelan haciendo unas preguntas para saber la
        // razon y ofrecerle alguna recompenza a ver si vuelve"). La
        // recompensa es un código de promoción REAL de Stripe — no una
        // promesa — creado aquí mismo: un coupon de 100% off "once" (un
        // mes gratis del plan que tenía) más un promotion_code de un solo
        // uso, restringido a este customer específico (nadie más lo puede
        // usar) y válido 30 días. allow_promotion_codes ya está en true
        // en /api/stripe/checkout, así que el código funciona tal cual en
        // la pantalla de pago sin tocar nada más.
        if (!yaEstabaCancelado && usuarioAntesDeCancelar?.email) {
          const DIAS_VALIDEZ_PROMO = 30;
          let promoCode: string | null = null;

          try {
            const stripe = getStripe();
            const customerId =
              typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

            const coupon = await stripe.coupons.create({
              percent_off: 100,
              duration: "once",
              name: "Mes gratis — reactivación",
            });

            // Código legible fijo (27 sept 2026, pedido de Joel: "no me
            // gusta el codigo vuelvexxxxx, mejor ponerle Trial30") — el
            // SDK de Stripe permite reusar el mismo texto de código entre
            // clientes distintos siempre que cada uno esté restringido a
            // un customer específico (customer: customerId abajo), así
            // que TRIAL30 funciona igual para todo el que cancele. Si por
            // lo que sea ESTE customer ya tuviera un TRIAL30 activo sin
            // vencer (ej. canceló, reactivó y volvió a cancelar en menos
            // de 30 días), Stripe rechaza el duplicado y el catch de abajo
            // deja promoCode en null — el correo sale igual, sin código.
            const promo = await stripe.promotionCodes.create({
              promotion: { type: "coupon", coupon: coupon.id },
              code: "TRIAL30",
              customer: customerId,
              max_redemptions: 1,
              expires_at: Math.floor(Date.now() / 1000) + DIAS_VALIDEZ_PROMO * 24 * 60 * 60,
            });
            promoCode = promo.code;
          } catch (err) {
            // Si Stripe falla creando el cupón, el correo igual sale sin
            // código (sendCancellationWinbackEmail lo maneja) — no
            // tumbamos el webhook por esto, la cancelación ya quedó
            // registrada, que es lo que de verdad importa.
            console.error("No se pudo crear el código promo de reactivación:", err);
          }

          try {
            await sendCancellationWinbackEmail({
              toEmail: usuarioAntesDeCancelar.email,
              toName: usuarioAntesDeCancelar.full_name,
              plan: (usuarioAntesDeCancelar.plan as "core" | "pro" | "proplus") ?? "core",
              promoCode,
              diasValidez: DIAS_VALIDEZ_PROMO,
              encuestaToken,
            });
          } catch (err) {
            console.error("No se pudo enviar el correo de cancelación/win-back:", err);
          }
        }
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
          .select("id, full_name, referred_by, referido_por_socio_id, plan, stripe_subscription_id")
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
          await procesarComisionSocio(referido, invoice);
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
  referido: { id: string; full_name: string | null; referred_by: string | null; stripe_subscription_id: string | null }
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
    .select("id, stripe_customer_id, stripe_subscription_id, plan, email, full_name")
    .eq("id", referido.referred_by)
    .maybeSingle();
  if (!referidor) return;
  if (!referido.stripe_subscription_id) return;

  // Si el que refirió nunca ha pagado (plan gratis, sin suscripción real en
  // Stripe), no hay factura a la cual aplicarle un crédito de Stripe — pero
  // en vez de perder el premio (como era antes), se guarda como crédito
  // PENDIENTE: 30 días para que active un plan de pago y ese crédito se le
  // sume como días extra de trial (ver checkout/route.ts y migración 0099,
  // pedido de Joel 25 sept 2026). Necesita tarjeta igual que cualquier
  // suscripción — el "premio" es no pagar hasta que se acabe el trial
  // extendido, no un regalo sin compromiso.
  const esReferidorGratis = !referidor.stripe_customer_id || !referidor.stripe_subscription_id;

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

    if (esReferidorGratis) {
      // Crédito pendiente de activación (25 sept 2026, migración 0099) —
      // nada que tocar en Stripe todavía (no hay customer), se guarda como
      // fila pendiente con 30 días para canjearlo como trial extendido en
      // /api/stripe/checkout.
      const expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from("referral_rewards").insert({
        referrer_id: referidor.id,
        referred_id: referido.id,
        credit_cents: montoCreditoConTope,
        pendiente_activacion: true,
        expires_at: expiraEn.toISOString(),
      });

      if (referidor.email) {
        await sendReferralCreditoPendienteEmail({
          toEmail: referidor.email,
          toName: referidor.full_name,
          referredName: referido.full_name,
          creditoCentavos: montoCreditoConTope,
          expiraEn,
        });
      }
      return;
    }

    await getStripe().customers.createBalanceTransaction(referidor.stripe_customer_id!, {
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
      redeemed_at: new Date().toISOString(),
    });

    // Aviso por correo (8 sept 2026, pedido de Joel) — segundo canal además
    // de la tarjeta visible en Configuración (ReferralLink), porque "mucha
    // gente ni check casi el email" pero de todas formas vale la pena
    // avisar por los dos lados. Solo se manda DESPUÉS de que el crédito ya
    // quedó aplicado de verdad arriba — si el correo falla, no revierte
    // nada ni tumba el webhook, es un aviso, no la fuente de verdad.
    if (referidor.email) {
      await sendReferralCreditEmail({
        toEmail: referidor.email,
        toName: referidor.full_name,
        // Nombre del referido SÍ se menciona aquí a propósito (8 sept 2026,
        // pedido explícito de Joel) — este es el programa peer-to-peer
        // (amigos/conocidos que ya se conocen entre sí, el que refiere ya
        // sabe exactamente a quién le mandó el link), a diferencia del
        // Programa de Socios (comisión en efectivo con CPAs/influencers),
        // que se queda anónimo por ser una relación más profesional/menos
        // personal. Si por lo que sea el referido nunca puso su nombre,
        // cae al genérico "tu referido".
        referredName: referido.full_name,
        creditoCentavos: montoCreditoConTope,
        parcialPorTope: montoCreditoConTope < montoCredito,
      });
    }
  } catch (err) {
    // No relanzamos — perder un crédito de referido no debe tumbar el
    // webhook ni afectar la activación de la cuenta del referido.
    console.error("No se pudo aplicar el crédito de referido:", err);
  }
}

// Comisión del Programa de Socios (CPAs/influencers, migración 0070, 5
// sept 2026 — extendido con el equipo de ventas por comisión pura,
// migración 0106, 29 sept 2026). A diferencia del programa peer-to-peer,
// aquí NO se toca Stripe balance — el pago es efectivo real por
// transferencia/ATH Business que Joel hace a mano por fuera de la app;
// esta función solo deja registrada la comisión como 'pendiente' en
// socios_comisiones para que el Dashboard de Operaciones la muestre y él
// la marque 'pagada' cuando transfiera (ver
// app/api/socios/comisiones/[id]/route.ts).
//
// Ahora hay dos mecánicas completamente distintas bajo el mismo
// socios_comisiones, según el `tipo` del socio (acordado con Joel en el
// documento "Esquema de Comisiones — Equipo de Ventas VICTOR CFO"):
//   - Embajador (cpa/influencer/otro): igual que siempre — monto fijo, UNA
//     sola vez, sin tope anual. $7 si el referido entró a Core, $25 si
//     entró a Pro/Pro+ (aprox. mitad de cada plan, decisión de Joel, 5 sept
//     2026 — no se calcula del precio real de Stripe a propósito, para que
//     el monto no se mueva solo si cambian los precios de los planes).
//   - Vendedor (migración 0135, 2 oct 2026 — ajustado el mismo día tras
//     feedback de Joel: "se mantiene el 70/30 pq me deja cashflow para
//     operar"): el ciclo del cliente decide la mecánica —
//       · MENSUAL: 70% del precio mensual al primer pago real (monto FIJO
//         desde ese momento), + el 30% restante SOLO si el cliente llega
//         vivo a su 3er pago real (mismo modelo 70/30 de la 0107 original
//         — Joel lo quiere así a propósito, porque retener el 30% hasta
//         el 3er mes le da colchón de cashflow si el cliente cancela
//         temprano).
//       · ANUAL: 20% del pago anual completo, pago ÚNICO al primer pago
//         real — no se divide en 70/30 porque un anual ya es el "colchón"
//         en sí mismo (si cancela, no vuelve a cobrar hasta el año
//         siguiente, así que no hace falta retener nada).
//     Ver procesarComisionVendedor abajo y migración 0135 para el detalle
//     completo. Solo aplica a Pro/Business — un vendedor únicamente
//     refiere negocios a esos dos planes, nunca a Core.
const COMISION_SOCIO_CORE_CENTAVOS = 700; // $7.00
const COMISION_SOCIO_PRO_CENTAVOS = 2_500; // $25.00
// Modelo de vendedor vigente desde el 2 oct 2026 (migración 0135) — ver
// comentario arriba: mensual usa PORCENTAJE_SETENTA_VENDEDOR en dos pagos
// (70% + 30% al 3er pago), anual usa PORCENTAJE_ANUAL_VENDEDOR en un pago
// único (20%, nunca se divide).
const PORCENTAJE_SETENTA_VENDEDOR = 0.7;
const PORCENTAJE_ANUAL_VENDEDOR = 0.2;

// Retención Sección 1062.03 sobre las comisiones del vendedor (migración
// 0138, 3 oct 2026, pedido de Joel al armar el equipo de ventas) — mismo
// umbral y misma mecánica MARGINAL que ya usa Pagos para contratistas
// (retencionMarginal() en pagos-portal.tsx): los primeros $500 acumulados
// en el año calendario no retienen nada; de ahí en adelante, 10% completo
// salvo que el vendedor tenga un Certificado de Relevo de SURI vigente
// archivado (relevo_pct de socios, igual que vendors.relevo_pct).
const UMBRAL_DECLARAR_CENTAVOS_VENDEDOR = 50_000; // $500

async function registrarRetencionVendedor(
  admin: ReturnType<typeof createAdminClient>,
  socio: { id: string; relevo_r2_key?: string | null; relevo_pct?: number | null; relevo_fecha_expiracion?: string | null },
  comisionId: string | null,
  grossCentavos: number
) {
  if (grossCentavos <= 0) return;

  const anio = new Date().getFullYear();

  const { data: previas } = await admin
    .from("socios_vendedor_retenciones")
    .select("gross_centavos")
    .eq("socio_id", socio.id)
    .eq("anio", anio);
  const acumuladoPrevio = (previas ?? []).reduce((sum, r) => sum + Number(r.gross_centavos), 0);

  const hoyISO = new Date().toISOString().slice(0, 10);
  const relevoVigente =
    !!socio.relevo_r2_key && (!socio.relevo_fecha_expiracion || socio.relevo_fecha_expiracion >= hoyISO);
  const pct = relevoVigente ? Number(socio.relevo_pct ?? 0) : 10;

  const excesoPrevio = Math.max(0, acumuladoPrevio - UMBRAL_DECLARAR_CENTAVOS_VENDEDOR);
  const excesoNuevo = Math.max(0, acumuladoPrevio + grossCentavos - UMBRAL_DECLARAR_CENTAVOS_VENDEDOR);
  const baseTributableCentavos = excesoNuevo - excesoPrevio;
  const retentionCentavos = pct > 0 ? Math.round(baseTributableCentavos * (pct / 100)) : 0;

  const { error } = await admin.from("socios_vendedor_retenciones").insert({
    socio_id: socio.id,
    comision_id: comisionId,
    anio,
    gross_centavos: grossCentavos,
    retention_pct: pct,
    retention_centavos: retentionCentavos,
  });
  if (error) {
    // No relanzamos — perder el registro de retención no debe tumbar el
    // webhook ni la comisión ya insertada; Joel puede corregirlo a mano si
    // hace falta, pero el pago del vendedor no se bloquea por esto.
    console.error("No se pudo registrar la retención del vendedor:", error);
  }
}

async function procesarComisionSocio(
  referido: {
    id: string;
    referido_por_socio_id: string | null;
    plan: string | null;
    stripe_subscription_id: string | null;
  },
  invoice: Stripe.Invoice
) {
  if (!referido.referido_por_socio_id) return;

  const admin = createAdminClient();

  const { data: socio } = await admin
    .from("socios")
    .select("id, tipo, relevo_r2_key, relevo_pct, relevo_fecha_expiracion")
    .eq("id", referido.referido_por_socio_id)
    .maybeSingle();
  if (!socio) return;

  if (socio.tipo === "vendedor") {
    await procesarComisionVendedor(admin, socio, referido, invoice);
    return;
  }

  // --- Embajador (cpa/influencer/otro): PAUSADO (pedido de Joel, 3 oct
  // 2026) ------------------------------------------------------------
  // Joel decidió apagar la comisión de este track por completo —
  // incluyendo a embajadores/CPAs ya aprobados — mientras lanza el
  // equipo de ventas (vendedor). Razón: si al contador se le paga
  // comisión directa, tiene incentivo a "quedarse" con el cliente en vez
  // de referirlo de verdad (no da lista de clientes, no refiere a nadie,
  // prefiere manejarlo él). El contador ahora solo recibe el Portal CPA
  // gratis (ver app/dashboard/invitar-contable) cuando un cliente lo
  // invita — sin comisión de por medio. El vendedor sigue cobrando su
  // comisión normal (bloque de arriba) por cualquier negocio que él
  // mismo cierre, sea o no cliente de ese contador.
  //
  // El código original que calculaba y guardaba la comisión ($7 Core /
  // $25 Pro) vive en el historial de git si Joel quiere reactivarlo.
}

// Comisión de vendedor — solo Pro/Business; si por lo que sea el referido
// terminó en Core no hay nada que pagar (guardarraíl, no debería pasar en
// la práctica).
//
// El CICLO decide la mecánica (migración 0135, 2 oct 2026 — ver comentario
// arriba de PORCENTAJE_SETENTA_VENDEDOR para el porqué):
//   - MENSUAL → modelo 'setenta_treinta': 70% al primer pago real (esta
//     función, bloque "Primer pago real" abajo), 30% restante al 3er pago
//     real (bloque "Pagos siguientes" al final de la función).
//   - ANUAL → modelo 'unico': 20% del pago anual completo, de una vez, sin
//     nada pendiente después — se resuelve entero en el bloque "Primer
//     pago real".
async function procesarComisionVendedor(
  admin: ReturnType<typeof createAdminClient>,
  socio: { id: string; relevo_r2_key?: string | null; relevo_pct?: number | null; relevo_fecha_expiracion?: string | null },
  referido: { id: string; plan: string | null; stripe_subscription_id: string | null },
  invoice: Stripe.Invoice
) {
  const socioId = socio.id;
  if (referido.plan !== "pro" && referido.plan !== "proplus") return;

  const { data: estadoCliente } = await admin
    .from("socios_vendedor_clientes")
    .select("id, ciclo, modelo, treinta_centavos, pagos_reales_contados, treinta_estado")
    .eq("referred_id", referido.id)
    .maybeSingle();

  // --- Primer pago real: crea la fila + paga la primera comisión ---
  if (!estadoCliente) {
    if (!referido.stripe_subscription_id) return;

    // El intervalo (mensual/anual) y el precio base salen de la
    // suscripción real en Stripe, no del invoice completo (que puede
    // traer addons mezclados) — mismo principio que procesarCreditoReferido
    // arriba: se lee el item que corresponde al PLAN en sí.
    let intervalo: "month" | "year" | null = null;
    let montoBase: number | null = null;
    try {
      const sub = await getStripe().subscriptions.retrieve(referido.stripe_subscription_id);
      const priceIdsDePlanes = new Set(todosLosPriceIdsDePlanes());
      const itemPlan = sub.items.data.find((it) => priceIdsDePlanes.has(it.price.id));
      montoBase = itemPlan?.price.unit_amount ?? null;
      intervalo = (itemPlan?.price.recurring?.interval as "month" | "year" | undefined) ?? null;
    } catch (err) {
      console.error("No se pudo leer la suscripción del referido para la comisión de vendedor:", err);
    }
    if (!montoBase || !intervalo) return;

    if (intervalo === "year") {
      // Anual: 20% de una vez, nada queda pendiente — nace ya 'liberada'.
      const comisionCentavos = Math.round(montoBase * PORCENTAJE_ANUAL_VENDEDOR);

      const { error: errorFila } = await admin.from("socios_vendedor_clientes").insert({
        socio_id: socioId,
        referred_id: referido.id,
        ciclo: "anual",
        modelo: "unico",
        monto_base_centavos: montoBase,
        setenta_centavos: comisionCentavos,
        treinta_centavos: 0,
        pagos_reales_contados: 1,
        treinta_estado: "liberada",
        treinta_liberada_at: new Date().toISOString(),
      });
      if (errorFila) {
        // UNIQUE en referred_id — si Stripe reintentó el mismo evento y
        // otra ejecución ya insertó la fila primero, no relanzamos:
        // simplemente no se paga la comisión dos veces.
        console.error("No se pudo registrar el cliente de vendedor (anual único):", errorFila);
        return;
      }

      const { data: filaComision, error: errorComision } = await admin
        .from("socios_comisiones")
        .insert({
          socio_id: socioId,
          referred_id: referido.id,
          plan: referido.plan ?? "pro",
          comision_centavos: comisionCentavos,
          tipo_comision: "unica",
          ciclo_numero: 0,
        })
        .select("id")
        .single();
      if (errorComision) {
        console.error("No se pudo registrar la comisión única del vendedor:", errorComision);
      } else {
        await registrarRetencionVendedor(admin, socio, filaComision?.id ?? null, comisionCentavos);
      }
      return;
    }

    // Mensual: 70% ahora, 30% queda pendiente para el 3er pago real.
    const setentaCentavos = Math.round(montoBase * PORCENTAJE_SETENTA_VENDEDOR);
    // Resta, no round(30%) — así setenta+treinta siempre suma EXACTO el
    // precio mensual, sin perder ni ganar un centavo por redondeo doble.
    const treintaCentavos = montoBase - setentaCentavos;

    const { error: errorFila } = await admin.from("socios_vendedor_clientes").insert({
      socio_id: socioId,
      referred_id: referido.id,
      ciclo: "mensual",
      modelo: "setenta_treinta",
      monto_base_centavos: montoBase,
      setenta_centavos: setentaCentavos,
      treinta_centavos: treintaCentavos,
      pagos_reales_contados: 1,
    });
    if (errorFila) {
      console.error("No se pudo registrar el cliente de vendedor (70/30):", errorFila);
      return;
    }

    const { data: filaComision70, error: errorComision } = await admin
      .from("socios_comisiones")
      .insert({
        socio_id: socioId,
        referred_id: referido.id,
        plan: referido.plan ?? "pro",
        comision_centavos: setentaCentavos,
        tipo_comision: "setenta",
        ciclo_numero: 0,
      })
      .select("id")
      .single();
    if (errorComision) {
      console.error("No se pudo registrar el 70% del vendedor:", errorComision);
    } else {
      await registrarRetencionVendedor(admin, socio, filaComision70?.id ?? null, setentaCentavos);
    }
    return;
  }

  // --- Pagos siguientes: solo aplica al modelo mensual 70/30 con el 30%
  // todavía pendiente — un cliente anual ('unico') ya quedó resuelto arriba
  // desde el primer pago, así que esta rama nunca se ejecuta para él. ---
  if (estadoCliente.modelo !== "setenta_treinta") return;
  if (estadoCliente.ciclo !== "mensual" || estadoCliente.treinta_estado !== "pendiente") return;

  const pagosContados = (estadoCliente.pagos_reales_contados ?? 1) + 1;
  await admin
    .from("socios_vendedor_clientes")
    .update({ pagos_reales_contados: pagosContados })
    .eq("id", estadoCliente.id);

  const META_PAGOS_PARA_LIBERAR_TREINTA = 3;
  if (pagosContados < META_PAGOS_PARA_LIBERAR_TREINTA) return;

  const { error: errorLiberar } = await admin
    .from("socios_vendedor_clientes")
    .update({ treinta_estado: "liberada", treinta_liberada_at: new Date().toISOString() })
    .eq("id", estadoCliente.id)
    .eq("treinta_estado", "pendiente"); // guardarraíl anti doble-liberación si Stripe reintenta el evento
  if (errorLiberar) {
    console.error("No se pudo marcar liberado el 30% del vendedor:", errorLiberar);
    return;
  }

  const { data: filaComisionTreinta, error: errorComisionTreinta } = await admin
    .from("socios_comisiones")
    .insert({
      socio_id: socioId,
      referred_id: referido.id,
      plan: referido.plan ?? "pro",
      comision_centavos: estadoCliente.treinta_centavos,
      tipo_comision: "treinta",
      ciclo_numero: 0,
    })
    .select("id")
    .single();
  if (errorComisionTreinta) {
    console.error("No se pudo registrar el 30% del vendedor:", errorComisionTreinta);
  } else {
    await registrarRetencionVendedor(admin, socio, filaComisionTreinta?.id ?? null, estadoCliente.treinta_centavos);
  }
}
