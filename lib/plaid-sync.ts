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
  // Diagnóstico de transactionsRefresh por cada banco conectado — sin
  // esto, si Plaid rechaza el refresh (ej. el banco no lo soporta, o la
  // cuenta todavía no está en el ambiente de producción de Plaid) no hay
  // forma de saberlo desde la pantalla: el botón "Sincronizar" simplemente
  // se ve como si no hubiera pasado nada, sin decir por qué.
  refreshInfo: string[];
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
    .select("id, access_token, cursor, historial_desde")
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
      refreshInfo: [],
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
      refreshInfo: [],
    };
  }

  let totalNuevas = 0;
  let totalModificadas = 0;
  let cuentasNegocioOmitidas = 0;
  let totalPlaidAdded = 0;
  let totalPlaidModified = 0;
  const errores: string[] = [];
  const refreshInfo: string[] = [];

  for (const item of items) {
    try {
      const accessToken = decryptSecret(item.access_token);

      // transactionsSync (más abajo) solo devuelve lo que Plaid YA TIENE en
      // su propia caché — no le pide al banco datos nuevos en ese momento.
      // Plaid refresca esa caché en su propio horario interno, que no
      // necesariamente coincide con cuándo el banco publica una
      // transacción — por eso el usuario podía ver algo en la app de su
      // banco que Victor todavía no mostraba, incluso sincronizando a
      // mano. transactionsRefresh() sí le pide a Plaid ir al banco ahora
      // mismo; Plaid lo hace en segundo plano (no es instantáneo — puede
      // tardar de segundos a ~1 minuto según el banco), así que esta
      // espera corta es solo un "empujón": si el refresh no termina a
      // tiempo, igual sirve para la PRÓXIMA sincronización (manual o el
      // cron de la madrugada), porque ya quedó en marcha del lado de Plaid.
      // No todos los bancos soportan refresh bajo demanda — si Plaid
      // responde con error (ej. PRODUCT_NOT_READY), se ignora y se sigue
      // con transactionsSync normal en vez de tumbar toda la sincronización.
      try {
        await plaidClient.transactionsRefresh({ access_token: accessToken });
        refreshInfo.push(`${item.id}: refresh solicitado a Plaid ok`);
        await new Promise((resolve) => setTimeout(resolve, 4000));
      } catch (refreshErr) {
        // Plaid manda el motivo real (ej. PRODUCT_NOT_READY,
        // ITEM_LOGIN_REQUIRED) en el body de la respuesta del error, no en
        // err.message — sin leer response.data, el mensaje que le llega a
        // Joel en la pantalla sería un genérico "Request failed with
        // status code 400" sin decir nada útil sobre POR QUÉ falló.
        const detalle =
          (refreshErr as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
        const motivo = detalle?.error_code ? `${detalle.error_code} — ${detalle.error_message}` : (refreshErr instanceof Error ? refreshErr.message : "error desconocido");
        refreshInfo.push(`${item.id}: refresh falló (${motivo}) — usando lo que Plaid ya tenía en caché`);
        console.warn(`transactionsRefresh no disponible para item ${item.id}:`, refreshErr);
      }

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
      // Respeta lo que el usuario eligió al conectar este banco: año
      // natural completo, o solo desde el día que lo conectó. Si el Item
      // es de antes de que existiera esta opción (historial_desde null),
      // no filtramos nada — se comporta como siempre.
      const pasaHistorial = (t: Transaction) => !item.historial_desde || t.date >= item.historial_desde;

      const filasNuevas = added
        .filter(pasaHistorial)
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
        .filter(pasaHistorial)
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
    refreshInfo,
  };
}
