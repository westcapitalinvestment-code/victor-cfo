import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { calcularFactura } from "@/lib/factura-calculo";

type ItemEntrada = { descripcion: string; cantidad: number; precioUnitario: number; servicioId?: string | null };

// Crea una factura REAL desde cero (el técnico llegó a un trabajo que no
// estaba asignado de antemano). Queda en estado 'borrador' — la ruta PATCH
// /api/tecnico/facturas/[id] es la que la manda (auto) o la deja pendiente
// de revisión (manual). No se manda directo aquí porque el técnico puede
// seguir añadiendo ítems antes de terminar (pedido de Joel).
export async function POST(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada — vuelve a entrar con tu PIN." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const itemsCrudos: ItemEntrada[] = Array.isArray(body?.items) ? body.items : [];

  if (!clientId) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });

  // Sin ítems todavía está bien — el técnico puede crear la factura con
  // solo el cliente escogido y añadir ítems después vía PATCH (mismo
  // patrón "asignada por el dueño" que "creada desde cero en campo").
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

  const { count } = await ctx.admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", ctx.tecnico.entity_id);
  const numero = `${ctx.entidad.invoice_prefix}-${ctx.entidad.invoice_start_number + (count ?? 0)}`;

  const { data: factura, error: errorFactura } = await ctx.admin
    .from("invoices")
    .insert({
      owner_id: ctx.tecnico.owner_id,
      entity_id: ctx.tecnico.entity_id,
      client_id: clientId,
      technician_id: ctx.tecnico.id,
      numero,
      subtotal,
      ivu_pct: ivuAplica ? ivuPct : 0,
      ivu_monto: ivuMonto,
      retencion_pct: 0,
      retencion_monto: 0,
      total,
      estado: "borrador",
      fecha_emision: new Date().toISOString().slice(0, 10),
    })
    .select("id, numero")
    .single();

  if (errorFactura || !factura) {
    return NextResponse.json({ error: errorFactura?.message ?? "No se pudo crear la factura." }, { status: 500 });
  }

  if (items.length > 0) {
    const { error: errorItems } = await ctx.admin.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: factura.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        subtotal_linea: it.cantidad * it.precioUnitario,
        service_id: it.servicioId,
      }))
    );
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: factura.id, numero: factura.numero, total });
}
