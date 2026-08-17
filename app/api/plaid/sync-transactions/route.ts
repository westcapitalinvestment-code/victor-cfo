import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient, plaidConfigurado } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";
import type { Transaction } from "plaid";

// Trae transacciones nuevas/modificadas de TODOS los bancos conectados del
// usuario, usando /transactions/sync (el método incremental que recomienda
// Plaid — cada plaid_items guarda su propio "cursor" para solo pedir lo
// que cambió desde la última vez). Las transacciones entran sin category
// (bandeja de pendientes) — el motor de categorización que ya existe en
// el proyecto las va a clasificar después; esta ruta no inventa categorías.
export async function POST() {
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

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  const { data: items, error: itemsError } = await supabase
    .from("plaid_items")
    .select("id, access_token, cursor")
    .eq("owner_id", user.id)
    .eq("status", "active");

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, nuevas: 0, mensaje: "No hay bancos conectados todavía." });
  }

  let totalNuevas = 0;
  let totalModificadas = 0;
  const errores: string[] = [];

  let cuentasNegocioOmitidas = 0;
  // Contadores de diagnóstico: lo que Plaid mandó de verdad, antes de
  // cualquier filtro nuestro (negocio/Core) o intento de guardar en la
  // base de datos — para poder distinguir "Plaid no tiene nada" de
  // "Plaid sí tiene pero algo falló guardándolo".
  let totalPlaidAdded = 0;
  let totalPlaidModified = 0;

  for (const item of items) {
    try {
      const accessToken = decryptSecret(item.access_token);

      // Cuentas de este Item, para saber cuáles son de negocio — si el
      // usuario es Core, sus transacciones no se guardan (mismo límite
      // que el balance en /dashboard/cuentas). No es perfecto, pero evita
      // que alguien conecte su banco con cuenta de negocio incluida y se
      // salte pagar Pro con solo mirar la app.
      const { data: cuentasDelItem } = await supabase
        .from("plaid_accounts")
        .select("plaid_account_id, es_negocio")
        .eq("plaid_item_id", item.id);
      const negocioPorCuenta = new Map((cuentasDelItem ?? []).map((c) => [c.plaid_account_id, c.es_negocio]));

      let cursor: string | undefined = item.cursor ?? undefined;
      let hasMore = true;
      const added: Transaction[] = [];
      const modified: Transaction[] = [];

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
        });
        added.push(...response.data.added);
        modified.push(...response.data.modified);
        hasMore = response.data.has_more;
        cursor = response.data.next_cursor;
      }

      totalPlaidAdded += added.length;
      totalPlaidModified += modified.length;

      const esDeNegocioYNoEsPro = (accountId: string) => !esPro && negocioPorCuenta.get(accountId) === true;

      const filasNuevas = added
        .filter((t) => {
          const omitida = esDeNegocioYNoEsPro(t.account_id);
          if (omitida) cuentasNegocioOmitidas++;
          return !omitida;
        })
        .map((t) => ({
          owner_id: user.id,
          entity_id: null, // conexión personal
          plaid_transaction_id: t.transaction_id,
          plaid_account_id: t.account_id,
          description_raw: t.merchant_name || t.name || "Transacción sin descripción",
          amount: t.amount, // Plaid: positivo = dinero que sale, igual que la convención ya usada en la app
          fecha: t.date,
        }));

      if (filasNuevas.length > 0) {
        const { error: upsertError } = await supabase
          .from("transactions")
          .upsert(filasNuevas, { onConflict: "plaid_transaction_id", ignoreDuplicates: true });
        if (upsertError) errores.push(`${item.id}: ${upsertError.message}`);
        else totalNuevas += filasNuevas.length;
      }

      const filasModificadas = modified
        .filter((t) => !esDeNegocioYNoEsPro(t.account_id))
        .map((t) => ({
          owner_id: user.id,
          plaid_transaction_id: t.transaction_id,
          plaid_account_id: t.account_id,
          description_raw: t.merchant_name || t.name || "Transacción sin descripción",
          amount: t.amount,
          fecha: t.date,
        }));

      if (filasModificadas.length > 0) {
        const { error: modError } = await supabase
          .from("transactions")
          .upsert(filasModificadas, { onConflict: "plaid_transaction_id" });
        if (modError) errores.push(`${item.id}: ${modError.message}`);
        else totalModificadas += filasModificadas.length;
      }

      await supabase.from("plaid_items").update({ cursor, updated_at: new Date().toISOString() }).eq("id", item.id);
    } catch (err) {
      console.error("Error sincronizando transacciones de Plaid:", err);
      errores.push(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return NextResponse.json({
    ok: errores.length === 0,
    nuevas: totalNuevas,
    modificadas: totalModificadas,
    totalPlaidAdded,
    totalPlaidModified,
    cuentasNegocioOmitidas,
    errores,
  });
}
