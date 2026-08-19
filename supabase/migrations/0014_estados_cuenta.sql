import type { createClient } from "@/lib/supabase/server";

// Compartido por los dos flujos de "subir estado de cuenta" (CSV/QuickBooks
// y PDF), y usable tanto para una cuenta conectada por Plaid (rellenar el
// hueco de historial que Plaid no trajo) como para una cuenta manual (ej.
// Apple Card).
export type FilaTransaccionImportar = {
  description_raw: string;
  amount: number;
  fecha: string; // YYYY-MM-DD
};

// Inserta un lote de transacciones importadas evitando duplicados.
//
// A propósito NO se usa upsert()+onConflict aquí: el índice que haría
// falta para eso es un índice único PARCIAL (transactions_manual_dedup_key
// / transactions_plaid_backfill_dedup_key, migraciones 0013/0014), y
// Postgres solo acepta un índice parcial como árbitro de "ON CONFLICT" si
// el predicado del índice (el "WHERE ...") se repite en el propio INSERT —
// algo que el cliente de Supabase no deja pasar (su opción `onConflict`
// solo acepta nombres de columna). Sin eso, "ON CONFLICT (columnas)"
// contra un índice parcial revienta con "no unique or exclusion
// constraint matching the ON CONFLICT specification" en TODA subida, no
// solo cuando hay un duplicado real.
//
// En su lugar: 1) se deduplica dentro del propio archivo (por si trae la
// misma fila dos veces), 2) se compara contra lo que ya existe en esa
// cuenta, y 3) se inserta con un INSERT normal. El índice parcial de la
// base de datos se queda como red de seguridad de última instancia — si
// por una carrera rara (ej. doble clic, o subir el mismo archivo en dos
// pestañas a la vez) algo se escapa del paso 2, el INSERT truena con un
// error de duplicado (23505) en vez de crear una fila repetida, y ese caso
// se recupera fila por fila más abajo.
export async function importarTransaccionesDedup(
  supabase: ReturnType<typeof createClient>,
  params: {
    ownerId: string;
    origenCuenta: "plaid" | "manual";
    cuentaId: string;
    origen: "csv" | "pdf";
    filas: FilaTransaccionImportar[];
  }
): Promise<{ importadas: number; duplicadas: number }> {
  const { ownerId, origenCuenta, cuentaId, origen, filas } = params;
  const columnaCuenta = origenCuenta === "manual" ? "manual_account_id" : "plaid_account_id";
  const clave = (f: FilaTransaccionImportar) => `${f.fecha}|${f.description_raw}|${f.amount}`;

  // 1. Dedup dentro del propio lote.
  const vistos = new Set<string>();
  const filasUnicasEnLote = filas.filter((f) => {
    const k = clave(f);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // 2. Dedup contra lo que ya existe en esa cuenta (Plaid ya sincronizado,
  // o una subida anterior).
  const { data: existentes } = await supabase
    .from("transactions")
    .select("fecha, description_raw, amount")
    .eq(columnaCuenta, cuentaId);

  const clavesExistentes = new Set(
    (existentes ?? []).map((t: { fecha: string; description_raw: string; amount: number }) =>
      `${t.fecha}|${t.description_raw}|${t.amount}`
    )
  );

  const filasNuevas = filasUnicasEnLote.filter((f) => !clavesExistentes.has(clave(f)));
  const duplicadas = filas.length - filasNuevas.length;

  if (filasNuevas.length === 0) {
    return { importadas: 0, duplicadas };
  }

  const filasParaInsertar = filasNuevas.map((f) => ({
    owner_id: ownerId,
    entity_id: null,
    manual_account_id: origenCuenta === "manual" ? cuentaId : null,
    plaid_account_id: origenCuenta === "plaid" ? cuentaId : null,
    origen,
    description_raw: f.description_raw,
    amount: f.amount,
    fecha: f.fecha,
  }));

  const { data: insertadas, error } = await supabase
    .from("transactions")
    .insert(filasParaInsertar)
    .select("id");

  if (!error) {
    return { importadas: insertadas?.length ?? 0, duplicadas };
  }

  if ((error as { code?: string }).code !== "23505") {
    throw new Error(error.message);
  }

  // Carrera rara — insertamos fila por fila para salvar las que sí son
  // nuevas de verdad, en vez de perder el lote completo por una sola.
  let importadasFallback = 0;
  for (const fila of filasParaInsertar) {
    const { error: errorFila } = await supabase.from("transactions").insert(fila);
    if (!errorFila) importadasFallback++;
  }
  return { importadas: importadasFallback, duplicadas: filas.length - importadasFallback };
}
