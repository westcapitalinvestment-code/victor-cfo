import type { SupabaseClient } from "@supabase/supabase-js";
import { plaidClient } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";
import type { Transaction } from "plaid";

export type ResultadoSincronizacion = {
  ok: boolean;
  nuevas: number;
  modificadas: number;
  totalPlaidAdded: number;
  totalPlaidModified: number;
  cuentasNegocioOmitidas: number;
  errores: string[];
};

// La lógica real de sincronizar Plaid para UN usuario — extraída de lo
// que antes vivía solo dentro de app/api/plaid/sync-transactions/route.ts
// para que tanto el botón manual ("Sincronizar transacciones" en Cuentas)
// como el cron nocturno (app/api/cron/sync-all-plaid) llamen exactamente
// el mismo código. Nunca dos implementaciones del mismo sync que se
// puedan desincronizar entre sí — un fix aquí arregla los dos caminos.
//
// El `supabase` que recibe puede ser el cliente normal (con sesión de
// usuario, sujeto a RLS — usado por el botón manual) o el cliente admin
// (service_role, sin sesión — usado por el cron, que corre para todos
// los usuarios a la vez). La función no necesita saber cuál es.
export async function sincronizarPlaidDeUsuario(
  supabase: SupabaseClient,
  ownerId: string,
  esPro: boolean
): Promise<ResultadoSincronizacion> {
  const { data: items, error: itemsError } = await supabase
    .from("plaid_items")
    .select("id, access_token, cursor")
    .eq("owner_id", ownerId)
    .eq("status", "active");

  if (itemsError) {
    return {
      ok: false,
      nuevas: 0,
      modificadas: 0,
      totalPlaidAdded: 0,
      totalPlaidModified: 0,
      cuentasNegocioOmitidas: 0,
      errores: [itemsError.message],
    };
  }
  if (!items || items.length === 0) {
    return {
      ok: true,
      nuevas: 0,
      modificadas: 0,
      totalPlaidAdded: 0,
      totalPlaidModified: 0,
      cuentasNegocioOmitidas: 0,
      errores: [],
    };
  }

  let totalNuevas = 0;
  let totalModificadas = 0;
  let cuentasNegocioOmitidas = 0;
  let totalPlaidAdded = 0;
  let totalPlaidModified = 0;
  const errores: string[] = [];

  for (const item of items) {
    try {
      const accessToken = decryptSecret(item.access_token);

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
      let huboErrorEnEsteItem = false;

      const esDeNegocioYNoEsPro = (accountId: string) => !esPro && negocioPorCuenta.get(accountId) === true;

      const filasNuevas = added
        .filter((t) => {
          const omitida = esDeNegocioYNoEsPro(t.account_id);
          if (omitida) cuentasNegocioOmitidas++;
          return !omitida;
        })
        .map((t) => ({
          owner_id: ownerId,
          entity_id: null,
          plaid_transaction_id: t.transaction_id,
          plaid_account_id: t.account_id,
          description_raw: t.merchant_name || t.name || "Transacción sin descripción",
          amount: t.amount,
          fecha: t.date,
        }));

      if (filasNuevas.length > 0) {
        const { error: upsertError } = await supabase
          .from("transactions")
          .upsert(filasNuevas, { onConflict: "plaid_transaction_id", ignoreDuplicates: true });
        if (upsertError) {
          errores.push(`${item.id}: ${upsertError.message}`);
          huboErrorEnEsteItem = true;
        } else totalNuevas += filasNuevas.length;
      }

      const filasModificadas = modified
        .filter((t) => !esDeNegocioYNoEsPro(t.account_id))
        .map((t) => ({
          owner_id: ownerId,
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
        if (modError) {
          errores.push(`${item.id}: ${modError.message}`);
          huboErrorEnEsteItem = true;
        } else totalModificadas += filasModificadas.length;
      }

      // Solo avanzamos el cursor si de verdad se guardó todo — si no, la
      // próxima vez Plaid no vuelve a mandar esas transacciones (las da
      // por "ya vistas") y se pierden para siempre.
      if (!huboErrorEnEsteItem) {
        await supabase.from("plaid_items").update({ cursor, updated_at: new Date().toISOString() }).eq("id", item.id);
      }
    } catch (err) {
      console.error(`Error sincronizando Plaid (owner ${ownerId}, item ${item.id}):`, err);
      errores.push(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return {
    ok: errores.length === 0,
    nuevas: totalNuevas,
    modificadas: totalModificadas,
    totalPlaidAdded,
    totalPlaidModified,
    cuentasNegocioOmitidas,
    errores,
  };
}
