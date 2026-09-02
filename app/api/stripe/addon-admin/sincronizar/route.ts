import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonAdmin } from "@/lib/stripe";

// Sincroniza la cantidad del subscription item de Admin/Secretaria en
// Stripe con la cantidad real de "seats" en uso — a diferencia del addon
// Técnicos (precio plano hasta 3, on/off), este es POR SEAT ($10/mes cada
// uno), así que no hay un botón "activar/desactivar" aparte: se llama esta
// ruta después de cualquier acción que cambie cuántos admins hay
// (invitar, activar/desactivar uno, borrar uno), y Stripe se ajusta solo.
//
// seats = admins ACTIVOS (account_members role='admin' active=true) +
// invitaciones pendientes SIN aceptar todavía (admin_invitations
// status='pending') — cuentan desde que Joel las manda, no desde que se
// aceptan, porque el compromiso de pago es de Joel, no del invitado.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_subscription_id, addon_admin_status, addon_admin_item_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Admin/Secretaria requiere el plan Pro." }, { status: 400 });
  }

  const [{ count: activosCount }, { count: pendientesCount }] = await Promise.all([
    supabase
      .from("account_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("role", "admin")
      .eq("active", true),
    supabase
      .from("admin_invitations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("status", "pending"),
  ]);

  const seats = (activosCount ?? 0) + (pendientesCount ?? 0);

  // Sin seats: si había addon activo, se apaga (borra el subscription item).
  if (seats === 0) {
    if (perfil.addon_admin_status === "activo" && perfil.addon_admin_item_id) {
      try {
        await getStripe().subscriptionItems.del(perfil.addon_admin_item_id);
      } catch {
        // Si ya no existe en Stripe (borrado a mano, etc.) igual limpiamos
        // nuestro lado — no dejar al usuario atascado por un error de Stripe.
      }
    }
    await supabase
      .from("users")
      .update({ addon_admin_status: "inactivo", addon_admin_item_id: null, addon_admin_seats: 0 })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, seats: 0 });
  }

  if (perfil.plan_status !== "active" || !perfil.stripe_subscription_id) {
    return NextResponse.json({ error: "Necesitas una suscripción de pago activa para activar addons." }, { status: 400 });
  }

  const priceId = priceIdAddonAdmin();
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el Price ID del addon Admin/Secretaria en las variables de entorno." },
      { status: 500 }
    );
  }

  try {
    if (perfil.addon_admin_status === "activo" && perfil.addon_admin_item_id) {
      await getStripe().subscriptionItems.update(perfil.addon_admin_item_id, { quantity: seats });
      await supabase.from("users").update({ addon_admin_seats: seats }).eq("id", user.id);
    } else {
      const item = await getStripe().subscriptionItems.create({
        subscription: perfil.stripe_subscription_id,
        price: priceId,
        quantity: seats,
      });
      await supabase
        .from("users")
        .update({ addon_admin_status: "activo", addon_admin_item_id: item.id, addon_admin_seats: seats })
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
