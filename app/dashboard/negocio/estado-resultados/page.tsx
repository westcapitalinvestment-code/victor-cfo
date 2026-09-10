import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { calcularEstadoResultados, MESES_CORTOS } from "@/lib/estado-resultados";
import { formatMoney } from "@/lib/format";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Estado de Resultados (10 sept 2026, pedido de Joel: "que sea útil para un
// contable") — matriz mes-a-mes del año, vive dentro de Negocio porque el
// Anejo M / Schedule C es exclusivamente de negocio (ver nota en
// lib/estado-resultados.ts sobre por qué NO se mezcla con Personal).
// Descarga en Excel/PDF vía /api/reportes/estado-resultados/{excel,pdf}.

export default async function EstadoResultadosPage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());

  if (!entidades || entidades.length === 0) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de ver su Estado de Resultados.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  if (vistaGlobal || !entidadId) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver su Estado de Resultados.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId)!;

  const anioActual = new Date().getFullYear();
  const anio = Number(searchParams.anio) || anioActual;

  const er = await calcularEstadoResultados(supabase, { ownerId: user.id, entityId: entidadId, anio });

  const qs = (a: number) => `?anio=${a}`;
  const qsExport = new URLSearchParams({ entityId: entidadId, anio: String(anio) }).toString();

  function filaLinea(l: { nombre: string; lineaScheduleC: string | null; porMes: number[]; total: number }, color?: string) {
    return (
      <tr key={l.nombre} className="border-b" style={{ borderColor: "var(--border)" }}>
        <td className="sticky left-0 whitespace-nowrap px-3 py-2 text-xs" style={{ background: "var(--card)" }}>
          <div>{l.nombre}</div>
          {l.lineaScheduleC && <div className="text-[10px] text-muted">{l.lineaScheduleC}</div>}
        </td>
        {l.porMes.map((v, i) => (
          <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-xs" style={{ color: v ? undefined : "var(--muted)" }}>
            {v ? formatMoney(v, 0) : "—"}
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium" style={{ color }}>
          {formatMoney(l.total, 0)}
        </td>
      </tr>
    );
  }

  function filaTotal(label: string, porMes: number[], total: number, color: string) {
    return (
      <tr className="border-t-2" style={{ borderColor: "var(--teal, #1d9e75)" }}>
        <td className="sticky left-0 whitespace-nowrap px-3 py-2 text-xs font-semibold" style={{ background: "var(--card)", color }}>
          {label}
        </td>
        {porMes.map((v, i) => (
          <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold" style={{ color }}>
            {formatMoney(v, 0)}
          </td>
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-bold" style={{ color }}>
          {formatMoney(total, 0)}
        </td>
      </tr>
    );
  }

  const TEAL = "#0f6b4e";
  const ROJO = "#d44c3d";

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Estado de Resultados</h1>
          <p className="text-xs text-muted">{entidadActiva.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs(anio - 1)} className="rounded-pill border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
            ← {anio - 1}
          </Link>
          <span className="text-sm font-medium">{anio}</span>
          <Link href={qs(anio + 1)} className="rounded-pill border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
            {anio + 1} →
          </Link>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted">
        Solo transacciones de esta entidad (negocio) — las personales no se mezclan aquí. La columna bajo cada categoría muestra su línea de
        referencia de Schedule C (formulario federal); si tu CPA te confirma los números reales de línea del Anejo M de Puerto Rico, se pueden
        añadir aparte.
      </p>

      <div className="vc-card mb-3 flex flex-wrap gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Ingresos</div>
          <div className="text-base font-semibold" style={{ color: TEAL }}>
            {formatMoney(er.totalIngresos)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Gastos</div>
          <div className="text-base font-semibold" style={{ color: ROJO }}>
            {formatMoney(er.totalGastos)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Utilidad neta</div>
          <div className="text-base font-semibold" style={{ color: er.utilidadNeta >= 0 ? TEAL : ROJO }}>
            {formatMoney(er.utilidadNeta)}
          </div>
        </div>
        <div className="ml-auto flex items-end gap-3">
          <a href={`/api/reportes/estado-resultados/excel?${qsExport}`} className="text-xs font-medium hover:text-teal">
            ↓ Excel
          </a>
          <a href={`/api/reportes/estado-resultados/pdf?${qsExport}`} className="text-xs font-medium hover:text-teal">
            ↓ PDF
          </a>
        </div>
      </div>

      <div className="vc-card overflow-x-auto !p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "var(--teal-dark, #0f6b4e)" }}>
              <th className="sticky left-0 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-white" style={{ background: "var(--teal-dark, #0f6b4e)" }}>
                Categoría
              </th>
              {MESES_CORTOS.map((m) => (
                <th key={m} className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-white">
                  {m}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold text-white">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={14} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Ingresos
              </td>
            </tr>
            {er.ingresos.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-2 text-xs text-muted">
                  Sin ingresos categorizados en {anio}.
                </td>
              </tr>
            )}
            {er.ingresos.map((l) => filaLinea(l, TEAL))}
            {filaTotal("Total ingresos", er.totalIngresosPorMes, er.totalIngresos, TEAL)}

            <tr>
              <td colSpan={14} className="px-3 pt-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Gastos
              </td>
            </tr>
            {er.gastos.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-2 text-xs text-muted">
                  Sin gastos categorizados en {anio}.
                </td>
              </tr>
            )}
            {er.gastos.map((l) => filaLinea(l, ROJO))}
            {filaTotal("Total gastos", er.totalGastosPorMes, er.totalGastos, ROJO)}

            {filaTotal("Utilidad neta", er.utilidadPorMes, er.utilidadNeta, er.utilidadNeta >= 0 ? TEAL : ROJO)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
