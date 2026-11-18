import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { probarCredenciales, registrarWebhook, type AmbienteAuthnet } from "@/lib/authorize-net";

// Conectar / desconectar el cobro con tarjeta por B2B Merchant
// (Authorize.Net) de una entidad — 18 nov 2026. Las llaves se cifran en el
// servidor y nunca se devuelven al navegador. Al guardar se prueban contra
// Authorize.Net y se registra el webhook de pagos de la entidad.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    apiLoginId?: string;
    transactionKey?: string;
    signatureKey?: string;
    ambiente?: string;
  };

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, authnet_transaction_key_enc, authnet_signature_key_enc")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const apiLoginId = (body.apiLoginId || "").trim();
  const ambiente: AmbienteAuthnet = body.ambiente === "produccion" ? "produccion" : "sandbox";
  // Las llaves solo se reemplazan si mandaron una nueva (el formulario nunca las muestra de vuelta).
  const transactionKey =
    (body.transactionKey || "").trim() ||
    (entidad.authnet_transaction_key_enc ? decryptSecret(entidad.authnet_transaction_key_enc) : "");
  const signatureKey =
    (body.signatureKey || "").trim() ||
    (entidad.authnet_signature_key_enc ? decryptSecret(entidad.authnet_signature_key_enc) : "");

  if (!apiLoginId || !transactionKey) {
    return NextResponse.json({ error: "Falta el API Login ID o la Transaction Key." }, { status: 400 });
  }
  if (!signatureKey) {
    return NextResponse.json(
      { error: "Falta la Signature Key: sin ella VICTOR no puede confirmar los pagos automáticamente." },
      { status: 400 }
    );
  }

  const prueba = await probarCredenciales({ apiLoginId, transactionKey, ambiente });
  if (!prueba.ok) {
    return NextResponse.json(
      { error: `Authorize.Net no aceptó esas credenciales (${prueba.error}). Revisa que sean del ambiente correcto.` },
      { status: 400 }
    );
  }

  const webhook = await registrarWebhook({ apiLoginId, transactionKey, signatureKey, ambiente }, params.id);

  const { error } = await supabase
    .from("business_entities")
    .update({
      authnet_api_login_id: apiLoginId,
      authnet_transaction_key_enc: encryptSecret(transactionKey),
      authnet_signature_key_enc: encryptSecret(signatureKey),
      authnet_ambiente: ambiente,
      authnet_activo: true,
      authnet_webhook_id: webhook.ok ? webhook.webhookId : null,
    })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    avisoWebhook: webhook.ok
      ? null
      : `Las credenciales funcionan, pero no se pudo crear el aviso automático de pagos (${webhook.error}). Las facturas se pueden cobrar, pero habrá que marcarlas pagadas a mano hasta resolverlo.`,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { error } = await supabase
    .from("business_entities")
    .update({
      authnet_activo: false,
      authnet_transaction_key_enc: null,
      authnet_signature_key_enc: null,
      authnet_webhook_id: null,
    })
    .eq("id", params.id)
    .eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
