import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

// Fuente única de verdad de los seats que paga una Firma Accountant:
//   seats = clientes aceptados activos (billed_by_firma_id = firma, plan
//           proplus activo) + invitaciones pendientes.
// Lo usan liberar/cancelar invitación (al instante) y el cron de
// reconciliación (red de seguridad). Si llega a 0, se cancela la suscripción
// wholesale de la firma (con prorrateo → crédito en su cuenta de Stripe) para
// que no le sigan cobrando por clientes que ya no tiene; la próxima
// invitación vuelve a pasar por el Checkout (se reutiliza su customer).
export async function sincronizarSeatsFirma(
  admin: SupabaseClient,
  firmaId: string
): Promise<{ seats: number; cancelada: boolean; error?: string }> {
  const { data: firma } = await admin
    .from("users")
    .select("firma_stripe_subscription_id, firma_subscription_item_id, firma_seats_activos")
    .eq("id", firmaId)
    .maybeSingle();

  if (!firma) return { seats: 0, cancelada: false, error: "Firma no encontrada." };

  const [{ count: activos }, { count: pendientes }] = await Promise.all([
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("billed_by_firma_id", firmaId)
      .eq("plan", "proplus")
      .eq("plan_status", "active"),
    admin
      .from("firma_invitaciones")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)
      .eq("status", "pending"),
  ]);

  const seats = (activos ?? 0) + (pendientes ?? 0);

  // Sin suscripción wholesale todavía: nada que sincronizar en Stripe.
  if (!firma.firma_stripe_subscription_id) {
    await admin.from("users").update({ firma_seats_activos: seats }).eq("id", firmaId);
    return { seats, cancelada: false };
  }

  try {
    if (seats === 0) {
      try {
        await getStripe().subscriptions.cancel(firma.firma_stripe_subscription_id, { prorate: true });
      } catch {
        // Ya cancelada o inexistente en Stripe — igual limpiamos nuestro lado.
      }
      await admin
        .from("users")
        .update({ firma_stripe_subscription_id: null, firma_subscription_item_id: null, firma_seats_activos: 0 })
        .eq("id", firmaId);
      return { seats: 0, cancelada: true };
    }

    if (firma.firma_subscription_item_id && (firma.firma_seats_activos ?? 0) !== seats) {
      await getStripe().subscriptionItems.update(firma.firma_subscription_item_id, { quantity: seats });
    }
    await admin.from("users").update({ firma_seats_activos: seats }).eq("id", firmaId);
    return { seats, cancelada: false };
  } catch (err) {
    return { seats, cancelada: false, error: err instanceof Error ? err.message : "Error actualizando Stripe." };
  }
}

// Libera a un cliente de la firma: la firma deja de pagar su seat al instante
// y el cliente conserva Business + sus datos 30 días (gracia) para asumir su
// propio plan. Usado por la firma ("Liberar") y por el propio cliente
// ("Asumir mi plan").
export const DIAS_GRACIA_FIRMA = 30;

export async function liberarClienteDeFirma(
  admin: SupabaseClient,
  clienteId: string,
  firmaId: string
): Promise<{ ok: boolean; graciaHasta?: string; error?: string }> {
  const graciaHasta = new Date(Date.now() + DIAS_GRACIA_FIRMA * 24 * 60 * 60 * 1000).toISOString();

  const { data: actualizados, error } = await admin
    .from("users")
    .update({ billed_by_firma_id: null, firma_gracia_hasta: graciaHasta, firma_liberado_de_id: firmaId })
    .eq("id", clienteId)
    .eq("billed_by_firma_id", firmaId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!actualizados || actualizados.length === 0) {
    return { ok: false, error: "Ese cliente no está bajo el plan de esta firma." };
  }

  const r = await sincronizarSeatsFirma(admin, firmaId);
  if (r.error) console.error("liberarClienteDeFirma: seats no sincronizados:", r.error);
  return { ok: true, graciaHasta };
}
