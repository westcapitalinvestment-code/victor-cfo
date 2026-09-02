import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { calcularFactura } from "@/lib/factura-calculo";

type ItemEntrada = { descripcion: string; cantidad: number; precioUnitario: number; servicioId?: string | null };

// Detalle de una cotización que el técnico está armando desde cero.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const { data: cotizacion } = await ctx.admin
    .from("cotizaciones")
    .select("id, numero, total, subtotal, ivu_monto, estado, pendiente_revision_tecnico, client_id, clients(name, phone)")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .maybeSingle();
  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });

  const { data: items } = await ctx.admin
    .from("cotizacion_items")
    .select("id, descripcion, cantidad, precio_unitario, subtotal_linea")
    .eq("cotizacion_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, cotizacion, items: items ?? [] });
}

// Añade ítems y/o finaliza (submit) — a diferencia de las facturas, una
// cotización nueva SIEMPRE queda pendiente de que el dueño la apruebe (no
// hay modo "automático" aquí, ver nota en route.ts POST): el estado se
// queda en 'borrador' con pendiente_revision_tecnico = true hasta que el
// dueño le da "Aprobar y enviar" desde el Panel de Equipo, momento en el
// que pasa a 'enviada' y ya se puede mandar al cliente como cualquier otra
// cotización.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nuevosItems: ItemEntrada[] = Array.isArray(body?.items) ? body.items : [];
  const finalizar = !!body?.finalizar;

  const { data: cotizacion } = await ctx.admin
    .from("cotizaciones")
    .select("id, client_id, estado")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .maybeSingle();
  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  if (cotizacion.estado !== "borrador") {
    return NextResponse.json({ error: "Esta cotización ya no se puede editar (ya se envió al dueño o al cliente)." }, { status: 400 });
  }

  if (nuevosItems.length > 0) {
    const items = nuevosItems
      .map((it) => ({
        descripcion: String(it.descripcion ?? "").trim(),
        cantidad: Number(it.cantidad) > 0 ? Number(it.cantidad) : 1,
        precioUnitario: Number(it.precioUnitario) >= 0 ? Number(it.precioUnitario) : 0,
        servicioId: it.servicioId || null,
      }))
      .filter((it) => it.descripcion.length > 0);

    if (items.length > 0) {
      const { error: errorItems } = await ctx.admin.from("cotizacion_items").insert(
        items.map((it) => ({
          cotizacion_id: params.id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unitario: it.precioUnitario,
          subtotal_linea: it.cantidad * it.precioUnitario,
          service_id: it.servicioId,
        }))
      );
      if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 });
    }
  }

  const { data: todosLosItems } = await ctx.admin
    .from("cotizacion_items")
    .select("cantidad, precio_unitario, service_id")
    .eq("cotizacion_id", params.id);

  const { data: cliente } = await ctx.admin.from("clients").select("ivu_exempt_reseller").eq("id", cotizacion.client_id).maybeSingle();

  const servicioIds = (todosLosItems ?? []).map((it) => it.service_id).filter((id): id is string => !!id);
  const { data: servicios } = servicioIds.length
    ? await ctx.admin.from("services").select("id, ivu_exento").in("id", servicioIds)
    : { data: [] as { id: string; ivu_exento: boolean }[] };
  const exentoPorServicio = new Map((servicios ?? []).map((s) => [s.id, s.ivu_exento]));

  const lineasCalculo = (todosLosItems ?? []).map((it) => ({
    cantidad: Number(it.cantidad),
    precioUnitario: Number(it.precio_unitario),
    ivuExento: it.service_id ? exentoPorServicio.get(it.service_id) ?? false : false,
  }));
  const ivuPct = ctx.entidad.ivu_rate_estatal + ctx.entidad.ivu_rate_municipal;
  const ivuAplica = ctx.entidad.ivu_applies && !cliente?.ivu_exempt_reseller;
  const { subtotal, ivuMonto, total } = calcularFactura(lineasCalculo, { ivuApplies: ivuAplica, ivuPct, descuentoPct: 0 });

  const actualizacion: Record<string, unknown> = {
    subtotal,
    ivu_pct: ivuAplica ? ivuPct : 0,
    ivu_monto: ivuMonto,
    total,
  };

  if (finalizar) {
    actualizacion.pendiente_revision_tecnico = true;
    // estado se queda en 'borrador' — no le llega al cliente hasta que el
    // dueño la apruebe desde el Panel de Equipo.
  }

  const { error: errorUpdate } = await ctx.admin.from("cotizaciones").update(actualizacion).eq("id", params.id);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ ok: true, total });
}
