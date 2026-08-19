import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";

// Desconectar un banco por completo — el usuario decide que ya no quiere
// que VICTOR siga leyendo esa cuenta.
//
// borrarHistorial (opcional, default false): el frontend le pregunta al
// usuario si además de desconectar quiere borrar las transacciones que
// ya se importaron de ese banco. Por defecto NO se borran (el historial
// financiero tiene valor por sí solo — para taxes, referencia, etc.),
// pero si el usuario pide borrar todo, aquí se hace.
//
// Pasos:
//   1. Guardamos qué plaid_account_id (los de Plaid, no los nuestros)
//      pertenecen a este Item — los necesitamos para poder borrar sus
//      transacciones después, porque transactions.plaid_account_id NO
//      es una relación con llave foránea a plaid_accounts (transactions
//      sobrevive aunque el banco se desconecte, a propósito).
//   2. Avisarle a Plaid que revoque el acceso (item/remove). Si falla
//      (banco ya inválido, Item de otro ambiente, etc.) igual seguimos.
//   3. Borrar la fila de plaid_items — plaid_accounts se borra solo por
//      el ON DELETE CASCADE de la migración 0009.
//   4. Si pidieron borrar historial, borrar las transacciones de esas
//      cuentas.
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
  const borrarHistorial: boolean = body?.borrarHistorial === true;

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

  const { data: cuentasDelItem } = await supabase
    .from("plaid_accounts")
    .select("plaid_account_id")
    .eq("plaid_item_id", itemId);
  const plaidAccountIds = (cuentasDelItem ?? []).map((c) => c.plaid_account_id);

  try {
    await plaidClient.itemRemove({ access_token: decryptSecret(itemRow.access_token) });
  } catch (err) {
    console.error(`No se pudo revocar el Item en Plaid (item ${itemId}), se borra igual localmente:`, err);
  }

  const { error: deleteError } = await supabase.from("plaid_items").delete().eq("id", itemId).eq("owner_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  let transaccionesBorradas = 0;
  if (borrarHistorial && plaidAccountIds.length > 0) {
    const { error: txError, count } = await supabase
      .from("transactions")
      .delete({ count: "exact" })
      .eq("owner_id", user.id)
      .in("plaid_account_id", plaidAccountIds);
    if (txError) {
      return NextResponse.json(
        { ok: true, avisoHistorial: `El banco se desconectó, pero no se pudo borrar el historial: ${txError.message}` },
        { status: 200 }
      );
    }
    transaccionesBorradas = count ?? 0;
  }

  return NextResponse.json({ ok: true, transaccionesBorradas });
}
