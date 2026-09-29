import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Libera (o pierde) el 30% de un cliente ANUAL de vendedor (modelo 70/30,
// migración 0107, 29 sept 2026) — el caso mensual lo resuelve el webhook
// mismo (3er invoice.paid real), pero un cliente anual solo factura UNA
// vez al año, así que no hay un "3er pago" que dispare nada. Joel decidió
// que el hito equivalente para anual es: pasaron 3 meses calendario desde
// el primer pago real Y la suscripción sigue activa en ese momento — este
// cron corre diario y es quien lo verifica, porque nada más lo va a
// disparar solo.
//
// Mismo patrón que los demás crons: header Authorization con CRON_SECRET,
// cliente admin porque recorre TODOS los vendedores sin sesión.
export const maxDuration = 120;

const MESES_PARA_LIBERAR_ANUAL = 3;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  const corteFecha = new Date();
  corteFecha.setUTCMonth(corteFecha.getUTCMonth() - MESES_PARA_LIBERAR_ANUAL);

  const { data: candidatos, error } = await admin
    .from("socios_vendedor_clientes")
    .select("id, socio_id, referred_id, treinta_centavos, primer_pago_at")
    .eq("ciclo", "anual")
    .eq("treinta_estado", "pendiente")
    .lte("primer_pago_at", corteFecha.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidatos || candidatos.length === 0) return NextResponse.json({ ok: true, liberadas: 0, perdidas: 0 });

  let liberadas = 0;
  let perdidas = 0;

  for (const c of candidatos) {
    try {
      const { data: referido } = await admin
        .from("users")
        .select("plan, plan_status, stripe_subscription_id")
        .eq("id", c.referred_id)
        .maybeSingle();

      // Verificación real contra Stripe (no solo el campo local
      // plan_status) — es la fuente de verdad que el negocio pidió
      // explícitamente checar en este momento exacto, no un snapshot que
      // pudo quedar desactualizado si algún webhook falló.
      let activa = false;
      if (referido?.stripe_subscription_id) {
        try {
          const sub = await getStripe().subscriptions.retrieve(referido.stripe_subscription_id);
          activa = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
        } catch {
          activa = false; // suscripción borrada/no encontrada en Stripe = no activa
        }
      }

      if (activa) {
        const { error: errorLiberar } = await admin
          .from("socios_vendedor_clientes")
          .update({ treinta_estado: "liberada", treinta_liberada_at: new Date().toISOString() })
          .eq("id", c.id)
          .eq("treinta_estado", "pendiente");
        if (errorLiberar) throw errorLiberar;

        const { error: errorComision } = await admin.from("socios_comisiones").insert({
          socio_id: c.socio_id,
          referred_id: c.referred_id,
          plan: referido?.plan ?? "pro",
          comision_centavos: c.treinta_centavos,
          tipo_comision: "treinta",
          ciclo_numero: 0,
        });
        if (errorComision) throw errorComision;
        liberadas += 1;
      } else {
        await admin
          .from("socios_vendedor_clientes")
          .update({ treinta_estado: "perdida" })
          .eq("id", c.id)
          .eq("treinta_estado", "pendiente");
        perdidas += 1;
      }
    } catch (err) {
      console.error(`No se pudo procesar el 30% anual del cliente ${c.referred_id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, liberadas, perdidas, total: candidatos.length });
}
