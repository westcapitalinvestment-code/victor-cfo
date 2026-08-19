import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";

// Paso 1 de subir un CSV: solo lee las columnas y las primeras filas, para
// que el frontend le pregunte al usuario "¿cuál columna es la fecha? ¿cuál
// es el monto?" — no escribe nada en la base de datos todavía. Cada banco/
// tarjeta (y QuickBooks) exporta con columnas distintas, así que no
// adivinamos el formato, se lo confirmamos al usuario una vez por cuenta.
const MAX_FILAS_PREVIEW = 5;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const csv: string | undefined = body?.csv;
  if (!csv || typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "No se recibió contenido de CSV." }, { status: 400 });
  }

  const filas = parseCsv(csv);
  if (filas.length === 0) {
    return NextResponse.json({ error: "El archivo está vacío o no se pudo leer." }, { status: 400 });
  }

  const encabezados = filas[0];
  const filasDatos = filas.slice(1);

  if (filasDatos.length === 0) {
    return NextResponse.json({ error: "El archivo solo tiene encabezados, no hay transacciones." }, { status: 400 });
  }

  return NextResponse.json({
    columnas: encabezados,
    filasPreview: filasDatos.slice(0, MAX_FILAS_PREVIEW),
    totalFilas: filasDatos.length,
  });
}
