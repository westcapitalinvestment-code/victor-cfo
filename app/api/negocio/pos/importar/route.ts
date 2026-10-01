import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, normalizarFecha, normalizarMonto } from "@/lib/csv";

// Importar reporte de ventas de POS (Clover/Verifone/Square, #786 — 1 oct
// 2026, "dale montalo todo junto"). Mismo flujo de 2 pasos que
// /api/pagos/csv/importar: el preview genérico ya le enseñó las columnas al
// frontend (/api/cuentas-manuales/csv/preview), aquí se procesa el archivo
// completo con el mapeo ya confirmado.
//
// Cada fila del archivo = un período (normalmente un día, si el reporte
// cubre un rango) — se inserta una fila en pos_batch_uploads por cada fila
// del CSV con datos válidos. Solo Fecha y Venta Bruta son requeridas; IVU y
// Propinas son opcionales (si faltan, quedan en 0 — el usuario puede tener
// un reporte que no las desglosa).
//
// Si el reporte trae el IVU combinado (una sola columna), se separa
// proporcionalmente usando ivu_rate_estatal/ivu_rate_municipal de la
// entidad y se marca ivu_split_estimado=true. Si el frontend mapea 2
// columnas de IVU por separado (reporte "Taxes" de Clover cuando sí
// distingue por tasa), se usan tal cual y se marca false.
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
  const provider: string = ["clover", "verifone", "square"].includes(body?.provider) ? body.provider : "otro";
  const nombreArchivo: string | null = body?.nombreArchivo ?? null;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha === "DMY" || body?.formatoFecha === "YMD" ? body.formatoFecha : "MDY";

  const columnaFecha: number | undefined = body?.columnaFecha;
  const columnaGross: number | undefined = body?.columnaGross;
  const columnaIvuCombinado: number | null = body?.columnaIvuCombinado ?? null;
  const columnaIvuEstatal: number | null = body?.columnaIvuEstatal ?? null;
  const columnaIvuMunicipal: number | null = body?.columnaIvuMunicipal ?? null;
  const columnaPropinas: number | null = body?.columnaPropinas ?? null;
  const columnaNeto: number | null = body?.columnaNeto ?? null;

  if (!entityId || !csv) {
    return NextResponse.json({ error: "Falta la entidad o el archivo." }, { status: 400 });
  }
  if (columnaFecha === undefined || columnaGross === undefined) {
    return NextResponse.json({ error: "Faltan columnas requeridas: Fecha y Venta Bruta." }, { status: 400 });
  }

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, ivu_rate_estatal, ivu_rate_municipal")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const tasaEstatal = Number(entidad.ivu_rate_estatal) || 10.5;
  const tasaMunicipal = Number(entidad.ivu_rate_municipal) || 1;
  const tasaTotal = tasaEstatal + tasaMunicipal;

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1);

  const importBatchId = randomUUID();
  const filasParaInsertar: Record<string, unknown>[] = [];
  let importados = 0;
  let errores = 0;

  for (const fila of filasDatos) {
    const fecha = normalizarFecha(fila[columnaFecha] ?? "", formatoFecha);
    const gross = normalizarMonto(fila[columnaGross] ?? "");

    if (!fecha || gross === null || gross <= 0) {
      errores++;
      continue;
    }

    const propinas = columnaPropinas !== null ? normalizarMonto(fila[columnaPropinas] ?? "") ?? 0 : 0;

    let ivuEstatal = 0;
    let ivuMunicipal = 0;
    let ivuSplitEstimado = true;

    if (columnaIvuEstatal !== null || columnaIvuMunicipal !== null) {
      ivuEstatal = columnaIvuEstatal !== null ? normalizarMonto(fila[columnaIvuEstatal] ?? "") ?? 0 : 0;
      ivuMunicipal = columnaIvuMunicipal !== null ? normalizarMonto(fila[columnaIvuMunicipal] ?? "") ?? 0 : 0;
      ivuSplitEstimado = false;
    } else if (columnaIvuCombinado !== null) {
      const ivuTotal = normalizarMonto(fila[columnaIvuCombinado] ?? "") ?? 0;
      // Reparte proporcional usando las tasas configuradas en la entidad —
      // estimado porque el reporte del POS no separaba estatal/municipal.
      ivuEstatal = tasaTotal > 0 ? Math.round(((ivuTotal * tasaEstatal) / tasaTotal) * 100) / 100 : 0;
      ivuMunicipal = tasaTotal > 0 ? Math.round((ivuTotal - ivuEstatal) * 100) / 100 : 0;
      ivuSplitEstimado = true;
    }

    const ivuMontoTotal = Math.round((ivuEstatal + ivuMunicipal) * 100) / 100;
    const neto = columnaNeto !== null ? normalizarMonto(fila[columnaNeto] ?? "") ?? gross - ivuMontoTotal - propinas : gross - ivuMontoTotal - propinas;

    filasParaInsertar.push({
      owner_id: userId,
      entity_id: entityId,
      provider,
      period_start: fecha,
      period_end: fecha,
      gross_sales: gross,
      ivu_monto_total: ivuMontoTotal,
      ivu_estatal_monto: ivuEstatal,
      ivu_municipal_monto: ivuMunicipal,
      ivu_split_estimado: ivuSplitEstimado,
      tips_monto: propinas,
      net_sales: Math.round(neto * 100) / 100,
      nombre_archivo: nombreArchivo,
      import_batch_id: importBatchId,
    });
    importados++;
  }

  if (filasParaInsertar.length > 0) {
    const { error: errInsert } = await supabase.from("pos_batch_uploads").insert(filasParaInsertar);
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, importados, errores, importBatchId: importados > 0 ? importBatchId : null });
}
