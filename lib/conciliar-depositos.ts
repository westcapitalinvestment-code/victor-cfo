import type { SupabaseClient } from "@supabase/supabase-js";

// Conciliación automática de depósitos bancarios con facturas pendientes
// (migración 0131, 2 oct 2026) — pedido explícito de Joel: "si hago una
// factura de $1,500 con el 6% de retención y al banco llega $1,410 se
// supone que Victor cierre esa factura con pago y con el método". Esto es
// la extensión al banco de lo que ya hace el webhook de Stripe Connect
// (marcar pagada sola en cuanto detecta el monto correcto) — aquí no hay
// metadata con el invoice_id pegado como en Stripe, así que el match es
// por monto exacto + entidad + factura todavía sin pagar.
//
// A propósito NO intenta ser "inteligente" con matches parciales o
// aproximados — si hay CUALQUIER ambigüedad (dos facturas con el mismo
// balance pendiente, o ningún match exacto) no toca nada y deja que el
// dueño lo cierre a mano como siempre (Registrar pago). Mejor no cerrar
// nada que cerrar la factura equivocada.

export type DepositoBancario = {
  transactionId: string;
  ownerId: string;
  entityId: string;
  // monto ya en positivo (lo que de verdad entró al banco)
  montoRecibido: number;
  fecha: string; // YYYY-MM-DD
  descripcionRaw: string;
};

export type ResultadoConciliacion =
  | { cerrada: true; facturaId: string; facturaNumero: string; metodoPago: string }
  | { cerrada: false; razon: "sin_match" | "match_ambiguo" | "error"; detalle?: string };

// Infere el método de pago a partir de la descripción cruda que manda el
// banco vía Plaid — nunca 100% preciso (cada banco describe distinto),
// pero mejor que dejarlo en blanco. "Transferencia / ACH" es el default
// razonable para un depósito que no matchea ningún patrón de cheque o
// efectivo — la gran mayoría de depósitos de negocio en PR son ACH/Zelle
// business/transferencia interbancaria.
function inferirMetodoPago(descripcionRaw: string): string {
  const d = descripcionRaw.toUpperCase();
  if (/\b(CHECK|CHEQUE|REMOTE DEPOSIT)\b/.test(d)) return "Cheque";
  if (/\b(CASH DEPOSIT|DEPOSITO EN EFECTIVO|CASH)\b/.test(d)) return "Efectivo";
  if (/\bATH\s?MOVIL\b/.test(d)) return "ATH Móvil";
  return "Transferencia / ACH";
}

export async function conciliarDepositoConFactura(
  supabase: SupabaseClient,
  deposito: DepositoBancario
): Promise<ResultadoConciliacion> {
  if (deposito.montoRecibido <= 0) return { cerrada: false, razon: "sin_match" };

  // Candidatas: facturas enviadas (ya facturadas, esperando cobro) de esta
  // entidad, todavía sin pagar y sin una transacción ya enlazada. No se
  // consideran "borrador" (nunca se mandaron) ni ya "pagada".
  const { data: candidatas, error: buscarError } = await supabase
    .from("invoices")
    .select("id, numero, total, deposito_monto, client_id")
    .eq("owner_id", deposito.ownerId)
    .eq("entity_id", deposito.entityId)
    .eq("estado", "enviada")
    .is("transaction_id", null);

  if (buscarError) return { cerrada: false, razon: "error", detalle: buscarError.message };
  if (!candidatas || candidatas.length === 0) return { cerrada: false, razon: "sin_match" };

  // Match por monto exacto (tolerancia de 1 centavo por redondeo de
  // punto flotante) contra el balance pendiente real de cada factura
  // (total menos cualquier depósito/adelanto ya recibido antes).
  const matches = candidatas.filter((f) => {
    const balancePendiente = Number(f.total) - Number(f.deposito_monto ?? 0);
    return Math.abs(balancePendiente - deposito.montoRecibido) < 0.01;
  });

  if (matches.length === 0) return { cerrada: false, razon: "sin_match" };
  if (matches.length > 1) {
    // Ambiguo a propósito: ej. dos clientes distintos te pagaron $500 la
    // misma semana. No adivina — mejor que Joel lo cierre a mano viendo
    // cuál es cuál.
    return { cerrada: false, razon: "match_ambiguo", detalle: matches.map((m) => m.numero).join(", ") };
  }

  const factura = matches[0];
  const metodoPago = inferirMetodoPago(deposito.descripcionRaw);

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      estado: "pagada",
      metodo_pago: metodoPago,
      fecha_pago: deposito.fecha,
      transaction_id: deposito.transactionId,
      pago_auto_conciliado: true,
    })
    .eq("id", factura.id)
    // Defensa extra contra condición de carrera: solo cierra si TODAVÍA
    // sigue "enviada" en este instante (por si dos syncs corrieran a la
    // vez, o el dueño la cerró a mano un segundo antes).
    .eq("estado", "enviada");

  if (updateError) return { cerrada: false, razon: "error", detalle: updateError.message };

  // Mismo efecto secundario que marcar_factura_pagada (lib/victor/tools.ts)
  // y el botón manual "Registrar pago": si alguna línea usa un servicio
  // del catálogo con seguimiento configurado, crea/actualiza ese
  // seguimiento. Nunca bloquea — la factura ya quedó cerrada, que es lo
  // que importa.
  try {
    const { data: items } = await supabase.from("invoice_items").select("service_id").eq("invoice_id", factura.id);
    const serviceIds = Array.from(new Set((items ?? []).map((it) => it.service_id).filter((id): id is string => !!id)));
    if (serviceIds.length > 0) {
      const { data: servicios } = await supabase
        .from("services")
        .select("id, intervalo_seguimiento_meses")
        .in("id", serviceIds);
      const conSeguimiento = (servicios ?? []).filter(
        (s): s is { id: string; intervalo_seguimiento_meses: number } => !!s.intervalo_seguimiento_meses
      );
      for (const s of conSeguimiento) {
        const fechaProximoD = new Date(`${deposito.fecha}T00:00:00Z`);
        fechaProximoD.setUTCMonth(fechaProximoD.getUTCMonth() + s.intervalo_seguimiento_meses);
        const fechaProximo = fechaProximoD.toISOString().slice(0, 10);

        const { data: existente } = await supabase
          .from("seguimientos_clientes")
          .select("id")
          .eq("client_id", factura.client_id)
          .eq("service_id", s.id)
          .in("estado", ["pendiente", "contactado", "agendado"])
          .maybeSingle();

        if (existente) {
          await supabase
            .from("seguimientos_clientes")
            .update({
              fecha_servicio: deposito.fecha,
              fecha_proximo: fechaProximo,
              factura_origen_id: factura.id,
              estado: "pendiente",
              ultimo_recordatorio_enviado_en: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existente.id);
        } else {
          await supabase.from("seguimientos_clientes").insert({
            owner_id: deposito.ownerId,
            entity_id: deposito.entityId,
            client_id: factura.client_id,
            service_id: s.id,
            factura_origen_id: factura.id,
            fecha_servicio: deposito.fecha,
            fecha_proximo: fechaProximo,
            estado: "pendiente",
          });
        }
      }
    }
  } catch {
    // Silencioso a propósito — ver comentario arriba.
  }

  return { cerrada: true, facturaId: factura.id, facturaNumero: factura.numero, metodoPago };
}
