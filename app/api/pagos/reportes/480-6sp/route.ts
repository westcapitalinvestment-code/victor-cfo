import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exportación año-fiscal del Modelo 480.6SP (30 sept 2026, tarea #743) — a
// diferencia del CSV de /reportes/csv (que exporta cualquier rango libre),
// esta ruta arma exactamente lo que Joel le entrega a su CPA una vez al año:
// un contratista por fila, con su casilla real (1-4, ver casilla480_6SP en
// pagos-portal.tsx — misma lógica duplicada aquí porque esta ruta corre en
// el servidor) y su SSN/EIN, para el año calendario completo.
function escaparCsv(valor: string): string {
  if (valor.includes(",") || valor.includes('"') || valor.includes("\n")) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function casilla(retentionType: string | null, isCorporation: boolean): number {
  const sujeto = retentionType === "480.6B";
  if (!sujeto && !isCorporation) return 1;
  if (!sujeto && isCorporation) return 2;
  if (sujeto && !isCorporation) return 3;
  return 4;
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
  const anio = Number(searchParams.get("anio") || new Date().getFullYear());
  const entityId = searchParams.get("entityId");
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;

  let query = supabase
    .from("vendor_retenciones")
    .select("vendor_id, gross_amount, retention_amount, period_end, vendors(name, tax_id, retention_type, is_corporation)")
    .eq("owner_id", user.id)
    .gte("period_end", desde)
    .lte("period_end", hasta);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapa = new Map<
    string,
    { nombre: string; taxId: string; retentionType: string | null; isCorporation: boolean; bruto: number; retenido: number }
  >();
  for (const r of (data ?? []) as any[]) {
    const v = r.vendors;
    const nombre = v?.name ?? "Contratista eliminado";
    const actual =
      mapa.get(r.vendor_id) ??
      {
        nombre,
        taxId: v?.tax_id ?? "",
        retentionType: v?.retention_type ?? null,
        isCorporation: !!v?.is_corporation,
        bruto: 0,
        retenido: 0,
      };
    actual.bruto += Number(r.gross_amount);
    actual.retenido += Number(r.retention_amount);
    mapa.set(r.vendor_id, actual);
  }

  // Solo entra al 480.6SP quien cruzó los $500 declarables en el año — filas
  // con menos de eso no se reportan (Sección 1062.03).
  const filas = [...mapa.values()]
    .filter((f) => f.bruto >= 500)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const lineas: string[] = [
    ["Casilla", "Contratista", "SSN/EIN", "Tipo", "Bruto pagado", "Retenido"].join(","),
  ];
  for (const f of filas) {
    const num = casilla(f.retentionType, f.isCorporation);
    const tipo = f.isCorporation ? "Corporación/entidad" : "Individuo";
    lineas.push(
      [
        String(num),
        escaparCsv(f.nombre),
        escaparCsv(f.taxId || "FALTA"),
        tipo,
        f.bruto.toFixed(2),
        f.retenido.toFixed(2),
      ].join(",")
    );
  }
  const totalBruto = filas.reduce((s, f) => s + f.bruto, 0);
  const totalRetenido = filas.reduce((s, f) => s + f.retenido, 0);
  lineas.push(["", "TOTAL", "", "", totalBruto.toFixed(2), totalRetenido.toFixed(2)].join(","));

  const csv = lineas.join("\n");
  const nombreArchivo = `victor-cfo-480.6SP_${anio}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
