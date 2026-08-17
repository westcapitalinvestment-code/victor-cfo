import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient, plaidConfigurado, pareceCuentaDeNegocio } from "@/lib/plaid";
import { encryptSecret } from "@/lib/crypto";

// Segundo paso: el frontend termina el flujo de Plaid Link con un
// public_token de un solo uso — aquí lo cambiamos por el access_token real
// (el que sí sirve para pedir transacciones/balances después) y lo
// guardamos. El access_token NUNCA vuelve al navegador desde aquí.
export async function POST(req: NextRequest) {
  if (!plaidConfigurado()) {
    return NextResponse.json({ error: "Plaid no está configurado todavía." }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const publicToken: string | undefined = body?.publicToken;
  const institutionId: string | null = body?.institutionId ?? null;
  const institutionName: string | null = body?.institutionName ?? null;

  if (!publicToken) {
    return NextResponse.json({ error: "Falta el public_token de Plaid." }, { status: 400 });
  }

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const plaidItemId = exchange.data.item_id;

    const { data: itemRow, error: itemError } = await supabase
      .from("plaid_items")
      .insert({
        owner_id: user.id,
        entity_id: null, // conexión personal — igual convención que goals/documents
        plaid_item_id: plaidItemId,
        access_token: encryptSecret(accessToken), // nunca se guarda en texto plano
        institution_id: institutionId,
        institution_name: institutionName,
      })
      .select("id")
      .single();

    if (itemError || !itemRow) {
      return NextResponse.json({ error: itemError?.message || "No se pudo guardar la conexión." }, { status: 500 });
    }

    // Traemos las cuentas (checking, savings, etc.) de este Item de una vez,
    // así el usuario ve algo real apenas termina de conectar el banco.
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });

    const accountRows = accountsResponse.data.accounts.map((acc) => ({
      plaid_item_id: itemRow.id,
      owner_id: user.id,
      plaid_account_id: acc.account_id,
      name: acc.name,
      official_name: acc.official_name,
      mask: acc.mask,
      type: acc.type,
      subtype: acc.subtype,
      current_balance: acc.balances.current,
      available_balance: acc.balances.available,
      iso_currency_code: acc.balances.iso_currency_code || "USD",
      es_negocio: pareceCuentaDeNegocio(acc.name, acc.official_name, acc.subtype),
    }));

    if (accountRows.length > 0) {
      const { error: accountsError } = await supabase.from("plaid_accounts").insert(accountRows);
      if (accountsError) {
        // La conexión ya quedó guardada — esto no debe tumbar la respuesta,
        // pero sí avisamos para poder investigarlo.
        console.error("No se pudieron guardar las cuentas de Plaid:", accountsError);
      }
    }

    return NextResponse.json({ ok: true, itemId: itemRow.id, cuentas: accountRows.length });
  } catch (err) {
    console.error("Error en el exchange de Plaid:", err);
    return NextResponse.json({ error: "No se pudo completar la conexión con el banco." }, { status: 502 });
  }
}
