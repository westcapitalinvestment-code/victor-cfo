import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";

// Acciones del técnico sobre un seguimiento que el dueño le asignó (24 sept
// 2026, pedido de Joel: "asignarlo a tecnico como tarea pendiente"). Mismo
// espíritu que los botones del dueño en el portal de Facturación
// (marcarContactado/descartar/guardarNota en facturacion-portal.tsx), pero
// verificando SIEMPRE technician_id = este técnico — un técnico nunca debe
// poder tocar el seguimiento de otro técnico ni uno que el dueño no le
// asignó, aunque conozca el id.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada — vuelve a entrar con tu PIN." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const accion = typeof body?.accion === "string" ? body.accion : "";
  if (!["contactado", "descartar", "nota"].includes(accion)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const { data: seguimiento } = await ctx.admin
    .from("seguimientos_clientes")
    .select("id, technician_id, entity_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!seguimiento || seguimiento.technician_id !== ctx.tecnico.id || seguimiento.entity_id !== ctx.tecnico.entity_id) {
    return NextResponse.json({ error: "Seguimiento no encontrado." }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (accion === "contactado") {
    update.estado = "contactado";
  } else if (accion === "descartar") {
    update.estado = "descartado";
  } else if (accion === "nota") {
    // "Pendiente (nota)" — igual que del lado del dueño, NO cambia el
    // estado, solo deja constancia (ej. "de viaje, llamar la próxima
    // semana") para que el seguimiento se quede activo y visible.
    const notas = typeof body?.notas === "string" ? body.notas.trim() : "";
    update.notas = notas || null;
    // Reprogramar fecha opcional (24 sept 2026, pedido de Joel: "habria que
    // abrir un calendario para asignar una fecha nueva") — si el técnico
    // escoge una fecha, mueve fecha_proximo para que el cron (que solo mira
    // fecha_proximo <= hoy) deje de insistir hasta ese día. Validación
    // simple YYYY-MM-DD para no aceptar basura.
    const fechaProximo = typeof body?.fechaProximo === "string" ? body.fechaProximo.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaProximo)) {
      update.fecha_proximo = fechaProximo;
    }
  }

  const { error } = await ctx.admin.from("seguimientos_clientes").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
