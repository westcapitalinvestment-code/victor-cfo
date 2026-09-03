import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonEntidadAdicional } from "@/lib/stripe";

// Sincroniza el subscription item de "Entidad adicional" ($24.99/mes c/u,
// migración 0063) con la cantidad real de entidades de negocio ACTIVAS que
// tiene el usuario, menos 1 (la primera va incluida en Pro) — mismo patrón
// que addon-admin/sincronizar: por seat, sin botón activar/desactivar
// aparte, se llama esta ruta después de crear (o en el futuro, archivar)
// una entidad y Stripe se ajusta solo.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_subscription_id, addon_entidades_status, addon_entidades_item_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon de entidades adicionales requiere el plan Pro." }, { status: 400 });
  }

  const { count } = await supabase
    .from("business_entities")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("active", true);

  const seats = Math.max((count ?? 0) - 1, 0);

  if (seats > 0 && (perfil.plan_status !== "active" || !perfil.stripe_subscription_id)) {
    return NextResponse.json({ error: "Necesitas una suscripción de pago activa para activar este addon." }, { status: 400 });
  }

  const statusActual = perfil.addon_entidades_status;
  const itemIdActual = perfil.addon_entidades_item_id;

  try {
    if (seats === 0) {
      if (statusActual === "activo" && itemIdActual) {
        try {
          await getStripe().subscriptionItems.del(itemIdActual);
        } catch {
          // Si ya no existe en Stripe (borrado a mano, etc.) igual limpiamos
          // nuestro lado — no dejar al usuario atascado por un error de Stripe.
        }
      }
      await supabase
        .from("users")
        .update({ addon_entidades_status: "inactivo", addon_entidades_item_id: null, addon_entidades_seats: 0 })
        .eq("id", user.id);
      return NextResponse.json({ ok: true, seats: 0 });
    }

    const priceId = priceIdAddonEntidadAdicional();
    if (!priceId) {
      return NextResponse.json(
        { error: "Falta configurar el Price ID del addon de entidades adicionales en las variables de entorno." },
        { status: 500 }
      );
    }

    if (statusActual === "activo" && itemIdActual) {
      await getStripe().subscriptionItems.update(itemIdActual, { quantity: seats });
      await supabase.from("users").update({ addon_entidades_seats: seats }).eq("id", user.id);
    } else {
      const item = await getStripe().subscriptionItems.create({
        subscription: perfil.stripe_subscription_id!,
        price: priceId,
        quantity: seats,
      });
      await supabase
        .from("users")
        .update({ addon_entidades_status: "activo", addon_entidades_item_id: item.id, addon_entidades_seats: seats })
        .eq("id", user.id);
    }

    return NextResponse.json({ ok: true, seats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo sincronizar el addon en Stripe." },
      { status: 500 }
    );
  }
}
