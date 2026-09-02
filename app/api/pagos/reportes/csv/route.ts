import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CSV del resumen trimestral de Pagos a contratistas (2 sept 2026) — lo que
// Joel necesita para llenar el 480.6A/B por contratista. Mismo patrón que
// /api/facturas/reportes/csv: se recalcula server-side a partir de los
// filtros (desde/hasta/entityId), no se manda la tabla ya armada por query.
function escaparCsv(valor: string): string {
  if (valor.includes(",") || valor.includes('"') || valor.includes("\n")) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

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
  // vendorIds (2 sept 2026, pedido de Joel: "necesito filtrar... por
  // vendors") — lista de ids separados por coma, opcional. Sin esto se
  // exportan todos los contratistas, igual que antes.
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

  const lineas: string[] = [["Contratista", "Tax ID", "Pagos", "Bruto", "Retenido 480.6", "Neto"].join(",")];
  for (const f of filas) {
    lineas.push([escaparCsv(f.nombre), escaparCsv(f.taxId), String(f.count), f.bruto.toFixed(2), f.retenido.toFixed(2), f.neto.toFixed(2)].join(","));
  }
  const totalBruto = filas.reduce((s, f) => s + f.bruto, 0);
  const totalRetenido = filas.reduce((s, f) => s + f.retenido, 0);
  const totalNeto = filas.reduce((s, f) => s + f.neto, 0);
  lineas.push(["TOTAL", "", "", totalBruto.toFixed(2), totalRetenido.toFixed(2), totalNeto.toFixed(2)].join(","));

  const csv = lineas.join("\n");
  const nombreArchivo = `victor-cfo-pagos-480.6_${desde}_a_${hasta}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
