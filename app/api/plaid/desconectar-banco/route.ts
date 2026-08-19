import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";

// Desconectar un banco por completo — el usuario decide que ya no quiere
// que VICTOR siga leyendo esa cuenta (o, como ahora, para limpiar un
// banco de prueba de Sandbox antes de pasar a producción).
//
// Dos pasos:
//   1. Avisarle a Plaid que revoque el acceso (item/remove) — así el
//      access_token queda inútil también del lado de Plaid, no solo
//      borrado de nuestra base de datos. Si esta llamada falla (banco ya
//      inválido, Item de otro ambiente, etc.) igual seguimos y borramos
//      nuestra copia — lo importante es que el usuario deje de ver ese
//      banco y que nuestro sync deje de intentar tocarlo.
//   2. Borrar la fila de plaid_items — plaid_accounts se borra solo por
//      el ON DELETE CASCADE de la migración 0009. Las transacciones ya
//      importadas NO se tocan (quedan como historial), solo se corta la
//      conexión activa.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const itemId: string | undefined = body?.itemId;

  if (!itemId) {
    return NextResponse.json({ error: "Falta itemId." }, { status: 400 });
  }

  const { data: itemRow, error: itemError } = await supabase
    .from("plaid_items")
    .select("id, access_token, owner_id")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (itemError || !itemRow) {
    return NextResponse.json({ error: "No se encontró esa conexión bancaria." }, { status: 404 });
  }

  try {
    await plaidClient.itemRemove({ access_token: decryptSecret(itemRow.access_token) });
  } catch (err) {
    console.error(`No se pudo revocar el Item en Plaid (item ${itemId}), se borra igual localmente:`, err);
  }

  const { error: deleteError } = await supabase.from("plaid_items").delete().eq("id", itemId).eq("owner_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
