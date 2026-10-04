import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonSecretaria, priceIdAddonAdministrador } from "@/lib/stripe";
import { iniciarCheckoutAddonCliente } from "@/lib/addon-checkout-cliente";

// Sincroniza los subscription items de Admin/Secretaria en Stripe con la
// cantidad real de "seats" en uso — a diferencia del addon Técnicos (precio
// plano hasta 3, on/off), esto es POR SEAT, así que no hay un botón
// "activar/desactivar" aparte: se llama esta ruta después de cualquier
// acción que cambie cuántos admins hay o de qué nivel son (invitar,
// activar/desactivar uno, borrar uno, cambiarle el nivel), y Stripe se
// ajusta solo.
//
// Migración 0056 (2 sept 2026): ahora hay DOS niveles con DOS subscription
// items independientes en la misma suscripción — Secretaria ($10/mes,
// columnas addon_admin_* heredadas de 0054) y Administrador ($20/mes,
// columnas addon_administrador_* nuevas). seats de cada nivel = miembros
// ACTIVOS de ese admin_tier + invitaciones pendientes de ese mismo tier —
// cuentan desde que Joel manda la invitación, no desde que se acepta,
// porque el compromiso de pago es de Joel, no del invitado.
type SeatConfig = {
  nivel: "secretaria" | "administrador";
  statusCol: "addon_admin_status" | "addon_administrador_status";
  itemIdCol: "addon_admin_item_id" | "addon_administrador_item_id";
  seatsCol: "addon_admin_seats" | "addon_administrador_seats";
  priceId: string | null;
};

