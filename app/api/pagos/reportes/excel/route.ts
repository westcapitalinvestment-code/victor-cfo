import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarReporteExcel, cargarLogoExcel, ColumnaReporte, FilaTotal } from "@/lib/reporte-excel";
import { formatFecha, slugificar } from "@/lib/format";

// Excel descargable del tab Reportes de Pagos — 7 sept 2026, pedido de Joel:
// "verifica que en todos los reportes... aparezca el Logo... y nuestra
// promocion abajo". Pagos solo tenía CSV plano (sin logo posible) y el PDF
// acababa de recibir la marca (logo + pie victorcfo.com). Este Excel cierra
// el hueco con el mismo patrón que /api/facturas/reportes/excel: mismos
// datos que el CSV original (vendor_retenciones agrupado por contratista),
// solo cambia cómo se escribe el archivo — ver lib/reporte-excel.ts.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") || "0000-01-01";
  const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10);
  const entityId = searchParams.get("entityId");
  const vendorIdsParam = searchParams.get("vendorIds");
  const vendorIds = vendorIdsParam ? vendorIdsParam.split(",").filter(Boolean) : null;

  let query = supabase
    .from("vendor_retenciones")
    .select("vendor_id, gross_amount, retention_pct, retention_amount, net_paid, period_end, vendors(name, tax_id)")
    .eq("owner_id", user.id)
    .gte("period_end", desde)
    .lte("period_end", hasta);
  if (entityId) query = query.eq("entity_id", entityId);
  if (vendorIds && vendorIds.length > 0) query = query.in("vendor_id", vendorIds);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapa = new Map<string, { nombre: string; taxId: string; bruto: number; retenido: number; neto: number; count: number }>();
  for (const r of (data ?? []) as any[]) {
    const nombre = r.vendors?.name ?? "Contratista eliminado";
    const actual = mapa.get(r.vendor_id) ?? { nombre, taxId: r.vendors?.tax_id ?? "", bruto: 0, retenido: 0, neto: 0, count: 0 };
    actual.bruto += Number(r.gross_amount);
    actual.retenido += Number(r.retention_amount);
    actual.neto += Number(r.net_paid);
    actual.count += 1;
    mapa.set(r.vendor_id, actual);
  }
  const filas = [...mapa.values()].sort((a, b) => b.retenido - a.retenido);

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";
  const logo = await cargarLogoExcel(entidad?.logo_r2_key);

  const columnas: ColumnaReporte[] = [
    { header: "Contratista", key: "nombre", width: 32 },
    { header: "Tax ID", key: "taxId", width: 16 },
    { header: "Pagos", key: "count", width: 10, numero: true },
    { header: "Bruto", key: "bruto", width: 16, moneda: true },
    { header: "Retenido 480.6", key: "retenido", width: 16, moneda: true },
    { header: "Neto", key: "neto", width: 16, moneda: true },
  ];
  const filasExcel = filas.map((f) => ({ nombre: f.nombre, taxId: f.taxId, count: f.count, bruto: f.bruto, retenido: f.retenido, neto: f.neto }));
  const totales: FilaTotal[] = [
    { key: "count", valor: filas.reduce((s, f) => s + f.count, 0) },
    { key: "bruto", valor: filas.reduce((s, f) => s + f.bruto, 0) },
    { key: "retenido", valor: filas.reduce((s, f) => s + f.retenido, 0) },
    { key: "neto", valor: filas.reduce((s, f) => s + f.neto, 0) },
  ];

  const buffer = await generarReporteExcel({
    tituloEmpresa: nombreTitular,
    tituloReporte: "Reporte de Pagos a Contratistas — 480.6A/B",
    periodo: `${formatFecha(desde)} — ${formatFecha(hasta)}`,
    logo,
    columnas,
    filas: filasExcel,
    totales,
    nombreHoja: "Pagos",
  });

  const nombreArchivo = `${slugificar(nombreTitular)}-pagos_${desde}_a_${hasta}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
