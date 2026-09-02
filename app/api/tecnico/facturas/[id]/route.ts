import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { calcularFactura } from "@/lib/factura-calculo";

type ItemEntrada = { descripcion: string; cantidad: number; precioUnitario: number; servicioId?: string | null };

// Detalle de una factura asignada/creada por el técnico — para abrir una
// tarea que el dueño le asignó, o retomar una que dejó a medias.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const { data: factura } = await ctx.admin
    .from("invoices")
    .select("id, numero, total, subtotal, ivu_monto, descuento_pct, descuento_monto, estado, pendiente_revision_tecnico, client_id, clients(name, phone)")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .maybeSingle();
  if (!factura) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const { data: items } = await ctx.admin
    .from("invoice_items")
    .select("id, descripcion, cantidad, precio_unitario, subtotal_linea")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, factura, items: items ?? [] });
}

// Añade más ítems (pedido de Joel: "si adicional a la factura hay que
// añadir algo... o venderle otro servicio"), aplica descuento, y/o
// finaliza (submit) — que es lo que decide si la factura sale directo
// (auto) o queda pendiente de que el dueño la apruebe (manual).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nuevosItems: ItemEntrada[] = Array.isArray(body?.items) ? body.items : [];
  const descuentoPctPedido = Number(body?.descuentoPct) || 0;
  const finalizar = !!body?.finalizar;

  const { data: factura } = await ctx.admin
    .from("invoices")
    .select("id, client_id, estado")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .maybeSingle();
  if (!factura) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (factura.estado !== "borrador") {
    return NextResponse.json({ error: "Esta factura ya no se puede editar (ya salió o fue cobrada)." }, { status: 400 });
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
      const { error: errorItems } = await ctx.admin.from("invoice_items").insert(
        items.map((it) => ({
          invoice_id: params.id,
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

  // Descuento: solo si el permiso está activo, y nunca por encima del tope
  // configurado para este técnico.
  let descuentoPct = 0;
  if (ctx.permisos.aplicaDescuento && descuentoPctPedido > 0) {
    descuentoPct = Math.min(descuentoPctPedido, ctx.permisos.descuentoMaxPct);
  }

  // Recalcular totales desde cero con TODOS los ítems actuales de la
  // factura (los que ya tenía + los que se acaban de añadir), igual que
  // hace Editar Factura en el dashboard.
  const { data: todosLosItems } = await ctx.admin
    .from("invoice_items")
    .select("cantidad, precio_unitario, service_id")
    .eq("invoice_id", params.id);

  const { data: cliente } = await ctx.admin.from("clients").select("ivu_exempt_reseller").eq("id", factura.client_id).maybeSingle();

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
  const { subtotal, ivuMonto, descuentoMonto, total } = calcularFactura(lineasCalculo, {
    ivuApplies: ivuAplica,
    ivuPct,
    descuentoPct,
  });

  const actualizacion: Record<string, unknown> = {
    subtotal,
    ivu_pct: ivuAplica ? ivuPct : 0,
    ivu_monto: ivuMonto,
    descuento_pct: descuentoPct,
    descuento_monto: descuentoMonto,
    total,
  };

  if (finalizar) {
    if (ctx.approvalMode === "manual") {
      actualizacion.pendiente_revision_tecnico = true;
      // estado se queda en 'borrador' — no se manda al cliente hasta que
      // el dueño la apruebe desde el Panel de Equipo.
    } else {
      actualizacion.estado = "enviada";
      actualizacion.pendiente_revision_tecnico = false;
    }
  }

  const { error: errorUpdate } = await ctx.admin.from("invoices").update(actualizacion).eq("id", params.id);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ ok: true, total, estado: finalizar ? (actualizacion.estado ?? "borrador") : "borrador" });
}
