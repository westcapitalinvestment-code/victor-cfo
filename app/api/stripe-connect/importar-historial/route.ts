import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { registrarCargoStripe } from "@/lib/stripe-ventas";

// Importa el historial (últimos 12 meses) de cobros de la cuenta de Stripe
// conectada de la entidad, para que las Estadísticas arranquen con datos
// reales sin esperar a las ventas nuevas. Idempotente: se puede correr de
// nuevo sin duplicar (ver lib/stripe-ventas.ts). Tope de 500 cobros por corrida.
export const maxDuration = 60;
const TOPE = 500;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { entityId } = await req.json().catch(() => ({ entityId: null }));
  if (!entityId) return NextResponse.json({ error: "Falta el ID de la entidad." }, { status: 400 });

  // Solo el dueño real de la entidad (configuración financiera sensible).
  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad?.stripe_connect_account_id) {
    return NextResponse.json({ error: "Primero conecta tu cuenta de Stripe." }, { status: 400 });
  }

  const admin = createAdminClient();
  const desde = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
  let creadas = 0;
  let yaExistian = 0;
  let omitidas = 0;
  let revisados = 0;

  try {
    let startingAfter: string | undefined = undefined;
    while (revisados < TOPE) {
      const pagina: any = await getStripe().charges.list(
        {
          limit: 100,
          created: { gte: desde },
          expand: ["data.balance_transaction"],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        { stripeAccount: entidad.stripe_connect_account_id }
      );
      for (const cargo of pagina.data) {
        if (revisados >= TOPE) break;
        revisados++;
        const r = await registrarCargoStripe(admin, entidad.stripe_connect_account_id, cargo, { verificarSesionVictor: false });
        if (r === "creada") creadas++;
        else if (r === "duplicada") yaExistian++;
        else omitidas++;
      }
      if (!pagina.has_more || pagina.data.length === 0) break;
      startingAfter = pagina.data[pagina.data.length - 1].id;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el historial de Stripe.", creadas, yaExistian },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, creadas, yaExistian, omitidas, limitado: revisados >= TOPE });
}
