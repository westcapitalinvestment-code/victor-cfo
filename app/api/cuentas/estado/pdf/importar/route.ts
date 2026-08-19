import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importarTransaccionesDedup } from "@/lib/importar-transacciones";

// Paso 2 de subir un PDF: recibe las transacciones que Claude extrajo en
// /pdf/extraer Y que el usuario ya revisó/confirmó en pantalla (puede
// editar o quitar filas antes de llegar aquí — igual que con CSV, nunca se
// guarda nada sin que el usuario vea el preview primero). Misma lógica de
// dedup que CSV, vía el helper compartido.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const origenCuenta: "plaid" | "manual" | undefined = body?.origenCuenta;
  const cuentaId: string | undefined = body?.cuentaId;
  const transacciones: unknown[] | undefined = body?.transacciones;

  if (origenCuenta !== "plaid" && origenCuenta !== "manual") {
    return NextResponse.json({ error: "Falta indicar a qué tipo de cuenta va (plaid o manual)." }, { status: 400 });
  }
  if (!cuentaId || !Array.isArray(transacciones) || transacciones.length === 0) {
    return NextResponse.json({ error: "Falta la cuenta o las transacciones a importar." }, { status: 400 });
  }

  const tablaCuenta = origenCuenta === "manual" ? "manual_accounts" : "plaid_accounts";
  const columnaId = origenCuenta === "manual" ? "id" : "plaid_account_id";
  const { data: cuenta } = await supabase
    .from(tablaCuenta)
    .select(columnaId)
    .eq(columnaId, cuentaId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "No se encontró esa cuenta." }, { status: 404 });

  const filasValidas: { description_raw: string; amount: number; fecha: string }[] = [];
  let errores = 0;
  for (const t of transacciones) {
    const fila = t as { fecha?: string; descripcion?: string; monto?: number };
    if (
      !fila.fecha ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha) ||
      !fila.descripcion ||
      typeof fila.monto !== "number" ||
      !Number.isFinite(fila.monto) ||
      fila.monto === 0
    ) {
      errores++;
      continue;
    }
    filasValidas.push({ description_raw: fila.descripcion.trim(), amount: fila.monto, fecha: fila.fecha });
  }

  if (filasValidas.length === 0) {
    return NextResponse.json({ error: "Ninguna de las transacciones recibidas es válida." }, { status: 400 });
  }

  try {
    const { importadas, duplicadas } = await importarTransaccionesDedup(supabase, {
      ownerId: user.id,
      origenCuenta,
      cuentaId,
      origen: "pdf",
      filas: filasValidas,
    });

    return NextResponse.json({ importadas, duplicadas, errores });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo importar: ${err instanceof Error ? err.message : "error desconocido"}` },
      { status: 500 }
    );
  }
}
