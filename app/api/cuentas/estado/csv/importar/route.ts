import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, normalizarFecha, normalizarMonto } from "@/lib/csv";
import { importarTransaccionesDedup } from "@/lib/importar-transacciones";
import { subirArchivoR2 } from "@/lib/r2";

// Versión unificada del "paso 2" de subir un CSV: a diferencia de la
// original (/api/cuentas-manuales/csv/importar, que solo servía cuentas
// manuales), esta puede insertar en CUALQUIER cuenta — una manual (Apple
// Card) o una YA conectada por Plaid, para rellenar el hueco de historial
// que Plaid no trajo (algunos bancos, ej. BPPR, solo entregan ~45 días).
//
// El "paso 1" (preview de columnas) sigue siendo
// /api/cuentas-manuales/csv/preview sin cambios — no le importa a qué
// cuenta va, solo lee el CSV.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const origenCuenta: "plaid" | "manual" | undefined = body?.origenCuenta;
  const cuentaId: string | undefined = body?.cuentaId;
  const csv: string | undefined = body?.csv;
  const columnaFecha: number | undefined = body?.columnaFecha;
  const columnaDescripcion: number | undefined = body?.columnaDescripcion;
  const columnaMonto: number | null = body?.columnaMonto ?? null;
  const columnaDebito: number | null = body?.columnaDebito ?? null;
  const columnaCredito: number | null = body?.columnaCredito ?? null;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha ?? "MDY";
  const invertirSigno: boolean = !!body?.invertirSigno;
  const nombreArchivo: string = body?.nombreArchivo || "estado.csv";

  if (origenCuenta !== "plaid" && origenCuenta !== "manual") {
    return NextResponse.json({ error: "Falta indicar a qué tipo de cuenta va (plaid o manual)." }, { status: 400 });
  }
  if (!cuentaId || !csv) {
    return NextResponse.json({ error: "Falta la cuenta o el archivo." }, { status: 400 });
  }
  if (columnaFecha === undefined || columnaDescripcion === undefined) {
    return NextResponse.json({ error: "Falta indicar cuál columna es la fecha y cuál la descripción." }, { status: 400 });
  }
  if (columnaMonto === null && columnaDebito === null && columnaCredito === null) {
    return NextResponse.json({ error: "Falta indicar la columna de monto (o débito/crédito)." }, { status: 400 });
  }

  // Confirma que la cuenta es de verdad del usuario. RLS ya lo protege por
  // debajo, pero este chequeo explícito da un 404 con mensaje claro en vez
  // de un error genérico si alguien manda un id que no le pertenece.
  const tablaCuenta = origenCuenta === "manual" ? "manual_accounts" : "plaid_accounts";
  const columnaId = origenCuenta === "manual" ? "id" : "plaid_account_id";
  const { data: cuenta } = await supabase
    .from(tablaCuenta)
    .select(columnaId)
    .eq(columnaId, cuentaId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "No se encontró esa cuenta." }, { status: 404 });

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1); // fila 0 = encabezados, ya confirmados en el preview

  let errores = 0;
  const filasValidas: { description_raw: string; amount: number; fecha: string }[] = [];

  for (const fila of filasDatos) {
    const fechaRaw = fila[columnaFecha];
    const descripcionRaw = fila[columnaDescripcion];
    if (!fechaRaw || !descripcionRaw) {
      errores++;
      continue;
    }

    const fecha = normalizarFecha(fechaRaw, formatoFecha);
    if (!fecha) {
      errores++;
      continue;
    }

    let monto: number | null = null;
    if (columnaMonto !== null) {
      monto = normalizarMonto(fila[columnaMonto] ?? "");
    } else {
      // Débito = dinero que sale (gasto, positivo en nuestra convención).
      // Crédito = dinero que entra (ingreso, negativo). Si una de las dos
      // columnas viene vacía en esta fila (lo normal — cada fila suele
      // llenar solo una), normalizarMonto devuelve null y lo tratamos como 0.
      const debito = columnaDebito !== null ? normalizarMonto(fila[columnaDebito] ?? "") ?? 0 : 0;
      const credito = columnaCredito !== null ? normalizarMonto(fila[columnaCredito] ?? "") ?? 0 : 0;
      monto = debito - credito;
    }
    if (monto === null || monto === 0) {
      errores++;
      continue;
    }
    if (invertirSigno) monto = -monto;

    filasValidas.push({
      description_raw: descripcionRaw.trim() || "Transacción importada",
      amount: monto,
      fecha,
    });
  }

  if (filasValidas.length === 0) {
    return NextResponse.json(
      { error: `No se pudo leer ninguna fila válida del archivo (${errores} con error). Revisa el mapeo de columnas.` },
      { status: 400 }
    );
  }

  try {
    // Fila propia por subida (migración 0072, 6 sept 2026: Joel subió un
    // estado a la cuenta equivocada y no había forma exacta de deshacerlo)
    // — se crea ANTES de insertar las transacciones para poder enlazarlas
    // desde el primer momento. Si algo de aquí en adelante falla, la fila
    // queda con total_importadas=0 y sin transacciones asociadas; no hace
    // daño dejarla huérfana (se puede borrar como cualquier otra subida).
    const { data: subida, error: errorSubida } = await supabase
      .from("statement_uploads")
      .insert({
        owner_id: user.id,
        origen_cuenta: origenCuenta,
        plaid_account_id: origenCuenta === "plaid" ? cuentaId : null,
        manual_account_id: origenCuenta === "manual" ? cuentaId : null,
        origen: "csv",
        nombre_archivo: nombreArchivo,
      })
      .select("id")
      .single();
    if (errorSubida || !subida) {
      throw new Error(errorSubida?.message || "No se pudo registrar la subida.");
    }

    // Guarda el CSV original en R2 — antes se procesaba en memoria y se
    // descartaba; guardarlo permite auditar la subida más adelante y (más
    // importante) que VICTOR pueda leerlo si el usuario pregunta por algo
    // que solo está en ese archivo. Nunca debe tumbar la importación si R2
    // falla — las transacciones son lo que de verdad le importa al usuario.
    try {
      await subirArchivoR2(`estados-cuenta/${user.id}/${subida.id}.csv`, Buffer.from(csv, "utf-8"), "text/csv");
      await supabase.from("statement_uploads").update({ r2_key: `estados-cuenta/${user.id}/${subida.id}.csv` }).eq("id", subida.id);
    } catch (err) {
      console.error("No se pudo guardar el CSV original en R2 (no afecta la importación):", err);
    }

    const { importadas, duplicadas } = await importarTransaccionesDedup(supabase, {
      ownerId: user.id,
      origenCuenta,
      cuentaId,
      origen: "csv",
      filas: filasValidas,
      statementUploadId: subida.id,
    });

    await supabase
      .from("statement_uploads")
      .update({ total_importadas: importadas, total_duplicadas: duplicadas })
      .eq("id", subida.id);

    return NextResponse.json({
      importadas,
      duplicadas,
      errores,
      totalFilasEnArchivo: filasDatos.length,
      statementUploadId: subida.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo importar: ${err instanceof Error ? err.message : "error desconocido"}` },
      { status: 500 }
    );
  }
}
