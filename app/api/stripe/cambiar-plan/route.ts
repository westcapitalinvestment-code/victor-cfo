import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  priceIdPara,
  esPlanValido,
  esCicloValido,
  planDesdePriceId,
  todosLosPriceIdsDePlanes,
  priceIdAddonTecnicos,
  priceIdAddonPagos,
  priceIdAddonNomina,
  priceIdAddonSecretaria,
  priceIdAddonAdministrador,
  priceIdAddonEntidadAdicional,
  PLAN_RANK,
  type PlanId,
  type Ciclo,
} from "@/lib/stripe";

// Cambio de plan dentro de la suscripción que el cliente YA tiene (18 oct
// 2026, pedido de Joel: ¿cómo pasa un cliente de Core/Pro a Business?). Antes
// no existía: el checkout siempre creaba una suscripción NUEVA (doble cobro) y
// el portal de Stripe cambiaba el precio sin que la app se enterara.
//
//  - SUBIR de plan (Core→Pro, Pro→Business, Core→Business): inmediato. Se
//    cambia el precio del item del plan en la misma suscripción y Stripe cobra
//    al momento la diferencia prorrateada por los días que quedan del ciclo.
//    Al pasar a Business se quitan los addons que Business ya incluye
//    (Técnicos, Pagos, Nómina, Secretaria, Administrador); "Entidad adicional" sí se
//    queda porque Business no la incluye.
//  - BAJAR de plan: al final del ciclo ya pagado, con una Subscription
//    Schedule (no pierde lo que pagó, sin reembolsos ni créditos).
//  - Cambiar solo de ciclo (mensual↔anual) en el mismo plan: no se ofrece.

type PerfilCambio = {
  plan: string | null;
  plan_status: string | null;
  stripe_subscription_id: string | null;
  billed_by_firma_id: string | null;
};

async function perfilDelUsuario() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, perfil: null as PerfilCambio | null };
  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_subscription_id, billed_by_firma_id")
    .eq("id", user.id)
    .maybeSingle();
  return { user, perfil: (perfil as PerfilCambio | null) ?? null };
}

function idsAddonsQueBusinessIncluye(): Set<string> {
  return new Set(
    [priceIdAddonTecnicos(), priceIdAddonPagos(), priceIdAddonNomina(), priceIdAddonSecretaria(), priceIdAddonAdministrador()].filter(
      (v): v is string => !!v
    )
  );
}

// GET: plan/ciclo reales según Stripe y, si hay una bajada programada, a qué
// plan y cuándo. La pantalla de Config lo usa para mostrar las opciones.
export async function GET() {
  const { user, perfil } = await perfilDelUsuario();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!perfil?.stripe_subscription_id || perfil.billed_by_firma_id) {
    return NextResponse.json({ ok: true, puedeCambiar: false });
  }
  try {
    const sub = await getStripe().subscriptions.retrieve(perfil.stripe_subscription_id);
    const ids = new Set(todosLosPriceIdsDePlanes());
    const itemPlan = sub.items.data.find((it) => ids.has(it.price.id));
    const actual = itemPlan ? planDesdePriceId(itemPlan.price.id) : null;

    let pendiente: { plan: PlanId; ciclo: Ciclo; fecha: string } | null = null;
    const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    if (scheduleId) {
      const schedule = await getStripe().subscriptionSchedules.retrieve(scheduleId);
      const fase2 = schedule.phases?.[1];
      const precioFase2 = fase2?.items
        ?.map((it) => (typeof it.price === "string" ? it.price : it.price?.id))
        .find((p) => p && ids.has(p));
      const destino = precioFase2 ? planDesdePriceId(precioFase2) : null;
      if (destino && fase2?.start_date) {
        pendiente = { ...destino, fecha: new Date(fase2.start_date * 1000).toISOString() };
      }
    }
    return NextResponse.json({
      ok: true,
      puedeCambiar: perfil.plan_status === "active" && !!actual,
      plan: actual?.plan ?? perfil.plan,
      ciclo: actual?.ciclo ?? null,
      pendiente,
      // Qué planes tienen Price configurado para el ciclo actual — si falta
      // alguno (ej. Business todavía sin crear en Stripe), la UI no lo ofrece.
      disponibles: {
        core: !!priceIdPara("core", actual?.ciclo ?? "mensual"),
        pro: !!priceIdPara("pro", actual?.ciclo ?? "mensual"),
        proplus: !!priceIdPara("proplus", actual?.ciclo ?? "mensual"),
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: true, puedeCambiar: false, error: err instanceof Error ? err.message : null });
  }
}