async function sincronizarNivel(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  perfil: Record<string, any>,
  seats: number,
  cfg: SeatConfig
): Promise<{ error?: string; seats: number }> {
  const statusActual = perfil[cfg.statusCol];
  const itemIdActual = perfil[cfg.itemIdCol];

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
      .update({ [cfg.statusCol]: "inactivo", [cfg.itemIdCol]: null, [cfg.seatsCol]: 0 })
      .eq("id", userId);
    return { seats: 0 };
  }

  if (!cfg.priceId) {
    return { error: `Falta configurar el Price ID del addon ${cfg.nivel} en las variables de entorno.`, seats };
  }

  if (statusActual === "activo" && itemIdActual) {
    await getStripe().subscriptionItems.update(itemIdActual, { quantity: seats });
    await supabase.from("users").update({ [cfg.seatsCol]: seats }).eq("id", userId);
  } else {
    const item = await getStripe().subscriptionItems.create({
      subscription: perfil.stripe_subscription_id,
      price: cfg.priceId,
      quantity: seats,
    });
    await supabase
      .from("users")
      .update({ [cfg.statusCol]: "activo", [cfg.itemIdCol]: item.id, [cfg.seatsCol]: seats })
      .eq("id", userId);
  }
  return { seats };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select(
      "plan, plan_status, stripe_customer_id, stripe_subscription_id, addon_admin_status, addon_admin_item_id, addon_administrador_status, addon_administrador_item_id"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Admin/Secretaria requiere el plan Pro." }, { status: 400 });
  }

  const [{ count: secretariaActivos }, { count: secretariaPendientes }, { count: administradorActivos }, { count: administradorPendientes }] =
    await Promise.all([
      supabase
        .from("account_members")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("role", "admin")
        .eq("active", true)
        .eq("admin_tier", "secretaria"),
      supabase
        .from("admin_invitations")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "pending")
        .eq("admin_tier", "secretaria"),
      supabase
        .from("account_members")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("role", "admin")
        .eq("active", true)
        .eq("admin_tier", "administrador"),
      supabase
        .from("admin_invitations")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "pending")
        .eq("admin_tier", "administrador"),
    ]);

  const seatsSecretaria = (secretariaActivos ?? 0) + (secretariaPendientes ?? 0);
  const seatsAdministrador = (administradorActivos ?? 0) + (administradorPendientes ?? 0);

  // Corrección (4 oct 2026, aclarado por Joel: "el plan Business ya viene
  // con secretaria/adm, tecnicos incluidos"): proplus NUNCA factura
  // Secretaria/Administrador aparte, sin importar cuántos seats reales
  // tenga — se fuerza seats=0 en sincronizarNivel para que, si quedó un
  // subscription item viejo de antes de este fix (o de una prueba),
  // también se borre solo. Solo Pro sigue pagando por seat.
  if (perfil.plan === "proplus") {
    if (perfil.plan_status !== "active") {
      return NextResponse.json({ error: "Necesitas un plan activo." }, { status: 400 });
    }
    await Promise.all([
      sincronizarNivel(supabase, user.id, perfil, 0, {
        nivel: "secretaria",
        statusCol: "addon_admin_status",
        itemIdCol: "addon_admin_item_id",
        seatsCol: "addon_admin_seats",
        priceId: priceIdAddonSecretaria(),
      }),
      sincronizarNivel(supabase, user.id, perfil, 0, {
        nivel: "administrador",
        statusCol: "addon_administrador_status",
        itemIdCol: "addon_administrador_item_id",
        seatsCol: "addon_administrador_seats",
        priceId: priceIdAddonAdministrador(),
      }),
    ]);
    return NextResponse.json({ ok: true, incluido: true });
  }

  if ((seatsSecretaria > 0 || seatsAdministrador > 0) && perfil.plan_status !== "active") {
    return NextResponse.json({ error: "Necesitas un plan activo para activar addons." }, { status: 400 });
  }

  // Excepción (4 oct 2026, pedido de Joel): un cliente de Firma Accountant
  // (migración 0139) es Pro+/activo pero nunca tiene stripe_subscription_id
  // propio — su plan base lo paga la firma. En ese caso, en vez de
  // bloquearlo, se le manda a un Checkout de Stripe para que ponga su
  // tarjeta — con ambos tiers en el mismo checkout si tiene seats de los
  // dos a la vez. Ver lib/addon-checkout-cliente.ts.
  if ((seatsSecretaria > 0 || seatsAdministrador > 0) && !perfil.stripe_subscription_id) {
    const items: { priceId: string; quantity: number }[] = [];

    if (seatsSecretaria > 0) {
      const priceId = priceIdAddonSecretaria();
      if (!priceId) {
        return NextResponse.json(
          { error: "Falta configurar el Price ID del addon Secretaria en las variables de entorno." },
          { status: 500 }
        );
      }
      items.push({ priceId, quantity: seatsSecretaria });
    }

    if (seatsAdministrador > 0) {
      const priceId = priceIdAddonAdministrador();
      if (!priceId) {
        return NextResponse.json(
          { error: "Falta configurar el Price ID del addon Administrador en las variables de entorno." },
          { status: 500 }
        );
      }
      items.push({ priceId, quantity: seatsAdministrador });
    }

    try {
      const checkoutUrl = await iniciarCheckoutAddonCliente({
        userId: user.id,
        userEmail: user.email!,
        stripeCustomerId: perfil.stripe_customer_id ?? null,
        items,
        origin: req.headers.get("origin") || "https://www.victorcfo.com",
        returnTo: "/dashboard/admin",
      });
      return NextResponse.json({ ok: true, requierePago: true, checkoutUrl });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
        { status: 500 }
      );
    }
  }

  try {
    const [resultSecretaria, resultAdministrador] = await Promise.all([
      sincronizarNivel(supabase, user.id, perfil, seatsSecretaria, {
        nivel: "secretaria",
        statusCol: "addon_admin_status",
        itemIdCol: "addon_admin_item_id",
        seatsCol: "addon_admin_seats",
        priceId: priceIdAddonSecretaria(),
      }),
      sincronizarNivel(supabase, user.id, perfil, seatsAdministrador, {
        nivel: "administrador",
        statusCol: "addon_administrador_status",
        itemIdCol: "addon_administrador_item_id",
        seatsCol: "addon_administrador_seats",
        priceId: priceIdAddonAdministrador(),
      }),
    ]);

    if (resultSecretaria.error || resultAdministrador.error) {
      return NextResponse.json({ error: resultSecretaria.error || resultAdministrador.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, seatsSecretaria: resultSecretaria.seats, seatsAdministrador: resultAdministrador.seats });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo sincronizar el addon en Stripe." },
      { status: 500 }
    );
  }
}
