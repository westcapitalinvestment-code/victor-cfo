import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";
import { sendRecordatorioCobroEmail } from "@/lib/email";
import { enviarPush } from "@/lib/push";

// Recordatorios automáticos de cobro (15 oct 2026, auditoría de facturación
// vs FreshBooks/QuickBooks). Cron diario: para entidades que lo activaron
// (business_entities.recordatorios_cobro_activos, migración 0157, apagado por
// defecto) manda un correo amable al cliente cuando una factura enviada está
// vencida, con el link de pago. Calendario fijo, máximo 3 por factura:
//   1.º → 1 día después del vencimiento
//   2.º → 7 días después
//   3.º → 14 días después
// Nunca a borradores, pagadas ni anuladas, ni a clientes sin correo. Al dueño
// le llega un push resumen (uno por dueño) para que también pueda escribir
// por WhatsApp. Mismo esquema de seguridad que los otros crons.
export const maxDuration = 300;

const CALENDARIO_DIAS = [1, 7, 14];
const MS_DIA = 24 * 60 * 60 * 1000;

function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round(
    (new Date(`${hastaISO}T00:00:00Z`).getTime() - new Date(`${desdeISO}T00:00:00Z`).getTime()) / MS_DIA
  );
}

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hoyISO = fechaHoyPR();

  const { data: facturas, error } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, numero, total, estado, fecha_vencimiento, ultimo_recordatorio_cobro_en, recordatorios_cobro_enviados, clients(name, email, portal_token), business_entities!inner(name, email, stripe_connect_charges_enabled, recordatorios_cobro_activos)"
    )
    .in("estado", ["enviada", "vista", "vencida"])
    .lt("fecha_vencimiento", hoyISO)
    .gt("total", 0)
    .lt("recordatorios_cobro_enviados", CALENDARIO_DIAS.length)
    .eq("business_entities.recordatorios_cobro_activos", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!facturas || facturas.length === 0) return NextResponse.json({ ok: true, enviados: 0 });

  let enviados = 0;
  const porOwner = new Map<string, number>();
  const resultados: Record<string, unknown> = {};

  for (const f of facturas) {
    try {
      const enviadosAntes = Number(f.recordatorios_cobro_enviados ?? 0);
      const diasVencida = diasEntre(f.fecha_vencimiento as string, hoyISO);
      // Aún no le toca el siguiente recordatorio del calendario.
      if (diasVencida < CALENDARIO_DIAS[enviadosAntes]) {
        resultados[f.id] = { enviado: false, razon: "todavía no toca" };
        continue;
      }
      // Seguro extra contra doble envío si el cron corre dos veces el mismo día.
      if (f.ultimo_recordatorio_cobro_en && Date.now() - new Date(f.ultimo_recordatorio_cobro_en as string).getTime() < 20 * 60 * 60 * 1000) {
        resultados[f.id] = { enviado: false, razon: "ya se envió hoy" };
        continue;
      }

      const cliente = Array.isArray(f.clients) ? f.clients[0] : f.clients;
      const entidad = Array.isArray(f.business_entities) ? f.business_entities[0] : f.business_entities;
      if (!cliente?.email) {
        resultados[f.id] = { enviado: false, razon: "cliente sin correo" };
        continue;
      }

      const r = await sendRecordatorioCobroEmail({
        clientEmail: cliente.email,
        clientName: cliente.name ?? null,
        entityName: entidad?.name ?? null,
        invoiceId: f.id as string,
        invoiceNumber: f.numero as string,
        total: Number(f.total),
        dueDate: f.fecha_vencimiento as string,
        diasVencida,
        numeroRecordatorio: enviadosAntes + 1,
        cobroTarjetaDisponible: !!entidad?.stripe_connect_charges_enabled,
        replyToEmail: entidad?.email ?? null,
        portalUrl: cliente.portal_token ? `https://www.victorcfo.com/portal-cliente/${cliente.portal_token}` : null,
      });

      if (!r.sent) {
        resultados[f.id] = { enviado: false, razon: r.reason };
        continue;
      }

      await supabase
        .from("invoices")
        .update({
          ultimo_recordatorio_cobro_en: new Date().toISOString(),
          recordatorios_cobro_enviados: enviadosAntes + 1,
        })
        .eq("id", f.id);

      enviados++;
      porOwner.set(f.owner_id as string, (porOwner.get(f.owner_id as string) ?? 0) + 1);
      resultados[f.id] = { enviado: true, numero: enviadosAntes + 1 };
    } catch (err) {
      resultados[f.id] = { enviado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

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
          ? "VICTOR le mandó un recordatorio de cobro a 1 cliente con factura vencida."
          : `VICTOR les mandó recordatorios de cobro a ${cantidad} clientes con facturas vencidas.`;
      for (const sub of subs) {
        const resultado = await enviarPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: "VICTOR CFO", body, url: "/dashboard/facturacion" }
        );
        if (resultado.expirada) await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      duenosNotificados++;
    } catch {
      // Best-effort — un push fallido no debe tumbar el cron.
    }
  }

  console.log("[recordatorios-cobro]", JSON.stringify({ enviados, duenosNotificados, resultados }));
  return NextResponse.json({ ok: true, enviados, duenosNotificados });
}
