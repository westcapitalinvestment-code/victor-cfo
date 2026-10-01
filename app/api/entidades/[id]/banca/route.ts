import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

// Cuenta bancaria ORIGINADORA de la entidad para exportar archivos NACHA
// (30 sept 2026) — de aquí sale el dinero de cada Corrida de Pago. El número
// de cuenta se cifra con el mismo AES-256-GCM que ya protege el
// access_token de Plaid (lib/crypto.ts); el routing number no es secreto,
// se guarda en texto plano.
const BANCOS_RUTA: Record<string, string> = {
  BPPR: "021502011",
  FirstBank: "021502228",
  Oriental: "021502914",
};

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { bankName, routingNumber, accountNumber, accountType, companyId } = body as {
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    accountType?: string;
    companyId?: string;
  };

  const routing = (routingNumber || (bankName && BANCOS_RUTA[bankName]) || "").replace(/\D/g, "");
  if (routing.length !== 9) {
    return NextResponse.json({ error: "El routing number debe tener 9 dígitos." }, { status: 400 });
  }
  if (accountType !== "checking" && accountType !== "savings") {
    return NextResponse.json({ error: "El tipo de cuenta debe ser checking o savings." }, { status: 400 });
  }

  const { data: entidad, error: fetchError } = await supabase
    .from("business_entities")
    .select("id, ach_account_number_enc")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();
  if (fetchError || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    ach_bank_name: bankName || null,
    ach_routing_number: routing,
    ach_account_type: accountType,
    ach_company_id: companyId?.trim() || null,
  };
  // El número de cuenta solo se reemplaza si mandaron uno nuevo — así el
  // formulario puede guardar banco/tipo/Company ID sin obligar a
  // re-escribir el número de cuenta cada vez (nunca se devuelve al cliente
  // para poder mostrarlo de vuelta).
  if (accountNumber && accountNumber.trim()) {
    update.ach_account_number_enc = encryptSecret(accountNumber.trim());
  }

  const { error: updateError } = await supabase.from("business_entities").update(update).eq("id", params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
