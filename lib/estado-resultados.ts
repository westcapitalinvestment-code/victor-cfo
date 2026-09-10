import type { SupabaseClient } from "@supabase/supabase-js";

// Estado de Resultados (10 sept 2026, pedido de Joel: "que sea útil para un
// contable") — a diferencia del Reporte de Ingresos/Gastos que ya existía
// (un solo total plano para el rango escogido), esto arma una matriz mes a
// mes del año completo: una fila por categoría, una columna por mes, más
// Total del año. Así un contable puede ver la tendencia y cuadrar contra
// los estados de banco mes por mes, que es como se trabaja de verdad —
// no solo un número gigante sin desglosar en el tiempo.
//
// Por qué NO se agrupa por "línea de Anejo M" (como se pensó al principio):
// hacienda_categories.linea_anejo_m hoy solo guarda el texto fijo "Anejo M"
// para TODAS las categorías de negocio — no tiene el número de línea real.
// Lo único con detalle específico es linea_schedule_c (formulario federal),
// así que se muestra como referencia cruzada, pero el agrupamiento real es
// por categoría — ya es información específica y útil sin depender de un
// dato que no existe todavía. Si Héctor (CPA de Joel) confirma los números
// reales de línea del Anejo M, ahí se puede poblar linea_anejo_m de verdad
// y cambiar el agrupamiento sin tocar esta función.
//
// Excluye tipo_flujo = 'transferencia' a propósito — un movimiento entre
// cuentas propias no es ingreso ni gasto real del negocio, mezclarlo aquí
// infla ambos lados sin significado contable (mismo criterio que ya usan
// los reportes de Gastos existentes).

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export interface LineaEstadoResultados {
  categoriaId: number | null;
  nombre: string;
  lineaScheduleC: string | null;
  porMes: number[]; // 12 posiciones, índice 0 = enero
  total: number;
}

export interface EstadoResultados {
  anio: number;
  ingresos: LineaEstadoResultados[];
  gastos: LineaEstadoResultados[];
  totalIngresosPorMes: number[];
  totalGastosPorMes: number[];
  utilidadPorMes: number[];
  totalIngresos: number;
  totalGastos: number;
  utilidadNeta: number;
}

export async function calcularEstadoResultados(
  supabase: SupabaseClient,
  opts: { ownerId: string; entityId: string | null; anio: number }
): Promise<EstadoResultados> {
  const { ownerId, entityId, anio } = opts;

  let query = supabase
    .from("transactions")
    .select("fecha, amount, hacienda_category_id, tipo_flujo")
    .eq("owner_id", ownerId)
    .eq("es_duplicada", false)
    .eq("pending", false)
    .in("tipo_flujo", ["ingreso", "gasto"])
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`);
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);

  const { data: transacciones, error } = await query;
  if (error) throw new Error(error.message);

  const { data: categorias } = await supabase.from("hacienda_categories").select("id, nombre, linea_schedule_c");
  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c]));

  const gruposIngreso = new Map<string, LineaEstadoResultados>();
  const gruposGasto = new Map<string, LineaEstadoResultados>();

  for (const t of transacciones ?? []) {
    const mes = Number((t.fecha as string).slice(5, 7)) - 1; // 0-11
    if (mes < 0 || mes > 11) continue;
    const monto = Math.abs(Number(t.amount));
    const catId = t.hacienda_category_id as number | null;
    const cat = catId ? categoriaPorId.get(catId) : null;
    const key = catId != null ? String(catId) : "sin_categorizar";
    const grupo = t.tipo_flujo === "ingreso" ? gruposIngreso : gruposGasto;

    let linea = grupo.get(key);
    if (!linea) {
      linea = {
        categoriaId: catId,
        nombre: cat?.nombre ?? "Sin categorizar",
        lineaScheduleC: cat?.linea_schedule_c ?? null,
        porMes: new Array(12).fill(0),
        total: 0,
      };
      grupo.set(key, linea);
    }
    linea.porMes[mes] += monto;
    linea.total += monto;
  }

  const ingresos = [...gruposIngreso.values()].sort((a, b) => b.total - a.total);
  const gastos = [...gruposGasto.values()].sort((a, b) => b.total - a.total);

  const totalIngresosPorMes = new Array(12).fill(0);
  const totalGastosPorMes = new Array(12).fill(0);
  for (const l of ingresos) l.porMes.forEach((v, i) => (totalIngresosPorMes[i] += v));
  for (const l of gastos) l.porMes.forEach((v, i) => (totalGastosPorMes[i] += v));
  const utilidadPorMes = totalIngresosPorMes.map((v, i) => v - totalGastosPorMes[i]);

  const totalIngresos = totalIngresosPorMes.reduce((s, v) => s + v, 0);
  const totalGastos = totalGastosPorMes.reduce((s, v) => s + v, 0);

  return {
    anio,
    ingresos,
    gastos,
    totalIngresosPorMes,
    totalGastosPorMes,
    utilidadPorMes,
    totalIngresos,
    totalGastos,
    utilidadNeta: totalIngresos - totalGastos,
  };
}
