import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcularEstadoResultados, MESES_CORTOS, type LineaEstadoResultados } from "@/lib/estado-resultados";
import { generarReporteExcel, cargarLogoExcel, ColumnaReporte } from "@/lib/reporte-excel";
import { slugificar } from "@/lib/format";

// Excel del Estado de Resultados (10 sept 2026) — misma matriz mes-a-mes de
// la página /dashboard/negocio/estado-resultados, exportable para el
// contable. Reusa lib/estado-resultados.ts (fuente única de la lógica de
// agrupamiento) y lib/reporte-excel.ts (mismo helper branded que el resto
// de reportes descargables de la app).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get("entityId");
  const anio = Number(searchParams.get("anio")) || new Date().getFullYear();

  // 10 oct 2026: también sirve el Estado de Resultados PERSONAL (?ownerId=,
  // sin entityId) para el dueño y para su contable con permiso (0146). La RLS
  // de users/transactions decide: sin permiso, el usuario no aparece o las
  // transacciones vuelven vacías.
  const ownerParam = searchParams.get("ownerId");
  if (!entityId && !ownerParam) {
    return NextResponse.json({ error: "Falta entityId u ownerId." }, { status: 400 });
  }
  // Sin filtro .eq("owner_id", user.id) a propósito (2 oct 2026, fix CPA) —
  // RLS (business_entities_owner / business_entities_cpa_read, migración
  // 0003) ya resuelve dueño vs. CPA con acceso.
  let entidad: { name: string; logo_r2_key: string | null; owner_id: string } | null = null;
  if (entityId) {
    const { data } = await supabase
      .from("business_entities")
      .select("id, name, logo_r2_key, owner_id")
      .eq("id", entityId)
      .maybeSingle();
    entidad = data ? { name: data.name, logo_r2_key: data.logo_r2_key ?? null, owner_id: data.owner_id } : null;
  } else {
    const { data: u } = await supabase.from("users").select("id, full_name, email").eq("id", ownerParam!).maybeSingle();
    entidad = u ? { name: `${u.full_name || u.email || "Cliente"} — Personal`, logo_r2_key: null, owner_id: u.id } : null;
  }
  if (!entidad) return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });

  const er = await calcularEstadoResultados(supabase, { ownerId: entidad.owner_id, entityId: entityId ?? null, anio });
  const logo = await cargarLogoExcel(entidad.logo_r2_key);

  const columnas: ColumnaReporte[] = [
    { header: "Categoría", key: "categoria", width: 34 },
    ...MESES_CORTOS.map((m, i) => ({ header: m, key: `m${i}`, width: 11, moneda: true })),
    { header: "Total", key: "total", width: 14, moneda: true },
  ];

  function filaDe(l: LineaEstadoResultados) {
    const fila: Record<string, string | number> = {
      categoria: l.lineaScheduleC ? `${l.nombre} (${l.lineaScheduleC})` : l.nombre,
      total: l.total,
    };
    l.porMes.forEach((v, i) => (fila[`m${i}`] = v));
    return fila;
  }
  function filaResumenTotal(nombre: string, porMes: number[], total: number) {
    const fila: Record<string, string | number> = { categoria: nombre, total };
    porMes.forEach((v, i) => (fila[`m${i}`] = v));
    return fila;
  }

  const filas = [
    ...er.ingresos.map(filaDe),
    filaResumenTotal("Total ingresos", er.totalIngresosPorMes, er.totalIngresos),
    ...er.gastos.map(filaDe),
    filaResumenTotal("Total gastos", er.totalGastosPorMes, er.totalGastos),
    filaResumenTotal("Utilidad neta", er.utilidadPorMes, er.utilidadNeta),
  ];

  const TEAL_OSCURO = "FF0F6B4E";
  const ROJO = "FFD44C3D";
  const moneda = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const buffer = await generarReporteExcel({
    tituloEmpresa: entidad.name,
    tituloReporte: "Estado de Resultados",
    periodo: `Año ${anio}`,
    logo,
    resumen: [
      { label: "Ingresos", valor: moneda(er.totalIngresos), colorHex: TEAL_OSCURO },
      { label: "Gastos", valor: moneda(er.totalGastos), colorHex: ROJO },
      { label: "Utilidad neta", valor: moneda(er.utilidadNeta), colorHex: er.utilidadNeta >= 0 ? TEAL_OSCURO : ROJO, fuerte: true },
    ],
    columnas,
    filas,
    nombreHoja: "Estado de Resultados",
  });

  const nombreArchivo = `${slugificar(entidad.name)}-estado-de-resultados-${anio}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
