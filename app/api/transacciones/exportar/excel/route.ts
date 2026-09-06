import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarReporteExcel, cargarLogoExcel, ColumnaReporte } from "@/lib/reporte-excel";
import { formatFecha, slugificar } from "@/lib/format";

// Excel descargable del reporte de Gastos — antes era un CSV plano (mismos
// datos, sin ningún estilo, texto por defecto de Windows/Excel); Joel lo
// subió como ejemplo de "reporte que da pena" (5 sept 2026). Se reemplaza
// por .xlsx con la misma identidad visual que el resto de reportes de la
// app — ver lib/reporte-excel.ts. Sustituye a la vieja
// /api/transacciones/exportar (CSV), que se eliminó.
//
// Acepta ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (opcional) para acotar el rango
// — si no se manda ninguno, exporta TODO el historial del usuario/entidad.
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
  const entityId = searchParams.get("entityId");

  if (entityId) {
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!entidad) {
      return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });
    }
  }

  let query = supabase
    .from("transactions")
    .select("fecha, description_raw, amount, hacienda_category_id, tipo_flujo")
    .eq("owner_id", user.id)
    .eq("es_duplicada", false)
    .order("fecha", { ascending: true });
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);

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

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";
  const logo = await cargarLogoExcel(entidad?.logo_r2_key);

  const ETIQUETA_TIPO: Record<string, string> = {
    gasto: "Gasto",
    ingreso: "Ingreso",
    transferencia: "Transferencia",
  };

  const filas = (transacciones ?? []).map((t) => {
    const categoria = t.hacienda_category_id ? categoriaPorId.get(t.hacienda_category_id) : null;
    const tipo = ETIQUETA_TIPO[t.tipo_flujo as string] ?? (Number(t.amount) > 0 ? "Gasto" : "Ingreso");
    const linea = categoria ? categoria.linea_anejo_m || categoria.linea_schedule_c || "" : "";
    return {
      fecha: formatFecha(t.fecha as string),
      descripcion: t.description_raw as string,
      categoria: categoria?.nombre ?? "Sin categorizar",
      linea,
      tipo,
      monto: Math.abs(Number(t.amount)),
    };
  });

  const columnas: ColumnaReporte[] = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Descripción", key: "descripcion", width: 42 },
    { header: "Categoría", key: "categoria", width: 26 },
    { header: "Línea Anejo M / Schedule C", key: "linea", width: 22 },
    { header: "Tipo", key: "tipo", width: 14 },
    { header: "Monto", key: "monto", width: 14, moneda: true },
  ];

  // Resumen arriba de la tabla — igual que el PDF (Ingresos/Gastos/
  // Transferencias/Neto). No se pone un total al pie de la columna "Monto"
  // porque esa columna mezcla Gasto/Ingreso/Transferencia en la misma
  // fila — sumarlos todos juntos daría un número sin significado contable;
  // este resumen ya da los totales reales por tipo.
  const totalIngreso = filas.reduce((s, f) => s + (f.tipo === "Ingreso" ? f.monto : 0), 0);
  const totalGasto = filas.reduce((s, f) => s + (f.tipo === "Gasto" ? f.monto : 0), 0);
  const totalTransferencia = filas.reduce((s, f) => s + (f.tipo === "Transferencia" ? f.monto : 0), 0);
  const neto = totalIngreso - totalGasto;
  const TEAL_OSCURO = "FF0F6B4E";
  const ROJO = "FFD44C3D";
  const GRIS = "FF6B7280";
  const moneda = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const buffer = await generarReporteExcel({
    tituloEmpresa: nombreTitular,
    tituloReporte: "Reporte de Ingresos/Gastos",
    periodo: desde || hasta ? `${desde ? formatFecha(desde) : "inicio"} — ${hasta ? formatFecha(hasta) : "hoy"}` : "Historial completo",
    logo,
    resumen: [
      { label: "Ingresos", valor: moneda(totalIngreso), colorHex: TEAL_OSCURO },
      { label: "Gastos", valor: moneda(totalGasto), colorHex: ROJO },
      ...(totalTransferencia > 0 ? [{ label: "Transferencias internas (no afectan neto)", valor: moneda(totalTransferencia), colorHex: GRIS }] : []),
      { label: "Neto (ingresos - gastos)", valor: moneda(neto), colorHex: neto >= 0 ? TEAL_OSCURO : ROJO, fuerte: true },
    ],
    columnas,
    filas,
    nombreHoja: "Gastos",
  });

  const nombreArchivo = `${slugificar(nombreTitular)}-gastos${desde ? `_${desde}` : ""}${hasta ? `_a_${hasta}` : ""}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