export async function POST(req: NextRequest) {
  const { user, perfil } = await perfilDelUsuario();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const planNuevo = body?.plan;
  const cicloNuevo = body?.ciclo;
  if (!esPlanValido(planNuevo) || !esCicloValido(cicloNuevo)) {
    return NextResponse.json({ error: "Plan o ciclo inválido." }, { status: 400 });
  }

  if (perfil?.billed_by_firma_id) {
    return NextResponse.json(
      { error: "Tu plan lo paga tu contador. Para cambiarlo, primero continúa con tu propio plan desde Configuración." },
      { status: 400 }
    );
  }
  if (!perfil?.stripe_subscription_id || perfil.plan_status !== "active") {
    return NextResponse.json({ error: "No tienes una suscripción activa que cambiar." }, { status: 400 });
  }

  const nuevoPriceId = priceIdPara(planNuevo, cicloNuevo);
  if (!nuevoPriceId) {
    return NextResponse.json({ error: `Falta configurar el precio de ${planNuevo}/${cicloNuevo} en Stripe.` }, { status: 500 });
  }

  const stripe = getStripe();
  try {
    const sub = await stripe.subscriptions.retrieve(perfil.stripe_subscription_id);
    const idsPlanes = new Set(todosLosPriceIdsDePlanes());
    const itemPlan = sub.items.data.find((it) => idsPlanes.has(it.price.id));
    const actual = itemPlan ? planDesdePriceId(itemPlan.price.id) : null;
    if (!itemPlan || !actual) {
      return NextResponse.json({ error: "No se pudo identificar tu plan actual en Stripe." }, { status: 500 });
    }
    if (actual.plan === planNuevo) {
      return NextResponse.json({ error: "Ya tienes ese plan." }, { status: 400 });
    }

    // Si había una bajada programada, se cancela antes de hacer cualquier otro
    // cambio (una suscripción con schedule activo no se puede modificar).
    const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);

    const metadata = { ...(sub.metadata ?? {}), supabase_user_id: user.id, plan: planNuevo, ciclo: cicloNuevo };
    const esSubida = PLAN_RANK[planNuevo] > PLAN_RANK[actual.plan];

    if (esSubida) {
      const idsQuitar = planNuevo === "proplus" ? idsAddonsQueBusinessIncluye() : new Set<string>();
      const items: Stripe.SubscriptionUpdateParams.Item[] = [{ id: itemPlan.id, price: nuevoPriceId }];
      for (const it of sub.items.data) {
        if (idsQuitar.has(it.price.id)) items.push({ id: it.id, deleted: true });
      }
      await stripe.subscriptions.update(sub.id, {
        items,
        metadata,
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });

      const admin = createAdminClient();
      const datos: Record<string, unknown> = { plan: planNuevo };
      if (planNuevo === "proplus") {
        Object.assign(datos, {
          addon_tecnicos_status: "inactivo",
          addon_tecnicos_item_id: null,
          addon_pagos_status: "inactivo",
          addon_pagos_item_id: null,
          addon_nomina_status: "inactivo",
          addon_nomina_item_id: null,
          addon_admin_status: "inactivo",
          addon_admin_item_id: null,
          addon_administrador_status: "inactivo",
          addon_administrador_item_id: null,
        });
      }
      await admin.from("users").update(datos).eq("id", user.id);
      return NextResponse.json({ ok: true, tipo: "subida", plan: planNuevo });
    }

    // Bajada: programada para el final del ciclo ya pagado.
    const entidadId = priceIdAddonEntidadAdicional();
    const itemsFase2: { price: string; quantity?: number }[] = [{ price: nuevoPriceId, quantity: 1 }];
    if (planNuevo === "pro" && cicloNuevo === "mensual" && entidadId) {
      const itemEntidad = sub.items.data.find((it) => it.price.id === entidadId);
      if (itemEntidad) itemsFase2.push({ price: entidadId, quantity: itemEntidad.quantity ?? 1 });
    }

    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
    const fase0 = schedule.phases[0];
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: fase0.items.map((it) => ({
            price: typeof it.price === "string" ? it.price : it.price.id,
            quantity: it.quantity ?? 1,
          })),
          start_date: fase0.start_date,
          end_date: fase0.end_date,
          metadata: { ...(sub.metadata ?? {}), supabase_user_id: user.id },
          proration_behavior: "none",
        },
        {
          items: itemsFase2,
          metadata,
          proration_behavior: "none",
        },
      ],
    });
    return NextResponse.json({
      ok: true,
      tipo: "bajada",
      plan: planNuevo,
      fecha: new Date(fase0.end_date * 1000).toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo cambiar el plan. Intenta de nuevo." },
      { status: 500 }
    );
  }
}

// DELETE: cancela una bajada programada (el cliente se arrepiente).
export async function DELETE() {
  const { user, perfil } = await perfilDelUsuario();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!perfil?.stripe_subscription_id) return NextResponse.json({ error: "Sin suscripción." }, { status: 400 });
  try {
    const sub = await getStripe().subscriptions.retrieve(perfil.stripe_subscription_id);
    const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    if (scheduleId) await getStripe().subscriptionSchedules.release(scheduleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo cancelar el cambio." }, { status: 500 });
  }
}
