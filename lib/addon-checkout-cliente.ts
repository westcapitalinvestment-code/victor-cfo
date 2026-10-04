import { getStripe } from "@/lib/stripe";

// Checkout de addon para un cliente SIN suscripción propia de Stripe — el
// caso típico (4 oct 2026, migración 0139) es un cliente de Firma
// Accountant: su plan Business lo paga la firma de forma wholesale, así
// que él mismo nunca pasó por Stripe Checkout y no tiene
// stripe_subscription_id propio. Pedido de Joel: "si un addons quiere
// subscribirse debe de llegar a la pagina de Stripe para que ponga su
// info, una vez la coloque se guarda por si quiere añadir otro addon a
// esa cuenta" — en vez de bloquearlo con "necesitas una suscripción de
// pago activa" (el gate que usan los 4 endpoints de addons para todo el
// mundo), se le manda a un Checkout de Stripe que crea una suscripción
// NUEVA y propia de él, solo con el/los addon(s) que está activando.
//
// El webhook (tipo="addon_cliente_sin_plan" en checkout.session.completed)
// guarda esa suscripción como stripe_customer_id/stripe_subscription_id
// DEL CLIENTE — nunca toca nada de la firma — así que la primera vez que
// pasa por aquí deja tarjeta puesta, y cualquier addon SIGUIENTE que
// active ya encuentra stripe_subscription_id y usa el camino normal
// (subscriptionItems.create/update), sin volver a pasar por Stripe.
export async function iniciarCheckoutAddonCliente(params: {
  userId: string;
  userEmail: string;
  stripeCustomerId: string | null;
  items: { priceId: string; quantity: number }[];
  origin: string;
  returnTo: string;
}): Promise<string | null> {
  const { userId, userEmail, stripeCustomerId, items, origin, returnTo } = params;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: items.map((i) => ({ price: i.priceId, quantity: i.quantity })),
    client_reference_id: userId,
    customer: stripeCustomerId || undefined,
    customer_email: stripeCustomerId ? undefined : userEmail,
    metadata: { tipo: "addon_cliente_sin_plan", supabase_user_id: userId },
    subscription_data: { metadata: { tipo: "addon_cliente_sin_plan", supabase_user_id: userId } },
    success_url: `${origin}${returnTo}?addon_pago=exitoso`,
    cancel_url: `${origin}${returnTo}?addon_pago=cancelado`,
  });

  return session.url;
}
