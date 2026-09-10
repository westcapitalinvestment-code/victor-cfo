import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import CategoriasList, { type CategoriaFila } from "./categorias-list";

// Gestión de categorías (10 sept 2026, pedido de Joel al usar el nuevo
// Estado de Resultados: "hay una que dice Telefonica y otra Telefonia y
// ambas tienen gastos y debe ser la misma"). NO está scoped por entidad —
// hacienda_categories no tiene entity_id, solo owner_id (ver 0012), así que
// una categoría personal es la misma en Personal y en TODAS las entidades
// de negocio del usuario. Por eso el conteo de abajo suma TODAS las
// transacciones del owner sin filtrar por entidad.
export default async function CategoriasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: categorias, error: catError }, { data: transacciones, error: txError }] = await Promise.all([
    supabase
      .from("hacienda_categories")
      .select("id, nombre, owner_id, linea_schedule_c")
      .eq("activo", true)
      .order("nombre"),
    // Solo la columna de categoría — esto puede ser bastante historial,
    // pero es un solo número por fila, mucho más liviano que traer
    // description_raw/amount/fecha como en Gastos. Se reduce a conteos por
    // categoría aquí mismo en vez de una query por categoría (evita N+1).
    supabase.from("transactions").select("hacienda_category_id").eq("owner_id", user.id).eq("es_duplicada", false),
  ]);

  if (catError) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center text-sm text-amb">No se pudieron leer las categorías ({catError.message}).</div>
      </div>
    );
  }

  const conteoPorCategoria = new Map<number, number>();
  if (!txError) {
    for (const t of transacciones ?? []) {
      if (!t.hacienda_category_id) continue;
      conteoPorCategoria.set(t.hacienda_category_id, (conteoPorCategoria.get(t.hacienda_category_id) ?? 0) + 1);
    }
  }

  const filas: CategoriaFila[] = (categorias ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    esPropia: c.owner_id === user.id,
    lineaScheduleC: c.linea_schedule_c,
    conteo: conteoPorCategoria.get(c.id) ?? 0,
  }));

  const totalPersonales = filas.filter((f) => f.esPropia).length;

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Categorías</h1>
          <p className="text-xs text-muted">
            {filas.length} categorías ({totalPersonales} tuyas, {filas.length - totalPersonales} del catálogo global)
          </p>
        </div>
        <Link href="/dashboard/gastos" className="text-xs font-medium text-teal hover:opacity-80">
          ← Transacciones
        </Link>
      </div>

      <p className="mb-3 text-xs text-muted">
        Fusiona dos categorías que en realidad son la misma cosa (ej. &quot;Telefonica&quot; y &quot;Telefonia&quot;) — mueve todas sus
        transacciones y actualiza el motor de auto-categorización para que no se repita el duplicado. Las categorías del catálogo
        global (compartidas) no se pueden renombrar ni eliminar, solo fusionar lo tuyo hacia otra.
      </p>

      {txError && <p className="mb-3 text-xs text-amb">⚠ No se pudo contar transacciones por categoría ({txError.message}).</p>}

      <CategoriasList categorias={filas} />
    </div>
  );
}
