import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { hashPin } from "@/lib/pin";
import { sendSocioAprobadoEmail } from "@/lib/email";

// Página pública protegida por token (migración 0071, 5 sept 2026) donde un
// socio APROBADO completa sus documentos — sin sesión, mismo espíritu que
// cpa_invitations/admin_invitations pero sin cuenta de por medio (un socio
// externo no necesariamente es cliente). El payment_token se genera al crear
// la solicitud (DEFAULT gen_random_uuid()) y solo funciona cuando el socio
// está aprobado.
//
// 13 oct 2026 (pedido de Joel): ahora son DOS pasos —
//   paso "contrato": acepta el Contrato de Servicios Independientes (solo
//     vendedores) + datos de contratista (nombre legal, SSN/EIN cifrado,
//     dirección). Guarda fecha, nombre tecleado e IP como constancia.
//   paso "pago": datos bancarios para el ACH (cifrados).
// Cuando ambos están listos se marca documentos_completados_at y, para
// vendedores, se genera el PIN del portal y se manda el correo con
// código + QR + PIN (antes se mandaba al aprobar).
function generarPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("nombre, tipo, estado, datos_pago_completados_at, contrato_aceptado_at, documentos_completados_at")
    .eq("payment_token", params.token)
    .maybeSingle();

  if (!socio || socio.estado !== "aprobado") {
    return NextResponse.json({ valido: false });
  }

  return NextResponse.json({
    valido: true,
    nombre: socio.nombre,
    requiereContrato: socio.tipo === "vendedor",
    contratoAceptado: !!socio.contrato_aceptado_at,
    datosPagoCompletados: !!socio.datos_pago_completados_at,
    yaCompletado: !!socio.documentos_completados_at,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null);
  const paso = body?.paso === "contrato" ? "contrato" : "pago";

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select(
      "id, nombre, email, tipo, estado, codigo, payment_token, datos_pago_completados_at, contrato_aceptado_at, documentos_completados_at"
    )
    .eq("payment_token", params.token)
    .maybeSingle();

  if (!socio || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "Link no válido." }, { status: 404 });
  }

  const esVendedor = socio.tipo === "vendedor";
  let contratoListo = !esVendedor || !!socio.contrato_aceptado_at;
  let pagoListo = !!socio.datos_pago_completados_at;

  if (paso === "contrato") {
    if (!esVendedor) {
      return NextResponse.json({ error: "Este paso no aplica." }, { status: 400 });
    }
    const nombreFirma = typeof body?.nombreFirma === "string" ? body.nombreFirma.trim() : "";
    const taxId = typeof body?.taxId === "string" ? body.taxId.replace(/\D/g, "") : "";
    const direccion = typeof body?.direccion === "string" ? body.direccion.trim() : "";
    if (body?.acepta !== true || nombreFirma.length < 5 || !/^\d{9}$/.test(taxId) || direccion.length < 8) {
      return NextResponse.json({ error: "Completa todos los campos y acepta el contrato." }, { status: 400 });
    }
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

    // SSN/EIN cifrado con lib/crypto.ts (AES-256-GCM, igual que los datos
    // bancarios). Solo se guardan los últimos 4 sin cifrar para identificarlo
    // de un vistazo — se necesita completo para el Modelo 480.6SP.
    const { error } = await admin
      .from("socios")
      .update({
        direccion,
        tax_id_encrypted: encryptSecret(taxId),
        tax_id_last4: taxId.slice(-4),
        contrato_aceptado_at: new Date().toISOString(),
        contrato_firma_nombre: nombreFirma,
        contrato_aceptado_ip: ip,
      })
      .eq("id", socio.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
    contratoListo = true;
  } else {
    const bankName = typeof body?.bankName === "string" ? body.bankName.trim() : "";
    const routingNumber = typeof body?.routingNumber === "string" ? body.routingNumber.trim() : "";
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";
    if (!bankName || !/^\d{9}$/.test(routingNumber) || accountNumber.length < 4) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    // Cifrado con lib/crypto.ts (AES-256-GCM, mismo mecanismo que ya protege
    // los access_token de Plaid) — nunca en texto plano. account_last4 se
    // guarda sin cifrar a propósito (no es sensible por sí solo) para que el
    // panel de admin muestre "···1234" sin tener que descifrar nada solo
    // para confirmar de un vistazo qué cuenta es.
    const { error } = await admin
      .from("socios")
      .update({
        bank_name: bankName,
        routing_number_encrypted: encryptSecret(routingNumber),
        account_number_encrypted: encryptSecret(accountNumber),
        account_last4: accountNumber.slice(-4),
        datos_pago_completados_at: new Date().toISOString(),
      })
      .eq("id", socio.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
    pagoListo = true;
  }

  // ¿Quedaron los dos pasos listos? Marca completado (una sola vez) y, para
  // vendedores, entrega código + QR + PIN por correo.
  let completado = !!socio.documentos_completados_at;
  if (contratoListo && pagoListo && !socio.documentos_completados_at) {
    const datos: Record<string, unknown> = { documentos_completados_at: new Date().toISOString() };
    let pinPlano: string | null = null;
    if (esVendedor) {
      pinPlano = generarPin();
      datos.pin_hash = hashPin(pinPlano, socio.id);
    }
    const { error } = await admin.from("socios").update(datos).eq("id", socio.id);
    if (!error) {
      completado = true;
      if (socio.email && socio.codigo) {
        sendSocioAprobadoEmail({ toEmail: socio.email, toName: socio.nombre, codigo: socio.codigo, pin: pinPlano }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true, completado, contratoListo, pagoListo });
}
