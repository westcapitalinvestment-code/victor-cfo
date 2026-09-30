import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, normalizarFecha, normalizarMonto } from "@/lib/csv";

// Importar pagos históricos a contratistas desde CSV/Excel (30 sept 2026,
// pedido de Joel: un contratista que llega a mitad de año con data de otro
// sistema no debería tener que esperar a enero para que el acumulado de
// $500 y el 480.6SP le funcionen). Mismo patrón de 2 pasos que
// /api/facturas/csv/importar: el preview genérico
// (/api/cuentas-manuales/csv/preview) le enseña las columnas al frontend, y
// aquí, con el mapeo ya confirmado, se procesa el archivo completo — un
// insert en vendor_retenciones por fila.
//
// El contratista de cada fila puede no existir todavía como `vendor` — en
// vez de rechazar la fila, se crea el contratista sobre la marcha (mismo
// criterio que crea clientes /api/facturas/csv/importar), y se cuenta
// aparte en `contratistasCreados`. Matchea primero por Tax ID (si la
// columna viene mapeada), luego por nombre exacto (case-insensitive).
function parsePct(valor: string | undefined): number {
  if (!valor) return 0;
  const limpio = valor.replace(/%/g, "").trim();
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

function esAfirmativo(valor: string | undefined): boolean {
  const limpio = (valor ?? "").trim().toLowerCase();
  return ["si", "sí", "yes", "true", "1", "corporación", "corporacion", "corp", "entidad", "llc", "inc", "corp."].includes(limpio);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const userId = user.id;

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const csv: string | undefined = body?.csv;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha === "DMY" || body?.formatoFecha === "YMD" ? body.formatoFecha : "MDY";

  const columnaContratista: number | undefined = body?.columnaContratista;
  const columnaFecha: number | undefined = body?.columnaFecha;
  const columnaBruto: number | undefined = body?.columnaBruto;
  const columnaTaxId: number | null = body?.columnaTaxId ?? null;
  const columnaRetencionPct: number | null = body?.columnaRetencionPct ?? null;
  const columnaRetenido: number | null = body?.columnaRetenido ?? null;
  const columnaEsCorporacion: number | null = body?.columnaEsCorporacion ?? null;

  if (!entityId || !csv) {
    return NextResponse.json({ error: "Falta la entidad o el archivo." }, { status: 400 });
  }
  if (columnaContratista === undefined || columnaFecha === undefined || columnaBruto === undefined) {
    return NextResponse.json({ error: "Faltan columnas requeridas: Contratista, Fecha y Bruto pagado." }, { status: 400 });
  }

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1);

  const { data: vendoresExistentes } = await supabase
    .from("vendors")
    .select("id, name, tax_id")
    .eq("entity_id", entityId)
    .eq("owner_id", user.id);

  const vendorPorNombre = new Map((vendoresExistentes ?? []).map((v) => [v.name.trim().toLowerCase(), v.id]));
  const vendorPorTaxId = new Map(
    (vendoresExistentes ?? []).filter((v) => v.tax_id).map((v) => [v.tax_id!.trim().toLowerCase(), v.id])
  );

  // Dedup: mismo contratista + misma fecha + mismo monto bruto = ya está
  // (criterio análogo al de facturas: evita que "subí el mismo archivo dos
  // veces" duplique el acumulado de $500).
  const { data: retencionesExistentes } = await supabase
    .from("vendor_retenciones")
    .select("vendor_id, period_end, gross_amount")
    .eq("entity_id", entityId)
    .eq("owner_id", user.id);
  const clavesExistentes = new Set(
    (retencionesExistentes ?? []).map((r) => `${r.vendor_id}::${r.period_end}::${Number(r.gross_amount).toFixed(2)}`)
  );

  const importBatchId = randomUUID();

  let importados = 0;
  let contratistasCreados = 0;
  let duplicados = 0;
  let errores = 0;

  for (const fila of filasDatos) {
    const nombreContratista = (fila[columnaContratista] ?? "").trim();
    const fecha = normalizarFecha(fila[columnaFecha] ?? "", formatoFecha);
    const bruto = normalizarMonto(fila[columnaBruto] ?? "");

    if (!nombreContratista || !fecha || bruto === null || bruto <= 0) {
      errores++;
      continue;
    }

    const taxId = columnaTaxId !== null ? (fila[columnaTaxId] ?? "").trim() : "";
    const retencionPct = columnaRetencionPct !== null ? parsePct(fila[columnaRetencionPct]) : 0;
    const retenidoManual = columnaRetenido !== null ? normalizarMonto(fila[columnaRetenido] ?? "") : null;
    const esCorporacion = columnaEsCorporacion !== null ? esAfirmativo(fila[columnaEsCorporacion]) : false;

    // Busca el contratista: primero por Tax ID (más confiable si viene),
    // luego por nombre exacto. Si no existe, lo crea sobre la marcha.
    let vendorId = taxId ? vendorPorTaxId.get(taxId.toLowerCase()) : undefined;
    if (!vendorId) vendorId = vendorPorNombre.get(nombreContratista.toLowerCase());

    if (!vendorId) {
      const { data: nuevoVendor, error: errVendor } = await supabase
        .from("vendors")
        .insert({
          owner_id: userId,
          entity_id: entityId,
          name: nombreContratista,
          tax_id: taxId || null,
          vendor_type: "contratista_servicios",
          retention_type: retencionPct > 0 ? "480.6B" : "480.6A",
          default_retention_pct: retencionPct,
          is_corporation: esCorporacion,
          active: true,
        })
        .select("id")
        .single();
      if (errVendor || !nuevoVendor) {
        errores++;
        continue;
      }
      vendorId = nuevoVendor.id;
      vendorPorNombre.set(nombreContratista.toLowerCase(), vendorId);
      if (taxId) vendorPorTaxId.set(taxId.toLowerCase(), vendorId);
      contratistasCreados++;
    }

    const claveDedup = `${vendorId}::${fecha}::${bruto.toFixed(2)}`;
    if (clavesExistentes.has(claveDedup)) {
      duplicados++;
      continue;
    }
    clavesExistentes.add(claveDedup);

    const retenido = retenidoManual !== null ? retenidoManual : Math.round(bruto * (retencionPct / 100) * 100) / 100;
    const pctEfectivo = bruto > 0 ? Math.round((retenido / bruto) * 10000) / 100 : retencionPct;

    const { error: errInsert } = await supabase.from("vendor_retenciones").insert({
      owner_id: userId,
      entity_id: entityId,
      vendor_id: vendorId,
      gross_amount: bruto,
      retention_pct: retenidoManual !== null ? pctEfectivo : retencionPct,
      retention_amount: retenido,
      period_start: fecha,
      period_end: fecha,
      remittance_status: "pendiente",
      import_batch_id: importBatchId,
    });

    if (errInsert) {
      errores++;
      continue;
    }
    importados++;
  }

  return NextResponse.json({ importados, contratistasCreados, duplicados, errores, importBatchId: importados > 0 ? importBatchId : null });
}
