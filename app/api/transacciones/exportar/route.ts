import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reporte descargable de gastos para el contable — esto era lo que faltaba
// de verdad: la pantalla de Gastos ya mostraba un resumen por categoría en
// pantalla (0076), pero nunca hubo forma de sacar un archivo para mandarle
// a un CPA. CSV en vez de PDF porque abre directo en Excel/Google Sheets,
// que es donde la mayoría de los contables en PR realmente trabajan.
//
// Acepta ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (opcional) para acotar el rango
// — si no se manda ninguno, exporta TODO el historial personal del usuario.
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
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  let query = supabase
    .from("transactions")
    .select("fecha, description_raw, amount, hacienda_category_id, tipo_flujo")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: true });

  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);

  const { data: transacciones, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: categorias } = await supabase
    .from("hacienda_categories")
    .select("id, nombre, linea_anejo_m, linea_schedule_c");
  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c]));

  const filas = [
    ["Fecha", "Descripción", "Categoría", "Línea Anejo M / Schedule C", "Tipo", "Monto"].join(","),
  ];

  // Antes esto decidía "Gasto" o "Ingreso" solo mirando el signo del monto
  // — un pago de tarjeta de crédito hecho desde el checking salía como
  // "Gasto" aquí Y como "Ingreso" en la fila espejo de la tarjeta, doblando
  // esa plata en el reporte que ve el contable. Ahora usa tipo_flujo, que
  // ya viene calculado correctamente desde la base de datos (por tipo de
  // cuenta, no solo el signo) — "Transferencia" para esos pagos internos,
  // que no son gasto ni ingreso nuevo.
  const ETIQUETA_TIPO: Record<string, string> = {
    gasto: "Gasto",
    ingreso: "Ingreso",
    transferencia: "Transferencia",
  };

  for (const t of transacciones ?? []) {
    const categoria = t.hacienda_category_id ? categoriaPorId.get(t.hacienda_category_id) : null;
    const tipo = ETIQUETA_TIPO[t.tipo_flujo] ?? (Number(t.amount) > 0 ? "Gasto" : "Ingreso");
    const linea = categoria ? categoria.linea_anejo_m || categoria.linea_schedule_c || "" : "";
    filas.push(
      [
        t.fecha,
        escaparCsv(t.description_raw),
        escaparCsv(categoria?.nombre ?? "Sin categorizar"),
        escaparCsv(linea),
        tipo,
        Math.abs(Number(t.amount)).toFixed(2),
      ].join(",")
    );
  }

  const csv = filas.join("\n");
  const nombreArchivo = `victor-cfo-gastos${desde ? `_${desde}` : ""}${hasta ? `_a_${hasta}` : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
