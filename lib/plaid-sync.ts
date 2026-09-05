import type { SupabaseClient } from "@supabase/supabase-js";
import { plaidClient } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";
import { fechaHoyPR } from "@/lib/hora-pr";
import type { Transaction } from "plaid";

export type ResultadoSincronizacion = {
  ok: boolean;
  nuevas: number;
  modificadas: number;
  eliminadas: number;
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
      eliminadas: 0,
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
      eliminadas: 0,
      totalPlaidAdded: 0,
      totalPlaidModified: 0,
      cuentasNegocioOmitidas: 0,
      errores: [],
      refreshInfo: [],
    };
  }

  let totalNuevas = 0;
  let totalModificadas = 0;
  let totalEliminadas = 0;
  let cuentasNegocioOmitidas = 0;
  let totalPlaidAdded = 0;
  let totalPlaidModified = 0;
  const errores: string[] = [];
  const refreshInfo: string[] = [];

  // Tope diario de transactionsRefresh, por PLAN (4 sept 2026, pedido de
  // Joel — ver migración 0067). Core NUNCA fuerza refresh: solo usa
  // transactionsSync (lo que Plaid ya tiene en su propia caché, gratis).
  // Pro tiene un cupo diario: 2/día base (cubre las 2 corridas del cron
  // nocturno) + 2/día extra por cada entidad de negocio adicional que paga
  // ($24.99/mes c/u — users.addon_entidades_seats, migración 0063). El
  // contador se gasta UNA vez por llamada a esta función, sin importar
  // cuántos bancos tenga conectados el usuario — una sincronización con 3
  // bancos gasta 1 del cupo, no 3.
  let puedeRefrescarHoy = false;
  if (esPro) {
    const hoy = fechaHoyPR();
    const { data: cfgUsuario } = await supabase
      .from("users")
      .select("addon_entidades_seats, plaid_refresh_count, plaid_refresh_count_fecha")
      .eq("id", ownerId)
      .maybeSingle();
    const contadorHoy = cfgUsuario?.plaid_refresh_count_fecha === hoy ? (cfgUsuario?.plaid_refresh_count ?? 0) : 0;
    const limiteHoy = 2 + 2 * (cfgUsuario?.addon_entidades_seats ?? 0);
    puedeRefrescarHoy = contadorHoy < limiteHoy;
    if (puedeRefrescarHoy) {
      await supabase
        .from("users")
        .update({ plaid_refresh_count: contadorHoy + 1, plaid_refresh_count_fecha: hoy })
        .eq("id", ownerId);
    } else {
      refreshInfo.push(
        `Límite diario de actualizaciones en vivo alcanzado (${limiteHoy}/día) — usando lo último que Plaid ya tenía en caché. Se resetea mañana.`
      );
    }
  } else {
    refreshInfo.push("Plan Core: sincronización con transactionsSync (gratis), sin refresh en vivo.");
  }

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
      if (puedeRefrescarHoy) {
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
      }

      // BUG REAL (4 sept 2026, reportado por Joel): el balance de cada cuenta
      // se guardaba UNA sola vez, el día que se conectó el banco
      // (exchange-token/route.ts) — este sync nunca lo volvía a pedir, así
      // que quedaba congelado para siempre sin importar cuántas
      // transacciones entraran o salieran después. accountsGet es parte del
      // producto Transactions (viene en el mismo CSV de la cuenta en el
      // dashboard de Plaid) — no es el endpoint de Balance en vivo que sí
      // se cobra aparte, así que se pide en cada sync sin restricción de
      // cuota (a diferencia de transactionsRefresh más arriba). No tumba la
      // sincronización si falla — el balance viejo se queda como estaba.
      try {
        const cuentasActualizadas = await plaidClient.accountsGet({ access_token: accessToken });
        for (const acc of cuentasActualizadas.data.accounts) {
          await supabase
            .from("plaid_accounts")
            .update({
              current_balance: acc.balances.current,
              available_balance: acc.balances.available,
            })
            .eq("plaid_item_id", item.id)
            .eq("plaid_account_id", acc.account_id);
        }
      } catch (balanceErr) {
        console.warn(`No se pudo actualizar balance (item ${item.id}):`, balanceErr);
      }

      const { data: cuentasDelItem } = await supabase
        .from("plaid_accounts")
        .select("plaid_account_id, es_negocio, entity_id, name, nickname")
        .eq("plaid_item_id", item.id);
      const negocioPorCuenta = new Map((cuentasDelItem ?? []).map((c) => [c.plaid_account_id, c.es_negocio]));
      // BUG REAL (1 sept 2026, reportado por Joel): su login de BPPR trae
      // cuentas personales y de negocio juntas bajo un mismo Item. Antes,
      // entity_id se guardaba NULL sin importar nada — eso equivale a
      // "Personal" en el resto de la app (ver gastos/page.tsx, que filtra
      // transacciones con .is("entity_id", null)), así que las
      // transacciones de la cuenta de negocio terminaban mezcladas con
      // Personal en vez de quedar bajo su entidad. Ahora se resuelve por
      // cuenta, usando la asignación que el usuario hace en /dashboard/cuentas
      // (columna plaid_accounts.entity_id, migración 0040).
      const entidadPorCuenta = new Map((cuentasDelItem ?? []).map((c) => [c.plaid_account_id, c.entity_id]));

      let cursor: string | undefined = item.cursor ?? undefined;
      let hasMore = true;
      const added: Transaction[] = [];
      const modified: Transaction[] = [];
      const removed: { transaction_id: string }[] = [];

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
        });
        added.push(...response.data.added);
        modified.push(...response.data.modified);
        removed.push(...response.data.removed);
        hasMore = response.data.has_more;
        cursor = response.data.next_cursor;
      }

      totalPlaidAdded += added.length;
      totalPlaidModified += modified.length;
      let huboErrorEnEsteItem = false;

      // Diagnóstico por cuenta (1 sept 2026, caso real de Joel: Flexicuenta
      // de Negocios tiene actividad real y pesada — nómina, pagos — pero
      // transactionsSync le devolvía 0 "added" para esa cuenta puntual
      // mientras sus hermanas del mismo Item (mismo cursor) sí traían
      // datos. Sin esto no había forma de saber, sin acceso a los logs de
      // Vercel, si el hueco viene de Plaid (no manda nada para esa cuenta)
      // o de un filtro nuestro — ahora queda visible en el mensaje de
      // "Sincronizar" mismo.
      const nombrePorCuentaId = new Map(
        (cuentasDelItem ?? []).map((c) => [c.plaid_account_id, c.nickname || c.name || c.plaid_account_id.slice(-6)])
      );
      if (cuentasDelItem && cuentasDelItem.length > 1) {
        const conteoPorCuenta = new Map<string, number>();
        for (const c of cuentasDelItem) conteoPorCuenta.set(c.plaid_account_id, 0);
        for (const t of added) conteoPorCuenta.set(t.account_id, (conteoPorCuenta.get(t.account_id) ?? 0) + 1);
        const desglose = Array.from(conteoPorCuenta.entries())
          .map(([accId, n]) => `${nombrePorCuentaId.get(accId) ?? accId}: ${n}`)
          .join(", ");
        refreshInfo.push(`${item.id}: Plaid trajo ${added.length} nueva(s) en total — por cuenta: ${desglose}`);
      }

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
          entity_id: entidadPorCuenta.get(t.account_id) ?? null,
          plaid_transaction_id: t.transaction_id,
          plaid_account_id: t.account_id,
          description_raw: t.merchant_name || t.name || "Transacción sin descripción",
          amount: t.amount,
          fecha: t.date,
          // Plaid manda esto en cada transacción — mientras es true, el
          // banco todavía puede corregir descripción/monto/fecha más
          // adelante (llega otra vez, pero dentro de "modified", nunca
          // como una fila nueva). Ver nota grande más abajo sobre por qué
          // esto importa.
          pending: t.pending ?? false,
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

      const modificadasFiltradas = modified
        .filter(pasaHistorial)
        .filter((t) => !esDeNegocioYNoEsPro(t.account_id));

      // AUDITORÍA (bug real, 22 agosto 2026): un "modified" de Plaid casi
      // siempre significa que un cargo PENDIENTE (descripción/monto
      // estimados, ej. "AUTOMATIC PAYMENT - THANK YOU" $179) se acaba de
      // liquidar con su descripción/monto reales (ej. "MOHELA" $26.07) —
      // mismo transaction_id, contenido distinto. Antes esto se sobreescribía
      // en la misma fila sin dejar rastro: si VICTOR o el usuario ya habían
      // visto/categorizado la versión vieja, desaparecía sin explicación.
      // Ahora, antes de sobrescribir, se compara contra lo que había ANTES
      // en la base de datos y, si algo visible cambió de verdad, se guarda
      // el "antes vs. después" en transaction_sync_log — así queda un
      // historial real en vez de una mutación silenciosa. No bloquea el
      // upsert si este paso falla (el log es para auditar, no para decidir
      // si la transacción se guarda).
      if (modificadasFiltradas.length > 0) {
        const idsPlaid = modificadasFiltradas.map((t) => t.transaction_id);
        const { data: existentes } = await supabase
          .from("transactions")
          .select("id, plaid_transaction_id, description_raw, amount, fecha, pending")
          .eq("owner_id", ownerId)
          .in("plaid_transaction_id", idsPlaid);

        const existentesPorId = new Map((existentes ?? []).map((e) => [e.plaid_transaction_id, e]));

        const logsDeCambio = modificadasFiltradas
          .map((t) => {
            const anterior = existentesPorId.get(t.transaction_id);
            if (!anterior) return null; // no estaba antes — no hay "antes" que auditar
            const descripcionNueva = t.merchant_name || t.name || "Transacción sin descripción";
            const pendingNuevo = t.pending ?? false;
            const cambioAlgo =
              anterior.description_raw !== descripcionNueva ||
              Number(anterior.amount) !== t.amount ||
              anterior.fecha !== t.date ||
              anterior.pending !== pendingNuevo;
            if (!cambioAlgo) return null;
            return {
              owner_id: ownerId,
              transaction_id: anterior.id,
              plaid_transaction_id: t.transaction_id,
              descripcion_anterior: anterior.description_raw,
              descripcion_nueva: descripcionNueva,
              monto_anterior: anterior.amount,
              monto_nuevo: t.amount,
              fecha_anterior: anterior.fecha,
              fecha_nueva: t.date,
              pending_anterior: anterior.pending,
              pending_nuevo: pendingNuevo,
            };
          })
          .filter((log): log is NonNullable<typeof log> => log !== null);

        if (logsDeCambio.length > 0) {
          const { error: logError } = await supabase.from("transaction_sync_log").insert(logsDeCambio);
          if (logError) console.warn(`No se pudo guardar el historial de cambios (item ${item.id}):`, logError.message);
        }
      }

      const filasModificadas = modificadasFiltradas.map((t) => ({
        owner_id: ownerId,
        plaid_transaction_id: t.transaction_id,
        plaid_account_id: t.account_id,
        description_raw: t.merchant_name || t.name || "Transacción sin descripción",
        amount: t.amount,
        fecha: t.date,
        pending: t.pending ?? false,
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

      // BUG REAL (23 agosto 2026, reportado por Joel): transactionsSync manda
      // un tercer array además de added/modified — `removed` — que nunca se
      // procesaba. Cuando un cargo pendiente se liquida, muchos bancos (vía
      // Plaid) no lo actualizan in-place: BORRAN el transaction_id pendiente
      // y AÑADEN uno nuevo para la versión ya posteada, con descripción/monto
      // ligeramente distintos ("Ahorro Directo" pendiente → "AHORRO DIRECTO
      // DE 084293853" posteado). Sin leer `removed`, la fila vieja se quedaba
      // huérfana en `transactions` (ya categorizada, invisible pero todavía
      // sumando en reportes) mientras la fila nueva aparecía en "sin
      // categorizar" como si fuera una transacción distinta — el usuario veía
      // algo "ya categorizado" pidiendo categorizarse otra vez. Esto no tiene
      // nada que ver con transactionsRefresh (que solo le pide a Plaid ir a
      // buscar datos nuevos al banco) — es un bug de no vaciar lo que Plaid
      // ya nos había dicho que boráramos.
      if (removed.length > 0) {
        const idsEliminados = removed.map((r) => r.transaction_id);
        const { error: deleteError, count } = await supabase
          .from("transactions")
          .delete({ count: "exact" })
          .eq("owner_id", ownerId)
          .in("plaid_transaction_id", idsEliminados);
        if (deleteError) {
          errores.push(`${item.id}: ${deleteError.message}`);
          huboErrorEnEsteItem = true;
        } else {
          totalEliminadas += count ?? idsEliminados.length;
        }
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
    eliminadas: totalEliminadas,
    totalPlaidAdded,
    totalPlaidModified,
    cuentasNegocioOmitidas,
    errores,
    refreshInfo,
  };
}
