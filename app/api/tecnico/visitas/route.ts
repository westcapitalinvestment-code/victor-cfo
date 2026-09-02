import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionTecnico, COOKIE_SESION_TECNICO } from "@/lib/tecnico-session";

type ItemEntrada = { descripcion: string; cantidad: number; precioUnitario: number; catalogItemId?: string | null };

// Crea una visita + sus ítems. El total lo recalcula el servidor a partir de
// los ítems (nunca confía en el total que mande el cliente/técnico) — mismo
// principio que las rutas de CSV/PDF de Facturación y Pagos.
export async function POST(req: NextRequest) {
  const technicianId = verificarSesionTecnico(req.cookies.get(COOKIE_SESION_TECNICO)?.value);
  if (!technicianId) return NextResponse.json({ error: "Sesión de técnico expirada — vuelve a entrar con tu PIN." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientNombre = typeof body?.clientNombre === "string" ? body.clientNombre.trim() : "";
  const metodoCobro = typeof body?.metodoCobro === "string" ? body.metodoCobro : null;
  const cobrado = !!body?.cobrado;
  const itemsCrudos: ItemEntrada[] = Array.isArray(body?.items) ? body.items : [];

  const items = itemsCrudos
    .map((it) => ({
      descripcion: String(it.descripcion ?? "").trim(),
      cantidad: Number(it.cantidad) > 0 ? Number(it.cantidad) : 1,
      precioUnitario: Number(it.precioUnitario) >= 0 ? Number(it.precioUnitario) : 0,
      catalogItemId: it.catalogItemId || null,
    }))
    .filter((it) => it.descripcion.length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: "Añade al menos un ítem a la visita." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tecnico } = await admin
    .from("technicians")
    .select("id, entity_id, active, approval_mode")
    .eq("id", technicianId)
    .maybeSingle();

  if (!tecnico || !tecnico.active) {
    return NextResponse.json({ error: "Técnico inactivo — contacta al dueño del negocio." }, { status: 403 });
  }

  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
  const requiereAprobacion = tecnico.approval_mode === "manual";
  const estado = requiereAprobacion ? "requiere_aprobacion" : cobrado ? "cobrado" : "pendiente_cobro";

  const { data: visita, error: errorVisita } = await admin
    .from("technician_visits")
    .insert({
      technician_id: tecnico.id,
      entity_id: tecnico.entity_id,
      client_name_raw: clientNombre || null,
      estado,
      total,
      metodo_cobro: metodoCobro,
      monto_cobrado: !requiereAprobacion && cobrado ? total : null,
      cobrado_at: !requiereAprobacion && cobrado ? new Date().toISOString() : null,
      requiere_aprobacion: requiereAprobacion,
    })
    .select("id, estado")
    .single();

  if (errorVisita || !visita) {
    return NextResponse.json({ error: errorVisita?.message ?? "No se pudo guardar la visita." }, { status: 500 });
  }

  const { error: errorItems } = await admin.from("technician_visit_items").insert(
    items.map((it) => ({
      visit_id: visita.id,
      catalog_item_id: it.catalogItemId,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unitario: it.precioUnitario,
    }))
  );

  if (errorItems) {
    return NextResponse.json({ error: errorItems.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, visitaId: visita.id, estado: visita.estado, total });
}
