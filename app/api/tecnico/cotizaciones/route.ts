import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { calcularFactura } from "@/lib/factura-calculo";

type ItemEntrada = { descripcion: string; cantidad: number; precioUnitario: number; servicioId?: string | null };

// Crea una COTIZACIÓN nueva desde cero (el técnico está frente a un cliente
// que pide algo distinto a lo que ya tenía asignado) — pedido de Joel (2
// sept 2026): "si un cliente quiere algo nuevo el empleado pudiera
// cotizarlo y guardarlo para que el jefe lo apruebe y se lo envía como
// trabajo". A diferencia de /api/tecnico/facturas, esto SIEMPRE queda
// pendiente de revisión del dueño al finalizar (ver PATCH [id]) — no hay
// modo "automático" para cotizaciones nuevas, porque le está poniendo
// precio a algo que el dueño no vio venir, y aquí sí importa que lo
// revise antes de que le llegue al cliente real.
export async function POST(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada — vuelve a entrar con tu PIN." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const itemsCrudos: ItemEntrada[] = Array.isArray(body?.items) ? body.items : [];

  if (!clientId) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });

  const items = itemsCrudos
    .map((it) => ({
      descripcion: String(it.descripcion ?? "").trim(),
      cantidad: Number(it.cantidad) > 0 ? Number(it.cantidad) : 1,
      precioUnitario: Number(it.precioUnitario) >= 0 ? Number(it.precioUnitario) : 0,
      servicioId: it.servicioId || null,
    }))
    .filter((it) => it.descripcion.length > 0);

  const { data: cliente } = await ctx.admin
    .from("clients")
    .select("id, ivu_exempt_reseller")
    .eq("id", clientId)
    .eq("entity_id", ctx.tecnico.entity_id)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const servicioIds = items.map((it) => it.servicioId).filter((id): id is string => !!id);
  const { data: servicios } = servicioIds.length
    ? await ctx.admin.from("services").select("id, ivu_exento").in("id", servicioIds)
    : { data: [] as { id: string; ivu_exento: boolean }[] };
  const exentoPorServicio = new Map((servicios ?? []).map((s) => [s.id, s.ivu_exento]));

  const lineasCalculo = items.map((it) => ({
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    ivuExento: it.servicioId ? exentoPorServicio.get(it.servicioId) ?? false : false,
  }));
  const ivuPct = ctx.entidad.ivu_rate_estatal + ctx.entidad.ivu_rate_municipal;
  const ivuAplica = ctx.entidad.ivu_applies && !cliente.ivu_exempt_reseller;
  const { subtotal, ivuMonto, total } = calcularFactura(lineasCalculo, { ivuApplies: ivuAplica, ivuPct, descuentoPct: 0 });

  // Mismo esquema simple de numeración que usa el dueño en Nueva Cotización
  // (COT- + cantidad total + 1, escaneado por owner_id).
  const { count } = await ctx.admin
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ctx.tecnico.owner_id);
  const numero = `COT-${1000 + (count ?? 0) + 1}`;

  const hoy = new Date().toISOString().slice(0, 10);
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + 30);

  const { data: cotizacion, error: errorCotizacion } = await ctx.admin
    .from("cotizaciones")
    .insert({
      owner_id: ctx.tecnico.owner_id,
      entity_id: ctx.tecnico.entity_id,
      client_id: clientId,
      technician_id: ctx.tecnico.id,
      numero,
      subtotal,
      ivu_pct: ivuAplica ? ivuPct : 0,
      ivu_monto: ivuMonto,
      total,
      estado: "borrador",
      fecha_emision: hoy,
      fecha_vencimiento: vencimiento.toISOString().slice(0, 10),
    })
    .select("id, numero")
    .single();

  if (errorCotizacion || !cotizacion) {
    return NextResponse.json({ error: errorCotizacion?.message ?? "No se pudo crear la cotización." }, { status: 500 });
  }

  if (items.length > 0) {
    const { error: errorItems } = await ctx.admin.from("cotizacion_items").insert(
      items.map((it) => ({
        cotizacion_id: cotizacion.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        subtotal_linea: it.cantidad * it.precioUnitario,
        service_id: it.servicioId,
      }))
    );
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: cotizacion.id, numero: cotizacion.numero, total });
}
