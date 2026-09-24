import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";
import { sendFollowUpReminderEmail } from "@/lib/email";
import { enviarPush } from "@/lib/push";

// "Seguimientos de clientes" (24 sept 2026, pedido de Joel — ver el
// comentario grande en app/dashboard/facturacion/[id]/factura-detalle.tsx y
// en la migración 0095). Cron diario que revisa seguimientos_clientes con
// fecha_proximo <= hoy y estado "pendiente":
//   1. Si el cliente tiene email, le manda un correo amistoso (NO una
//      factura/cotización — Joel fue explícito en que esto no puede sentirse
//      como cobro frío).
//   2. Le manda un push al DUEÑO del negocio resumiendo cuántos seguimientos
//      tiene pendientes hoy, para que también pueda escribirle por WhatsApp
//      a mano (no existe integración real de WhatsApp Business API — mismo
//      límite documentado en facturas-recurrentes/route.ts).
//
// Solo reenvía cada 14 días mientras el seguimiento siga "pendiente" (ver
// ultimo_recordatorio_enviado_en) — así no le manda el mismo correo/push
// todos los días a un cliente que simplemente no ha contestado.
//
// Misma protección que los otros crons: header Authorization con
// CRON_SECRET, cliente admin porque itera TODOS los usuarios sin sesión.
export const maxDuration = 300;

const DIAS_ENTRE_REENVIOS = 14;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hoyISO = fechaHoyPR();

  const { data: seguimientos, error: seguimientosError } = await supabase
    .from("seguimientos_clientes")
    .select(
      "id, owner_id, entity_id, fecha_servicio, fecha_proximo, ultimo_recordatorio_enviado_en, clients(name, email, telefono), services(nombre), business_entities(name, email)"
    )
    .eq("estado", "pendiente")
    .lte("fecha_proximo", hoyISO);

  if (seguimientosError) return NextResponse.json({ error: seguimientosError.message }, { status: 500 });
  if (!seguimientos || seguimientos.length === 0) return NextResponse.json({ ok: true, procesados: 0 });

  const msPorDia = 24 * 60 * 60 * 1000;
  function pasaronDias(fechaISOConHora: string | null, dias: number): boolean {
    if (!fechaISOConHora) return true;
    return Date.now() - new Date(fechaISOConHora).getTime() >= dias * msPorDia;
  }

  let correosEnviados = 0;
  let seguimientosProcesados = 0;
  const porOwner = new Map<string, number>();
  const resultados: Record<string, unknown> = {};

  for (const s of seguimientos) {
    if (!pasaronDias(s.ultimo_recordatorio_enviado_en as string | null, DIAS_ENTRE_REENVIOS)) {
      resultados[s.id] = { procesado: false, razon: "recordatorio reciente, se salta" };
      continue;
    }

    try {
      const clienteJoin = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      const servicioJoin = Array.isArray(s.services) ? s.services[0] : s.services;
      const entidadJoin = Array.isArray(s.business_entities) ? s.business_entities[0] : s.business_entities;
      const servicioNombre = servicioJoin?.nombre ?? "servicio";

      let correoEnviado = false;
      if (clienteJoin?.email) {
        const resultadoEmail = await sendFollowUpReminderEmail({
          clientEmail: clienteJoin.email,
          clientName: clienteJoin.name ?? null,
          entityName: entidadJoin?.name ?? null,
          servicioNombre,
          fechaUltimoServicio: (s.fecha_servicio as string) ?? null,
          replyToEmail: entidadJoin?.email ?? null,
        });
        correoEnviado = resultadoEmail.sent;
        if (correoEnviado) correosEnviados++;
      }

      await supabase
        .from("seguimientos_clientes")
        .update({ ultimo_recordatorio_enviado_en: new Date().toISOString() })
        .eq("id", s.id);

      porOwner.set(s.owner_id, (porOwner.get(s.owner_id) ?? 0) + 1);
      seguimientosProcesados++;
      resultados[s.id] = { procesado: true, correoEnviado, cliente: clienteJoin?.name ?? null, servicio: servicioNombre };
    } catch (err) {
      resultados[s.id] = { procesado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  // Push al dueño — uno por owner, resumiendo el total (no uno por cada
  // seguimiento, para no saturarlo de notificaciones un día con varios
  // clientes vencidos a la vez).
  let duenosNotificados = 0;
  for (const [ownerId, cantidad] of porOwner.entries()) {
    try {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("owner_id", ownerId);
      if (!subs || subs.length === 0) continue;

      const body =
        cantidad === 1
          ? "Tienes 1 cliente al que le toca darle seguimiento."
          : `Tienes ${cantidad} clientes a los que les toca darles seguimiento.`;

      for (const sub of subs) {
        const resultado = await enviarPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: "VICTOR CFO", body, url: "/dashboard/facturacion?tab=seguimientos" }
        );
        if (resultado.expirada) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
      duenosNotificados++;
    } catch {
      // Best-effort — un push fallido no debe tumbar el resto del cron.
    }
  }

  console.log(
    "[seguimientos-clientes]",
    JSON.stringify({ seguimientosProcesados, correosEnviados, duenosNotificados, resultados })
  );

  return NextResponse.json({ ok: true, procesados: seguimientosProcesados, correosEnviados, duenosNotificados });
}
