import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarReporteExcel, cargarLogoExcel, ColumnaReporte, FilaTotal } from "@/lib/reporte-excel";
import { formatFecha, slugificar } from "@/lib/format";

// Excel descargable del tab Reportes de Facturación — antes era un CSV
// plano (mismos datos, sin ningún estilo); Joel lo subió como ejemplo de
// "reporte que da pena" (5 sept 2026) al lado de la app, que sí se ve
// impecable. Se reemplaza por .xlsx con la misma identidad visual del PDF
// de este mismo tab (teal, totales en negrita, marca VICTOR CFO al pie) —
// ver lib/reporte-excel.ts. La lógica de datos (mismos filtros/vistas que
// aplicó la pantalla) es igual a la del CSV original, solo cambia cómo se
// escribe el archivo.
function estaVencida(estado: string, fechaVencimiento: string | null): boolean {
  return estado !== "pagada" && estado !== "borrador" && !!fechaVencimiento && fechaVencimiento < new Date().toISOString().slice(0, 10);
}

function estadoMostrado(estado: string, fechaVencimiento: string | null): string {
  if (estado === "pagada" || estado === "borrador") return estado;
  return estaVencida(estado, fechaVencimiento) ? "vencida" : estado;
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
  const desde = searchParams.get("desde") || "0000-01-01";
  const hasta = searchParams.get("hasta") || new Date().toISOString().slice(0, 10);
  const clienteId = searchParams.get("clienteId");
  const servicioId = searchParams.get("servicioId");
  const categoria = searchParams.get("categoria");
  const estadoFiltro = searchParams.get("estado");
  const email = searchParams.get("email");
  const entityId = searchParams.get("entityId");
  const vista = searchParams.get("vista") || "cliente";

  let facturasQuery = supabase
    .from("invoices")
    .select("id, numero, subtotal, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, client_id, clients(name, email)")
    .eq("owner_id", user.id)
    .neq("estado", "borrador")
    .gte("fecha_emision", desde)
    .lte("fecha_emision", hasta);
  if (clienteId) facturasQuery = facturasQuery.eq("client_id", clienteId);
  if (entityId) facturasQuery = facturasQuery.eq("entity_id", entityId);

  const { data: facturasData, error } = await facturasQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let facturas = (facturasData ?? []) as any[];
  if (estadoFiltro) facturas = facturas.filter((f) => estadoMostrado(f.estado, f.fecha_vencimiento) === estadoFiltro);
  if (email) facturas = facturas.filter((f) => (f.clients?.email ?? "").toLowerCase().includes(email.toLowerCase()));

  const { data: entidad } = entityId
    ? await supabase.from("business_entities").select("name, logo_r2_key").eq("id", entityId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: owner } = entityId ? { data: null } : await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const nombreTitular = entidad?.name || owner?.full_name || "VICTOR CFO";
  const logo = await cargarLogoExcel(entidad?.logo_r2_key);

  const idsFacturas = facturas.map((f) => f.id);

  let items: any[] = [];
  if (vista === "servicio" || vista === "categoria" || vista === "clienteServicio" || servicioId || categoria) {
    const { data: itemsData } = await supabase
      .from("invoice_items")
      .select("invoice_id, descripcion, service_id, subtotal_linea, cantidad, precio_unitario, services(nombre, tipo)")
      .in("invoice_id", idsFacturas.length > 0 ? idsFacturas : ["00000000-0000-0000-0000-000000000000"]);
    items = (itemsData ?? []).filter((it: any) => {
      if (servicioId && it.service_id !== servicioId) return false;
      if (categoria && it.services?.tipo !== categoria) return false;
      return true;
    });
  }

  const TITULOS_VISTA: Record<string, string> = {
    cliente: "Reporte de Facturación — Por cliente",
    servicio: "Reporte de Facturación — Por servicio",
    categoria: "Reporte de Facturación — Por categoría",
    clienteServicio: "Reporte de Facturación — Cliente + servicio",
    retenciones: "Reporte de Facturación — Retenciones SURI",
    flujo: "Reporte de Facturación — Flujo de cobro",
  };

  let columnas: ColumnaReporte[] = [];
  let filas: Record<string, string | number>[] = [];
  let totales: FilaTotal[] = [];

  if (vista === "servicio") {
    columnas = [
      { header: "Servicio", key: "nombre", width: 40 },
      { header: "Líneas", key: "count", width: 12, numero: true },
      { header: "Total", key: "total", width: 16, moneda: true },
    ];
    const mapa = new Map<string, { nombre: string; total: number; count: number }>();
    for (const it of items) {
      const key = it.service_id ?? `desc:${it.descripcion}`;
      const nombre = it.services?.nombre ?? it.descripcion;
      const total = Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario);
      const actual = mapa.get(key) ?? { nombre, total: 0, count: 0 };
      actual.total += total;
      actual.count += 1;
      mapa.set(key, actual);
    }
    const lista = [...mapa.values()].sort((a, b) => b.total - a.total);
    filas = lista.map((s) => ({ nombre: s.nombre, count: s.count, total: s.total }));
    totales = [
      { key: "count", valor: lista.reduce((s, x) => s + x.count, 0) },
      { key: "total", valor: lista.reduce((s, x) => s + x.total, 0) },
    ];
  } else if (vista === "categoria") {
    columnas = [
      { header: "Categoría", key: "tipo", width: 32 },
      { header: "Líneas", key: "count", width: 12, numero: true },
      { header: "Total", key: "total", width: 16, moneda: true },
    ];
    const mapa = new Map<string, { total: number; count: number }>();
    for (const it of items) {
      const key = it.services?.tipo ?? "Sin categoría";
      const actual = mapa.get(key) ?? { total: 0, count: 0 };
      actual.total += Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario);
      actual.count += 1;
      mapa.set(key, actual);
    }
    const lista = [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
    filas = lista.map(([tipo, c]) => ({ tipo, count: c.count, total: c.total }));
    totales = [
      { key: "count", valor: lista.reduce((s, [, c]) => s + c.count, 0) },
      { key: "total", valor: lista.reduce((s, [, c]) => s + c.total, 0) },
    ];
  } else if (vista === "clienteServicio") {
    columnas = [
      { header: "Cliente", key: "cliente", width: 32 },
      { header: "Servicio", key: "servicio", width: 32 },
      { header: "Total", key: "total", width: 16, moneda: true },
    ];
    const facturaPorId = new Map(facturas.map((f) => [f.id, f]));
    const mapa = new Map<string, { cliente: string; servicio: string; total: number }>();
    for (const it of items) {
      const f = facturaPorId.get(it.invoice_id);
      const cliente = f?.clients?.name ?? "Sin cliente";
      const servicio = it.services?.nombre ?? it.descripcion;
      const key = `${cliente}::${servicio}`;
      const actual = mapa.get(key) ?? { cliente, servicio, total: 0 };
      actual.total += Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario);
      mapa.set(key, actual);
    }
    const lista = [...mapa.values()].sort((a, b) => b.total - a.total);
    filas = lista.map((r) => ({ cliente: r.cliente, servicio: r.servicio, total: r.total }));
    totales = [{ key: "total", valor: lista.reduce((s, x) => s + x.total, 0) }];
  } else if (vista === "retenciones") {
    columnas = [
      { header: "Cliente", key: "nombre", width: 32 },
      { header: "Facturas pagadas", key: "count", width: 16, numero: true },
      { header: "% retención", key: "pctTexto", width: 12 },
      { header: "Facturado", key: "facturado", width: 16, moneda: true },
      { header: "Retenido", key: "retenido", width: 16, moneda: true },
    ];
    const mapa = new Map<string, { nombre: string; retenido: number; facturado: number; pct: number; count: number }>();
    for (const f of facturas) {
      if (f.estado !== "pagada") continue;
      const monto = Number(f.retencion_monto || 0);
      if (monto <= 0) continue;
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, retenido: 0, facturado: 0, pct: Number(f.retencion_pct || 0), count: 0 };
      actual.retenido += monto;
      actual.facturado += Number(f.total) + monto;
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    const lista = [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
    filas = lista.map((c) => ({ nombre: c.nombre, count: c.count, pctTexto: `${c.pct}%`, facturado: c.facturado, retenido: c.retenido }));
    totales = [
      { key: "count", valor: lista.reduce((s, x) => s + x.count, 0) },
      { key: "facturado", valor: lista.reduce((s, x) => s + x.facturado, 0) },
      { key: "retenido", valor: lista.reduce((s, x) => s + x.retenido, 0) },
    ];
  } else if (vista === "flujo") {
    columnas = [
      { header: "Mes", key: "mes", width: 16 },
      { header: "Facturado", key: "facturado", width: 16, moneda: true },
      { header: "Cobrado", key: "cobrado", width: 16, moneda: true },
    ];
    const mapa = new Map<string, { facturado: number; cobrado: number }>();
    for (const f of facturas) {
      const mes = String(f.fecha_emision).slice(0, 7);
      const actual = mapa.get(mes) ?? { facturado: 0, cobrado: 0 };
      actual.facturado += Number(f.subtotal);
      mapa.set(mes, actual);
    }
    for (const f of facturas) {
      if (f.estado !== "pagada") continue;
      const mesCobro = String((f as any).fecha_pago ?? f.fecha_emision).slice(0, 7);
      const actual = mapa.get(mesCobro) ?? { facturado: 0, cobrado: 0 };
      actual.cobrado += Number(f.total);
      mapa.set(mesCobro, actual);
    }
    const lista = [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    filas = lista.map(([mes, m]) => ({ mes, facturado: m.facturado, cobrado: m.cobrado }));
    totales = [
      { key: "facturado", valor: lista.reduce((s, [, m]) => s + m.facturado, 0) },
      { key: "cobrado", valor: lista.reduce((s, [, m]) => s + m.cobrado, 0) },
    ];
  } else {
    // "cliente" (default)
    columnas = [
      { header: "Cliente", key: "nombre", width: 32 },
      { header: "Facturas", key: "count", width: 12, numero: true },
      { header: "Facturado", key: "facturado", width: 16, moneda: true },
      { header: "Cobrado", key: "cobrado", width: 16, moneda: true },
    ];
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturas) {
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.subtotal);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    const lista = [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
    filas = lista.map((c) => ({ nombre: c.nombre, count: c.count, facturado: c.facturado, cobrado: c.cobrado }));
    totales = [
      { key: "count", valor: lista.reduce((s, x) => s + x.count, 0) },
      { key: "facturado", valor: lista.reduce((s, x) => s + x.facturado, 0) },
      { key: "cobrado", valor: lista.reduce((s, x) => s + x.cobrado, 0) },
    ];
  }

  const buffer = await generarReporteExcel({
    tituloEmpresa: nombreTitular,
    tituloReporte: TITULOS_VISTA[vista] ?? "Reporte de Facturación",
    periodo: `${formatFecha(desde)} — ${formatFecha(hasta)}`,
    logo,
    columnas,
    filas,
    totales,
    nombreHoja: "Facturación",
  });

  const nombreArchivo = `${slugificar(nombreTitular)}-facturacion-${vista}_${desde}_a_${hasta}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
