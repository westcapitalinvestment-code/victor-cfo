import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Abre el Customer Portal de Stripe — una página hospedada por Stripe donde
// el usuario puede cancelar su suscripción, cambiar de tarjeta y ver sus
// recibos, sin que tengamos que construir esa pantalla nosotros. Requiere
// que el Customer Portal esté activado una vez en Stripe Dashboard
// (Settings → Billing → Customer portal) — si no, Stripe devuelve un error
// claro pidiendo configurarlo ahí primero.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Todavía no tienes una suscripción activa que gestionar." },
      { status: 400 }
    );
  }

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: perfil.stripe_customer_id,
      return_url: `${origin}/dashboard/config`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo abrir el portal de Stripe." },
      { status: 500 }
    );
  }
}
