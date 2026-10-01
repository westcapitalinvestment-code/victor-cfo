import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autenticarApiKey, tieneScope } from "@/lib/api-auth";
import { fechaHoyPR } from "@/lib/hora-pr";

// API pública v1 — Facturas. Ver API.md en la raíz del proyecto.
//
// El cálculo de POST (subtotal/IVU/retención/total/numeración correlativa)
// replica la misma lógica de negocio que calcularFactura() en
// lib/victor/tools.ts (usada por VICTOR al crear facturas por chat) y por
// nueva-factura-form.tsx en pantalla, para que una factura creada por la
// API dé el mismo resultado que si el usuario la hubiera armado a mano.

type LineaInput = {
  descripcion: string;
  cantidad?: number;
  precio_unitario: number;
  servicio_id?: string | null;
};

export async function GET(request: Request) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!tieneScope(auth.scopes, "facturas:leer")) {
    return NextResponse.json({ error: "Esta API key no tiene el scope 'facturas:leer'." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const desde = (page - 1) * limit;
  const hasta = desde + limit - 1;

  const estado = url.searchParams.get("estado");
  const clienteId = url.searchParams.get("cliente_id");
  const desdeFecha = url.searchParams.get("desde");
  const hastaFecha = url.searchParams.get("hasta");

  const admin = createAdminClient();
  let query = admin
    .from("invoices")
    .select(
      "id, numero, client_id, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, clients(name)",
      { count: "exact" }
    )
    .eq("owner_id", auth.ownerId)
    .order("fecha_emision", { ascending: false })
    .range(desde, hasta);

  if (auth.entityId) query = query.eq("entity_id", auth.entityId);
  if (estado) query = query.eq("estado", estado);
  if (clienteId) query = query.eq("client_id", clienteId);
  if (desdeFecha) query = query.gte("fecha_emision", desdeFecha);
  if (hastaFecha) query = query.lte("fecha_emision", hastaFecha);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: (data ?? []).map((f) => ({
      id: f.id,
      numero: f.numero,
      cliente_id: f.client_id,
      cliente_nombre: (f.clients as { name?: string } | null)?.name ?? null,
      subtotal: f.subtotal,
      ivu_pct: f.ivu_pct,
      ivu_monto: f.ivu_monto,
      retencion_pct: f.retencion_pct,
      retencion_monto: f.retencion_monto,
      total: f.total,
      estado: f.estado,
      fecha_emision: f.fecha_emision,
      fecha_vencimiento: f.fecha_vencimiento,
      fecha_pago: f.fecha_pago,
    })),
    page,
    limit,
    total: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!tieneScope(auth.scopes, "facturas:escribir")) {
    return NextResponse.json({ error: "Esta API key no tiene el scope 'facturas:escribir'." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido en el cuerpo de la request." }, { status: 400 });
  }

  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id : "";
  const lineasRaw = Array.isArray(body.lineas) ? (body.lineas as LineaInput[]) : [];
  if (!clienteId) return NextResponse.json({ error: "Falta 'cliente_id' (requerido)." }, { status: 400 });
  if (lineasRaw.length === 0) {
    return NextResponse.json({ error: "Falta 'lineas' — al menos una con descripcion y precio_unitario." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver entidad: la de la key si está fija, si no la única entidad
  // activa del owner, o la mandada explícita en el body si el owner tiene
  // varias y la key no está fija a ninguna.
  let entityId = auth.entityId;
  if (!entityId) {
    if (typeof body.entity_id === "string") {
      entityId = body.entity_id;
    } else {
      const { data: entidades } = await admin
        .from("business_entities")
        .select("id")
        .eq("owner_id", auth.ownerId)
        .eq("active", true);
      if (!entidades || entidades.length === 0) {
        return NextResponse.json({ error: "La cuenta no tiene ninguna entidad de negocio activa." }, { status: 400 });
      }
      if (entidades.length > 1) {
        return NextResponse.json(
          { error: "La cuenta tiene varias entidades — manda 'entity_id' explícito en el body." },
          { status: 400 }
        );
      }
      entityId = entidades[0].id;
    }
  }

  const { data: entidad, error: entidadError } = await admin
    .from("business_entities")
    .select(
      "id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, invoice_prefix, invoice_start_number, default_payment_terms, client_retention_situation"
    )
    .eq("id", entityId)
    .eq("owner_id", auth.ownerId)
    .maybeSingle();
  if (entidadError || !entidad) {
    return NextResponse.json({ error: "entity_id no pertenece a esta cuenta o no existe." }, { status: 400 });
  }

  const { data: cliente, error: clienteError } = await admin
    .from("clients")
    .select("id, name, es_negocio, retention_pct, ivu_exempt_reseller")
    .eq("id", clienteId)
    .eq("owner_id", auth.ownerId)
    .maybeSingle();
  if (clienteError || !cliente) {
    return NextResponse.json({ error: "cliente_id no pertenece a esta cuenta o no existe." }, { status: 400 });
  }

  // Catálogo de servicios (para exención de IVU y detalle), igual criterio
  // que calcularFactura() en lib/victor/tools.ts.
  const { data: catalogo } = await admin
    .from("services")
    .select("id, descripcion, ivu_exento")
    .eq("owner_id", auth.ownerId)
    .eq("activo", true);
  const catalogoPorId = new Map((catalogo ?? []).map((s) => [s.id, s]));

  const lineas: {
    descripcion: string;
    detalle: string | null;
    cantidad: number;
    precioUnitario: number;
    servicioId: string | null;
    subtotalLinea: number;
    exenta: boolean;
  }[] = [];

  for (const l of lineasRaw) {
    const descripcion = String(l.descripcion ?? "").trim();
    const precioUnitario = Number(l.precio_unitario);
    if (!descripcion || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
      return NextResponse.json(
        { error: `Línea inválida (falta descripcion o precio_unitario válido): ${JSON.stringify(l)}` },
        { status: 400 }
      );
    }
    const cantidad = Number.isFinite(Number(l.cantidad)) && Number(l.cantidad) > 0 ? Number(l.cantidad) : 1;
    const servicio = l.servicio_id ? catalogoPorId.get(l.servicio_id) : null;

    lineas.push({
      descripcion,
      detalle: servicio?.descripcion ?? null,
      cantidad,
      precioUnitario,
      servicioId: servicio ? l.servicio_id ?? null : null,
      subtotalLinea: cantidad * precioUnitario,
      exenta: servicio?.ivu_exento ?? false,
    });
  }

  const subtotal = lineas.reduce((sum, l) => sum + l.subtotalLinea, 0);
  const subtotalGravable = lineas.reduce((sum, l) => sum + (l.exenta ? 0 : l.subtotalLinea), 0);
  const ivuAplicaEstaFactura = entidad.ivu_applies && !cliente.ivu_exempt_reseller;
  const ivuPct = ivuAplicaEstaFactura
    ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
    : 0;
  const ivuMonto = subtotalGravable * (ivuPct / 100);
  // Desglose estatal/municipal (migración 0124, #782) — ver comentario en
  // nueva-factura-form.tsx.
  const ivuEstatalMonto = ivuAplicaEstaFactura ? subtotalGravable * (Number(entidad.ivu_rate_estatal || 0) / 100) : 0;
  const ivuMunicipalMonto = ivuAplicaEstaFactura ? subtotalGravable * (Number(entidad.ivu_rate_municipal || 0) / 100) : 0;

  let retencionPct = 0;
  if (cliente.es_negocio && Number(cliente.retention_pct) > 0) {
    retencionPct = Number(cliente.retention_pct);
  } else if (entidad.client_retention_situation === "10") {
    retencionPct = 10;
  } else if (entidad.client_retention_situation === "6") {
    retencionPct = 6;
  }
  const retencionMonto = subtotal * (retencionPct / 100);
  const total = subtotal + ivuMonto - retencionMonto;

  // Número consecutivo por entidad — mismo cálculo (no 100% a prueba de
  // carreras, misma nota que calcularFactura()) que el resto de la app.
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", auth.ownerId)
    .eq("entity_id", entidad.id);
  const numero = `${entidad.invoice_prefix}-${entidad.invoice_start_number + (count ?? 0)}`;

  const hoyStr = fechaHoyPR();
  const diasTermino = (() => {
    const m = (entidad.default_payment_terms ?? "").match(/(\d+)/);
    return m ? Number(m[1]) : 30;
  })();
  const fechaVencimiento =
    typeof body.fecha_vencimiento === "string" && body.fecha_vencimiento.trim()
      ? body.fecha_vencimiento.trim()
      : new Date(new Date(`${hoyStr}T00:00:00Z`).getTime() + diasTermino * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

  const primerServicioId = lineas.find((l) => l.servicioId)?.servicioId ?? null;

  const { data: factura, error: insertError } = await admin
    .from("invoices")
    .insert({
      owner_id: auth.ownerId,
      entity_id: entidad.id,
      client_id: cliente.id,
      servicio_id: primerServicioId,
      numero,
      subtotal,
      ivu_pct: ivuPct,
      ivu_monto: ivuMonto,
      ivu_estatal_monto: ivuEstatalMonto,
      ivu_municipal_monto: ivuMunicipalMonto,
      retencion_pct: retencionPct,
      retencion_monto: retencionMonto,
      total,
      // Siempre "borrador" — igual que crear_factura de VICTOR — nunca
      // "enviada": el dueño la revisa y la manda él mismo.
      estado: "borrador",
      fecha_emision: hoyStr,
      fecha_vencimiento: fechaVencimiento,
    })
    .select("id, numero, total, estado, fecha_emision, fecha_vencimiento")
    .maybeSingle();

  if (insertError || !factura) {
    return NextResponse.json({ error: insertError?.message ?? "No se pudo crear la factura." }, { status: 500 });
  }

  const { error: itemsError } = await admin.from("invoice_items").insert(
    lineas.map((l) => ({
      invoice_id: factura.id,
      service_id: l.servicioId,
      descripcion: l.descripcion,
      detalle: l.detalle,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      subtotal_linea: l.subtotalLinea,
    }))
  );

  if (itemsError) {
    return NextResponse.json(
      { error: `La factura ${numero} se creó pero hubo un error guardando las líneas: ${itemsError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: {
        id: factura.id,
        numero: factura.numero,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total: factura.total,
        estado: factura.estado,
        fecha_emision: factura.fecha_emision,
        fecha_vencimiento: factura.fecha_vencimiento,
      },
    },
    { status: 201 }
  );
}
