import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Reconciliación de evidencia de gastos por técnico (10 sept 2026) — ver
// migración 0081 para el porqué. Corre en 2 puntos: justo después de que un
// técnico sube evidencia nueva (por si la transacción ya llegó del banco) y
// cada vez que el dueño abre la pestaña Gastos en Equipo (por si la
// transacción llegó DESPUÉS de la evidencia — normal, el banco a veces
// tarda 1-2 días en postear). No corre por cron: es barata (pocas filas por
// entidad) y correr al abrir la pantalla es suficiente para el caso de uso.
//
// Match = misma entidad + categoría de Hacienda vinculada al tipo de gasto
// + monto dentro de la tolerancia del tipo + fecha dentro de la ventana del
// tipo + la transacción no está ya casada con OTRO log (unique index).
export async function reconciliarEvidenciaEntidad(admin: AdminClient, entityId: string): Promise<{ matched: number }> {
  const { data: pendientes } = await admin
    .from("expense_evidence_logs")
    .select("id, monto, fecha, tipo_id, expense_evidence_types(hacienda_category_id, tolerancia_monto, ventana_dias)")
    .eq("entity_id", entityId)
    .eq("estado", "pendiente");

  if (!pendientes || pendientes.length === 0) return { matched: 0 };

  let matched = 0;
  for (const log of pendientes as any[]) {
    const tipo = log.expense_evidence_types;
    if (!tipo?.hacienda_category_id) continue; // sin categoría vinculada todavía, no hay contra qué comparar

    const tolerancia = Number(tipo.tolerancia_monto ?? 5);
    const ventana = Number(tipo.ventana_dias ?? 3);
    const fechaBase = new Date(`${log.fecha}T00:00:00`);
    const desde = new Date(fechaBase);
    desde.setDate(desde.getDate() - ventana);
    const hasta = new Date(fechaBase);
    hasta.setDate(hasta.getDate() + ventana);

    const { data: candidatas } = await admin
      .from("transactions")
      .select("id, amount, fecha")
      .eq("entity_id", entityId)
      .eq("hacienda_category_id", tipo.hacienda_category_id)
      .eq("es_duplicada", false)
      .gte("fecha", desde.toISOString().slice(0, 10))
      .lte("fecha", hasta.toISOString().slice(0, 10))
      .gte("amount", Number(log.monto) - tolerancia)
      .lte("amount", Number(log.monto) + tolerancia)
      .order("fecha", { ascending: true });

    if (!candidatas || candidatas.length === 0) continue;

    // No casar con una transacción que ya está reconciliada con OTRO log.
    const idsCandidatas = candidatas.map((t) => t.id);
    const { data: yaUsadas } = await admin.from("expense_evidence_logs").select("transaction_id").in("transaction_id", idsCandidatas);
    const usadas = new Set((yaUsadas ?? []).map((u) => u.transaction_id));
    const libre = candidatas.find((t) => !usadas.has(t.id));
    if (!libre) continue;

    await admin.from("expense_evidence_logs").update({ estado: "reconciliado", transaction_id: libre.id }).eq("id", log.id);
    matched++;
  }
  return { matched };
}

export type TransaccionSinEvidencia = {
  id: string;
  descripcion: string | null;
  monto: number;
  fecha: string;
  tipoNombre: string;
};

// La bandera roja real: transacciones que cayeron en una categoría con
// evidencia requerida pero que NINGÚN técnico reportó — candidatas a mal
// uso. Solo mira los últimos `diasAtras` días para no inundar la vista con
// historial de antes de activar el feature.
export async function transaccionesSinEvidencia(admin: AdminClient, entityId: string, diasAtras = 60): Promise<TransaccionSinEvidencia[]> {
  const { data: tipos } = await admin
    .from("expense_evidence_types")
    .select("id, nombre, hacienda_category_id")
    .eq("entity_id", entityId)
    .eq("activo", true)
    .not("hacienda_category_id", "is", null);

  if (!tipos || tipos.length === 0) return [];

  const categoriaATipo = new Map(tipos.map((t) => [t.hacienda_category_id as string, t.nombre as string]));
  const categoriaIds = tipos.map((t) => t.hacienda_category_id as string);

  const desde = new Date();
  desde.setDate(desde.getDate() - diasAtras);

  const { data: transacciones } = await admin
    .from("transactions")
    .select("id, description_raw, amount, fecha, hacienda_category_id")
    .eq("entity_id", entityId)
    .eq("es_duplicada", false)
    .in("hacienda_category_id", categoriaIds)
    .gte("fecha", desde.toISOString().slice(0, 10))
    .order("fecha", { ascending: false });

  if (!transacciones || transacciones.length === 0) return [];

  const { data: reconciliadas } = await admin.from("expense_evidence_logs").select("transaction_id").eq("entity_id", entityId).not("transaction_id", "is", null);
  const conEvidencia = new Set((reconciliadas ?? []).map((r) => r.transaction_id));

  return transacciones
    .filter((t) => !conEvidencia.has(t.id))
    .map((t) => ({
      id: t.id,
      descripcion: t.description_raw,
      monto: Number(t.amount),
      fecha: t.fecha,
      tipoNombre: categoriaATipo.get(t.hacienda_category_id as string) ?? "",
    }));
}
