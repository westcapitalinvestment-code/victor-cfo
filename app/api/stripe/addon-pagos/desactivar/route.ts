import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Quita el subscription item del addon Pagos — deja de cobrarse desde la
// próxima factura. No borra contratistas ni retenciones ya registradas,
// solo bloquea el módulo Pagos de nuevo (pagos-portal.tsx vuelve a mostrar
// el mensaje de Add-on). Mismo patrón que /api/stripe/addon-tecnicos/desactivar.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("addon_pagos_item_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.addon_pagos_item_id) {
    await supabase.from("users").update({ addon_pagos_status: "inactivo" }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  try {
    await getStripe().subscriptionItems.del(perfil.addon_pagos_item_id);
  } catch (err) {
    // Si el item ya no existe en Stripe (ej. se quitó a mano desde el
    // Dashboard), igual queremos que la cuenta quede en 'inactivo' — no
    // bloqueamos la desactivación local por un error de Stripe que ya no
    // aplica.
  }

  await supabase
    .from("users")
    .update({ addon_pagos_status: "inactivo", addon_pagos_item_id: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
