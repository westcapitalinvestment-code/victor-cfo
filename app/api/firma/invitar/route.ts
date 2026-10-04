import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdWholesaleBusiness } from "@/lib/stripe";
import { sendFirmaInvitationEmail } from "@/lib/email";

// Invita a un cliente nuevo bajo el plan Business wholesale de la Firma
// (migración 0139, 4 oct 2026). Dos caminos, decididos por Joel:
//
//  1. Primera invitación de la Firma (nunca pagó nada todavía): en vez de
//     mandar el correo de una vez, se crea una Stripe Checkout Session en
//     modo suscripción (quantity=1) y se devuelve la URL — el front manda
//     a la Firma a esa URL para que registre su tarjeta. El correo al
//     cliente NO se manda aquí; se manda cuando el webhook confirma
//     checkout.session.completed (ver app/api/stripe/webhook/route.ts),
//     para nunca invitar a nadie sin que exista ya un medio de pago real
//     cobrándose.
//  2. Invitaciones siguientes (ya existe firma_stripe_subscription_id):
//     se sube la cantidad del subscription item en 1 y se manda el correo
//     de una vez — sin volver a pedir tarjeta.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email: string | undefined = body?.email?.trim().toLowerCase();
  const nombreNegocio: string | null = body?.nombreNegocio?.trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Escribe un email válido." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select(
      "es_firma_accountant, full_name, firma_stripe_customer_id, firma_stripe_subscription_id, firma_subscription_item_id, firma_seats_activos"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.es_firma_accountant) {
    return NextResponse.json(
      { error: "Primero tienes que activarte como Firma Accountant." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // No se puede invitar a alguien que ya tiene cuenta en VICTOR CFO — ese
  // caso (mover a un cliente existente bajo wholesale) necesita soporte
  // manual, no este flujo self-serve.
  const { data: yaExiste } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (yaExiste) {
    return NextResponse.json(
      { error: "Ese correo ya tiene una cuenta de VICTOR CFO. Escríbenos a soporte@victorcfo.com para ayudarte con este caso." },
      { status: 409 }
    );
  }

  const { data: invitacion, error: insertError } = await admin
    .from("firma_invitaciones")
    .insert({ firma_id: user.id, nombre_negocio: nombreNegocio, email })
    .select("id, invitation_token")
    .single();

  if (insertError || !invitacion) {
    return NextResponse.json({ error: insertError?.message || "No se pudo crear la invitación." }, { status: 500 });
  }

  // Camino 1 — primera invitación de esta Firma: hay que cobrar antes de
  // invitar a nadie.
  if (!perfil.firma_stripe_subscription_id) {
    const priceId = priceIdWholesaleBusiness();
    if (!priceId) {
      return NextResponse.json(
        { error: "Falta configurar el Price ID wholesale de Business en las variables de entorno." },
        { status: 500 }
      );
    }

    const origin = req.headers.get("origin") || "https://www.victorcfo.com";

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: user.id,
        customer: perfil.firma_stripe_customer_id || undefined,
        customer_email: perfil.firma_stripe_customer_id ? undefined : user.email,
        metadata: { tipo: "firma_wholesale", firma_id: user.id, invitacion_id: invitacion.id },
        subscription_data: { metadata: { tipo: "firma_wholesale", firma_id: user.id } },
        success_url: `${origin}/cpa?firma_checkout=exitoso`,
        cancel_url: `${origin}/cpa?firma_checkout=cancelado`,
      });

      return NextResponse.json({ ok: true, requierePago: true, checkoutUrl: session.url });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
        { status: 500 }
      );
    }
  }

  // Camino 2 — la Firma ya tiene suscripción wholesale activa: solo sube
  // la cantidad y manda el correo de una vez.
  if (!perfil.firma_subscription_item_id) {
    return NextResponse.json(
      { error: "Tu suscripción de Firma Accountant no tiene un item válido — escríbenos a soporte@victorcfo.com." },
      { status: 500 }
    );
  }

  const nuevaCantidad = (perfil.firma_seats_activos ?? 0) + 1;

  try {
    await getStripe().subscriptionItems.update(perfil.firma_subscription_item_id, { quantity: nuevaCantidad });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo actualizar tu suscripción en Stripe." },
      { status: 500 }
    );
  }

  await admin.from("users").update({ firma_seats_activos: nuevaCantidad }).eq("id", user.id);

  const emailResult = await sendFirmaInvitationEmail({
    clienteEmail: email,
    nombreNegocio,
    firmaName: perfil.full_name ?? null,
    firmaEmail: user.email,
    invitationToken: invitacion.invitation_token,
  });

  return NextResponse.json({ ok: true, requierePago: false, emailSent: emailResult.sent, emailReason: emailResult.reason });
}

// Lista de clientes invitados por esta Firma (para pintar el estado en
// /cpa — pendiente/aceptada).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: invitaciones } = await supabase
    .from("firma_invitaciones")
    .select("id, nombre_negocio, email, status, created_at, accepted_at")
    .eq("firma_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ invitaciones: invitaciones ?? [] });
}
