import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";

// Marca una factura como pagada — sirve tanto para una que el técnico
// acaba de crear/completar en el momento, como para una factura vieja ya
// vencida del cliente que el técnico cobra en campo (pedido de Joel: "ve y
// cobra facturas vencidas en campo"). En el segundo caso esa factura no
// tiene que ser suya (technician_id puede ser null o de otro técnico) —
// por eso aquí solo se exige que sea de la MISMA entidad, no que sea del
// técnico que está cobrando.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const metodoCobro = typeof body?.metodoCobro === "string" ? body.metodoCobro : null;
  if (!metodoCobro) return NextResponse.json({ error: "Falta el método de cobro." }, { status: 400 });

  const { data: factura } = await ctx.admin
    .from("invoices")
    .select("id, technician_id, estado")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .maybeSingle();
  if (!factura) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  // Si la factura es de OTRO técnico o del dueño (no fue creada por quien
  // está cobrando ahora), solo se permite si el permiso de cobrar vencidas
  // está activo — cobrar la propia factura recién hecha siempre se permite.
  if (factura.technician_id !== ctx.tecnico.id && !ctx.permisos.cobraVencidas) {
    return NextResponse.json({ error: "No tienes permiso para cobrar facturas de otros." }, { status: 403 });
  }
  if (factura.estado === "pagada") {
    return NextResponse.json({ error: "Esta factura ya estaba marcada como pagada." }, { status: 400 });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await ctx.admin
    .from("invoices")
    .update({ estado: "pagada", metodo_pago: metodoCobro, fecha_pago: hoy })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
