import type { SupabaseClient } from "@supabase/supabase-js";

// Detección de duplicados manual↔Plaid — ver migración 0042 para el caso
// real que motiva esto. Compara transacciones de cuenta MANUAL contra
// transacciones de Plaid del mismo dueño: mismo tipo_flujo, mismo monto
// (absoluto) y fecha dentro de ±2 días. Cruza SOLO manual↔Plaid a
// propósito — duplicados dentro de la misma fuente ya los evita el upsert
// de cada importador (ver csv/importar y plaid-sync.ts).
//
// Se marca la fila de PLAID como la duplicada (es_duplicada = true) y se
// deja la manual como la visible — así se conserva la categorización que
// el usuario ya hizo a mano en vez de perderla. Nada se borra: el usuario
// puede revisar y "des-marcar" cualquiera desde /dashboard/gastos/duplicados
// si el detector se equivocó.
const VENTANA_DIAS = 2;

function diffDias(a: string, b: string): number {
  const msA = new Date(`${a}T00:00:00Z`).getTime();
  const msB = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(msA - msB) / (24 * 60 * 60 * 1000);
}

export async function detectarYMarcarDuplicados(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ marcadas: number }> {
  // Alcance: transacciones personales (entity_id null) — el caso real es
  // Free→Core, que siempre vive en Personal. Si más adelante una entidad
  // de negocio también mezcla manual+Plaid, se puede quitar este filtro.
  const { data: manuales } = await supabase
    .from("transactions")
    .select("id, amount, fecha, tipo_flujo, hacienda_category_id")
    .eq("owner_id", ownerId)
    .is("entity_id", null)
    .not("manual_account_id", "is", null)
    .eq("es_duplicada", false)
    .limit(2000);

  const { data: plaidRows } = await supabase
    .from("transactions")
    .select("id, amount, fecha, tipo_flujo")
    .eq("owner_id", ownerId)
    .is("entity_id", null)
    .not("plaid_account_id", "is", null)
    .eq("es_duplicada", false)
    .limit(2000);

  if (!manuales || manuales.length === 0 || !plaidRows || plaidRows.length === 0) {
    return { marcadas: 0 };
  }

  const plaidUsados = new Set<string>();
  const actualizaciones: { id: string; duplicado_de_id: string }[] = [];

  for (const m of manuales) {
    const montoM = Math.abs(Number(m.amount));
    const match = plaidRows.find(
      (p) =>
        !plaidUsados.has(p.id) &&
        p.tipo_flujo === m.tipo_flujo &&
        Math.abs(Number(p.amount)) === montoM &&
        diffDias(p.fecha, m.fecha) <= VENTANA_DIAS
    );
    if (match) {
      plaidUsados.add(match.id);
      actualizaciones.push({ id: match.id, duplicado_de_id: m.id });
    }
  }

  if (actualizaciones.length === 0) return { marcadas: 0 };

  for (const u of actualizaciones) {
    await supabase
      .from("transactions")
      .update({ es_duplicada: true, duplicado_de_id: u.duplicado_de_id })
      .eq("id", u.id)
      .eq("owner_id", ownerId);
  }

  return { marcadas: actualizaciones.length };
}
