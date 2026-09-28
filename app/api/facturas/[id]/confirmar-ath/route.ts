import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Confirma de verdad un pago por ATH Móvil (Payment Button de Evertec) —
// 28 sept 2026, pedido de Joel: QR que el cliente escanea y puede pagar por
// tarjeta O ATH Móvil. El navegador del cliente (página pública /cobro/[id])
// llama esta ruta después de que el callback authorizationATHM del widget
// oficial dispara — pero NUNCA confiamos ciegamente en lo que mande el
// navegador (podría venir manipulado): esta ruta vuelve a preguntarle a ATH
// directamente ("findPayment", usando solo el Public Token — no hace falta
// el privado para esto) si esa transacción de verdad quedó COMPLETED y por
// el monto correcto, antes de marcar la factura pagada.
//
// Pública a propósito (mismo criterio que /api/facturas/[id]/pagar) — el
// cliente que paga nunca tiene sesión en la app.
export const dynamic = "force-dynamic";

const ATH_FIND_PAYMENT_URL = "https://payments.athmovil.com/api/business-transaction/ecommerce/business/findPayment";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const ecommerceId = typeof body?.ecommerceId === "string" ? body.ecommerceId.trim() : "";
  if (!ecommerceId) {
    return NextResponse.json({ error: "Falta el identificador de la transacción." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: factura, error: errorFactura } = await supabase
    .from("invoices")
    .select("id, owner_id, total, estado, client_id, entity_id, business_entities(ath_movil_public_token)")
    .eq("id", params.id)
    .maybeSingle();

  if (errorFactura || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }
  if (factura.estado === "pagada") {
    return NextResponse.json({ ok: true, yaEstabaPagada: true });
  }

  const publicToken = (factura as any).business_entities?.ath_movil_public_token as string | null;
  if (!publicToken) {
    return NextResponse.json({ error: "Este negocio no tiene ATH Móvil configurado." }, { status: 400 });
  }

  let verificacion: any;
  try {
    const res = await fetch(ATH_FIND_PAYMENT_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ecommerceId, publicToken }),
    });
    verificacion = await res.json();
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el pago con ATH Móvil. Intenta de nuevo en un momento." }, { status: 502 });
  }

  const data = verificacion?.data;
  if (verificacion?.status !== "success" || !data) {
    return NextResponse.json({ error: "ATH Móvil no reconoció esa transacción." }, { status: 400 });
  }
  if (data.ecommerceStatus !== "COMPLETED") {
    return NextResponse.json({ error: `El pago todavía no está completado (estado: ${data.ecommerceStatus}).` }, { status: 400 });
  }

  // Tolerancia de 1 centavo por redondeo — el total que ATH confirma debe
  // coincidir con el total real de la factura, nunca confiar en un monto
  // distinto solo porque el ecommerceId es válido.
  const totalConfirmado = Number(data.total ?? 0);
  const totalFactura = Number(factura.total ?? 0);
  if (Math.abs(totalConfirmado - totalFactura) > 0.01) {
    return NextResponse.json(
      { error: `El monto confirmado por ATH Móvil ($${totalConfirmado.toFixed(2)}) no coincide con el de la factura ($${totalFactura.toFixed(2)}).` },
      { status: 400 }
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ estado: "pagada", metodo_pago: "ATH Móvil Business", fecha_pago: hoy })
    .eq("id", factura.id);

  if (updateError) {
    return NextResponse.json({ error: "El pago se confirmó pero no se pudo actualizar la factura. Contacta a soporte." }, { status: 500 });
  }

  // Mismo efecto secundario de seguimientos que marcar_factura_pagada
  // (lib/victor/tools.ts) y el botón manual "Registrar pago" — nunca
  // bloquea la respuesta si falla.
  try {
    const { data: items } = await supabase.from("invoice_items").select("service_id").eq("invoice_id", factura.id);
    const serviceIds = Array.from(new Set((items ?? []).map((it) => it.service_id).filter((id): id is string => !!id)));
    if (serviceIds.length > 0 && factura.client_id) {
      const { data: servicios } = await supabase
        .from("services")
        .select("id, intervalo_seguimiento_meses")
        .in("id", serviceIds);
      const conSeguimiento = (servicios ?? []).filter(
        (s): s is { id: string; intervalo_seguimiento_meses: number } => !!s.intervalo_seguimiento_meses
      );
      for (const s of conSeguimiento) {
        const fechaProximoD = new Date(`${hoy}T00:00:00Z`);
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
              fecha_servicio: hoy,
              fecha_proximo: fechaProximo,
              factura_origen_id: factura.id,
              estado: "pendiente",
              ultimo_recordatorio_enviado_en: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existente.id);
        } else {
          await supabase.from("seguimientos_clientes").insert({
            owner_id: (factura as any).owner_id,
            entity_id: factura.entity_id,
            client_id: factura.client_id,
            service_id: s.id,
            factura_origen_id: factura.id,
            fecha_servicio: hoy,
            fecha_proximo: fechaProximo,
            estado: "pendiente",
          });
        }
      }
    }
  } catch {
    // Silencioso — el pago ya quedó registrado, que es lo que importa.
  }

  return NextResponse.json({ ok: true });
}
