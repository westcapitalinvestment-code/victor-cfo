import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Deshacer una auto-eliminación de cuenta pendiente — mientras esté dentro
// de los 30 días de gracia (migración 0077). Reactiva SOLO lo que el
// flujo de eliminar (app/api/cuenta/eliminar/route.ts) desactivó — marcado
// con deactivated_by_deletion, para no reactivar por error a alguien que
// ya estaba inactivo por otra razón de antes.
export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("users")
    .select("stripe_subscription_id, deletion_scheduled_for")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.deletion_scheduled_for) {
    return NextResponse.json({ error: "No hay ninguna eliminación pendiente que cancelar." }, { status: 400 });
  }

  if (perfil.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.update(perfil.stripe_subscription_id, { cancel_at_period_end: false });
    } catch {
      // Si el período ya terminó y Stripe ya canceló la suscripción de
      // verdad, no hay nada que deshacer ahí — no bloqueamos por eso.
    }
  }

  await admin
    .from("users")
    .update({ deletion_requested_at: null, deletion_scheduled_for: null })
    .eq("id", user.id);

  await admin
    .from("account_members")
    .update({ active: true, deactivated_by_deletion: false })
    .eq("owner_id", user.id)
    .eq("deactivated_by_deletion", true);

  await admin
    .from("technicians")
    .update({ active: true, deactivated_by_deletion: false })
    .eq("owner_id", user.id)
    .eq("deactivated_by_deletion", true);

  return NextResponse.json({ ok: true });
}
