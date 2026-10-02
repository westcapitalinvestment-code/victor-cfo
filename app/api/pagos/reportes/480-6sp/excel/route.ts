import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarReporteExcel, cargarLogoExcel, ColumnaReporte, FilaTotal } from "@/lib/reporte-excel";
import { slugificar } from "@/lib/format";

// Excel branded de la exportación año-fiscal del Modelo 480.6SP (30 sept
// 2026, feedback de Joel: el CSV original de esta misma ruta "está horrible,
// no está en el formato de los demás con logo y tablas" — los otros 3
// reportes de Pagos (resumen por rango) ya tienen Excel+PDF con marca desde
// el 7 sept, este export específico (año completo, 4 casillas, SSN/EIN para
// el CPA) se había quedado atrás en CSV plano). Mismos datos que
// /api/pagos/reportes/480-6sp, solo cambia cómo se escribe el archivo.
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

  // Resolver owner_id efectivo (2 oct 2026, fix CPA) — si viene entityId, el
  // owner real es el dueño de la entidad (no quien llama), para que un CPA
  // con acceso vía account_members también pueda generar este reporte.
  let ownerIdEfectivo = user.id;
  if (entityId) {
    const { data: entidadCheck } = await supabase.from("business_entities").select("owner_id").eq("id", entityId).maybeSingle();
    if (!entidadCheck) return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });
    ownerIdEfectivo = entidadCheck.owner_id;
  }

  let query = supabase
    .from("vendor_retenciones")
    .select(
      "vendor_id, gross_amount, retention_amount, period_end, vendors(name, tax_id, address, retention_type, is_corporation)"
    )
    .eq("owner_id", ownerIdEfectivo)
    .gte("period_end", desde)
    .lte("period_end", hasta);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapa = new Map<
    string,
    {
      nombre: string;
      taxId: string;
      address: string;
      retentionType: string | null;
      isCorporation: boolean;
      bruto: number;
      retenido: number;
    }
  >();
  for (const r of (data ?? []) as any[]) {
    const v = r.vendors;
    const nombre = v?.name ?? "Contratista eliminado";
    const actual =
      mapa.get(r.vendor_id) ??
      {
        nombre,
        taxId: v?.tax_id ?? "",
        address: v?.address ?? "",
        retentionType: v?.retention_type ?? null,
        isCorporation: !!v?.is_corporation,
        bruto: 0,
        retenido: 0,
      };
    actual.bruto += Number(r.gross_amount);
    actual.retenido += Number(r.retention_amount);
    mapa.set(r.vendor_id, actual);
  }

  const filas = [...mapa.values()]
    .filter((f) => f.bruto >= 500)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";
  const logo = await cargarLogoExcel(entidad?.logo_r2_key);

  const columnas: ColumnaReporte[] = [
    { header: "Casilla", key: "casilla", width: 10, numero: true },
    { header: "Contratista", key: "nombre", width: 32 },
    { header: "SSN/EIN", key: "taxId", width: 16 },
    { header: "Dirección postal", key: "address", width: 34 },
    { header: "Tipo", key: "tipo", width: 20 },
    { header: "Bruto pagado", key: "bruto", width: 16, moneda: true },
    { header: "Retenido", key: "retenido", width: 16, moneda: true },
  ];
  const filasExcel = filas.map((f) => ({
    casilla: casilla(f.retentionType, f.isCorporation),
    nombre: f.nombre,
    taxId: f.taxId || "FALTA",
    address: f.address || "",
    tipo: f.isCorporation ? "Corporación/entidad" : "Individuo",
    bruto: f.bruto,
    retenido: f.retenido,
  }));
  const totales: FilaTotal[] = [
    { key: "bruto", valor: filas.reduce((s, f) => s + f.bruto, 0) },
    { key: "retenido", valor: filas.reduce((s, f) => s + f.retenido, 0) },
  ];

  const buffer = await generarReporteExcel({
    tituloEmpresa: nombreTitular,
    tituloReporte: `Modelo 480.6SP — Año fiscal ${anio} (para el CPA)`,
    periodo: `01/01/${anio} — 12/31/${anio} · solo contratistas que cruzaron los $500 (Sección 1062.03)`,
    logo,
    columnas,
    filas: filasExcel,
    totales,
    nombreHoja: "480.6SP",
  });

  const nombreArchivo = `${slugificar(nombreTitular)}-480.6SP_${anio}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
