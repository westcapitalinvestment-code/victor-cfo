import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CSV descargable del tab Reportes de Facturación (2 sept 2026) — calcado
// del botón "CSV" del mockup. Igual que /api/transacciones/exportar: se
// vuelve a calcular todo server-side a partir de los mismos filtros que
// aplicó la pantalla (desde/hasta/clienteId/servicioId/categoria/estado/
// email/vista), en vez de mandar por query las filas ya armadas — así el
// link es corto y siempre refleja los datos reales, no lo que había en
// pantalla en el momento de hacer clic.
function escaparCsv(valor: string): string {
  if (valor.includes(",") || valor.includes('"') || valor.includes("\n")) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

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
    .select("id, numero, subtotal, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, client_id, clients(name, email)")
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

  const filas: string[] = [];

  if (vista === "servicio") {
    filas.push(["Servicio", "Líneas", "Total"].join(","));
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
    for (const s of [...mapa.values()].sort((a, b) => b.total - a.total)) {
      filas.push([escaparCsv(s.nombre), String(s.count), s.total.toFixed(2)].join(","));
    }
  } else if (vista === "categoria") {
    filas.push(["Categoría", "Líneas", "Total"].join(","));
    const mapa = new Map<string, { total: number; count: number }>();
    for (const it of items) {
      const key = it.services?.tipo ?? "Sin categoría";
      const actual = mapa.get(key) ?? { total: 0, count: 0 };
      actual.total += Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario);
      actual.count += 1;
      mapa.set(key, actual);
    }
    for (const [tipo, c] of [...mapa.entries()].sort((a, b) => b[1].total - a[1].total)) {
      filas.push([escaparCsv(tipo), String(c.count), c.total.toFixed(2)].join(","));
    }
  } else if (vista === "clienteServicio") {
    filas.push(["Cliente", "Servicio", "Total"].join(","));
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
    for (const r of [...mapa.values()].sort((a, b) => b.total - a.total)) {
      filas.push([escaparCsv(r.cliente), escaparCsv(r.servicio), r.total.toFixed(2)].join(","));
    }
  } else if (vista === "retenciones") {
    filas.push(["Cliente", "Facturas pagadas", "% retención", "Facturado", "Retenido"].join(","));
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
    for (const c of [...mapa.values()].sort((a, b) => b.retenido - a.retenido)) {
      filas.push([escaparCsv(c.nombre), String(c.count), `${c.pct}%`, c.facturado.toFixed(2), c.retenido.toFixed(2)].join(","));
    }
  } else if (vista === "flujo") {
    filas.push(["Mes", "Facturado", "Cobrado"].join(","));
    const mapa = new Map<string, { facturado: number; cobrado: number }>();
    for (const f of facturas) {
      const mes = String(f.fecha_emision).slice(0, 7);
      const actual = mapa.get(mes) ?? { facturado: 0, cobrado: 0 };
      actual.facturado += Number(f.subtotal);
      mapa.set(mes, actual);
    }
    // "Cobrado" por el mes real del pago (fecha_pago), no el de emisión —
    // mismo fix que ReportesTab (2 sept 2026). Fallback a fecha_emision
    // para facturas pagadas antes de que existiera este campo.
    for (const f of facturas) {
      if (f.estado !== "pagada") continue;
      const mesCobro = String(f.fecha_pago ?? f.fecha_emision).slice(0, 7);
      const actual = mapa.get(mesCobro) ?? { facturado: 0, cobrado: 0 };
      actual.cobrado += Number(f.total);
      mapa.set(mesCobro, actual);
    }
    for (const [mes, m] of [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      filas.push([mes, m.facturado.toFixed(2), m.cobrado.toFixed(2)].join(","));
    }
  } else {
    // "cliente" (default)
    filas.push(["Cliente", "Facturas", "Facturado", "Cobrado"].join(","));
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturas) {
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(nombre) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.subtotal);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    for (const c of [...mapa.values()].sort((a, b) => b.facturado - a.facturado)) {
      filas.push([escaparCsv(c.nombre), String(c.count), c.facturado.toFixed(2), c.cobrado.toFixed(2)].join(","));
    }
  }

  const csv = filas.join("\n");
  const nombreArchivo = `victor-cfo-reporte-${vista}_${desde}_a_${hasta}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
