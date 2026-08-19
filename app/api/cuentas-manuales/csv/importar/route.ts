import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, normalizarFecha, normalizarMonto } from "@/lib/csv";

// Paso 2 de subir un CSV: ya con el mapeo de columnas que el usuario
// confirmó (después de ver el preview), parsea TODO el archivo, calcula
// cada monto con el signo correcto, y las inserta en `transactions` como
// cualquier otra — eso hace que el trigger trg_auto_categorize (0001) las
// categorice solas igual que las de Plaid, sin código extra.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const manualAccountId: string | undefined = body?.manualAccountId;
  const csv: string | undefined = body?.csv;
  const columnaFecha: number | undefined = body?.columnaFecha;
  const columnaDescripcion: number | undefined = body?.columnaDescripcion;
  const columnaMonto: number | null = body?.columnaMonto ?? null;
  const columnaDebito: number | null = body?.columnaDebito ?? null;
  const columnaCredito: number | null = body?.columnaCredito ?? null;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha ?? "MDY";
  const invertirSigno: boolean = !!body?.invertirSigno;

  if (!manualAccountId || !csv) {
    return NextResponse.json({ error: "Falta la cuenta o el archivo." }, { status: 400 });
  }
  if (columnaFecha === undefined || columnaDescripcion === undefined) {
    return NextResponse.json({ error: "Falta indicar cuál columna es la fecha y cuál la descripción." }, { status: 400 });
  }
  if (columnaMonto === null && columnaDebito === null && columnaCredito === null) {
    return NextResponse.json({ error: "Falta indicar la columna de monto (o débito/crédito)." }, { status: 400 });
  }

  const { data: cuenta } = await supabase
    .from("manual_accounts")
    .select("id, name, current_balance")
    .eq("id", manualAccountId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "No se encontró esa cuenta manual." }, { status: 404 });

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1); // fila 0 = encabezados, ya confirmados en el preview

  let errores = 0;
  const filasValidas: { owner_id: string; entity_id: null; manual_account_id: string; origen: string; description_raw: string; amount: number; fecha: string }[] = [];

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
      owner_id: user.id,
      entity_id: null,
      manual_account_id: manualAccountId,
      origen: "manual_csv",
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

  // ignoreDuplicates + el índice único parcial (manual_account_id, fecha,
  // description_raw, amount) es lo que evita duplicar si el usuario sube el
  // mismo estado de cuenta dos veces, o un rango que se solapa con una
  // subida anterior. .select() después de un upsert con ON CONFLICT DO
  // NOTHING solo devuelve las filas que SÍ se insertaron — así contamos
  // duplicadas por diferencia, no hace falta una consulta aparte.
  const { data: insertadas, error } = await supabase
    .from("transactions")
    .upsert(filasValidas, { onConflict: "manual_account_id,fecha,description_raw,amount", ignoreDuplicates: true })
    .select("id");

  if (error) return NextResponse.json({ error: `No se pudo importar: ${error.message}` }, { status: 500 });

  const totalInsertadas = insertadas?.length ?? 0;
  const duplicadas = filasValidas.length - totalInsertadas;

  return NextResponse.json({
    importadas: totalInsertadas,
    duplicadas,
    errores,
    totalFilasEnArchivo: filasDatos.length,
  });
}
