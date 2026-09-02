import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Quita el subscription item del addon Equipo — deja de cobrarse desde la
// próxima factura. No borra los técnicos existentes ni sus facturas, solo
// bloquea crear técnicos nuevos / asignar más (equipo-portal.tsx y los
// formularios de Factura/Cotización vuelven a mostrar el mensaje de
// Add-on).
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("addon_tecnicos_item_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.addon_tecnicos_item_id) {
    await supabase.from("users").update({ addon_tecnicos_status: "inactivo" }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  try {
    await getStripe().subscriptionItems.del(perfil.addon_tecnicos_item_id);
  } catch (err) {
    // Si el item ya no existe en Stripe (ej. se quitó a mano desde el
    // Dashboard), igual queremos que la cuenta quede en 'inactivo' — no
    // bloqueamos la desactivación local por un error de Stripe que ya no
    // aplica.
  }

  await supabase
    .from("users")
    .update({ addon_tecnicos_status: "inactivo", addon_tecnicos_item_id: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
