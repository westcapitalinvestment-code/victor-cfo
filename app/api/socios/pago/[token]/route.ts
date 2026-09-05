import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";

// Página pública protegida por token (migración 0071, 5 sept 2026) donde un
// socio APROBADO llena su propia info bancaria para el ACH — sin sesión,
// mismo espíritu que cpa_invitations/admin_invitations pero sin cuenta de
// por medio (un socio externo no necesariamente es cliente). El
// payment_token se genera al aprobar (ver app/api/socios/[id]/route.ts) y
// Joel se lo manda manual, igual que el código de referido.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("nombre, estado, datos_pago_completados_at")
    .eq("payment_token", params.token)
    .maybeSingle();

  if (!socio || socio.estado !== "aprobado") {
    return NextResponse.json({ valido: false });
  }

  return NextResponse.json({
    valido: true,
    nombre: socio.nombre,
    yaCompletado: !!socio.datos_pago_completados_at,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null);
  const bankName = typeof body?.bankName === "string" ? body.bankName.trim() : "";
  const routingNumber = typeof body?.routingNumber === "string" ? body.routingNumber.trim() : "";
  const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";

  if (!bankName || !/^\d{9}$/.test(routingNumber) || accountNumber.length < 4) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("id, estado")
    .eq("payment_token", params.token)
    .maybeSingle();

  if (!socio || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "Link no válido." }, { status: 404 });
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

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
