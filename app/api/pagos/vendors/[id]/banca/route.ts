import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

// Cuenta bancaria RECEPTORA de un contratista para el archivo NACHA (30 sept
// 2026) — a esta cuenta llega el pago neto. Mismo patrón de cifrado que
// /api/entidades/[id]/banca.
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
  const { bankName, routingNumber, accountNumber, accountType } = body as {
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    accountType?: string;
  };

  const routing = (routingNumber || (bankName && BANCOS_RUTA[bankName]) || "").replace(/\D/g, "");
  if (routing.length !== 9) {
    return NextResponse.json({ error: "El routing number debe tener 9 dígitos." }, { status: 400 });
  }
  if (accountType !== "checking" && accountType !== "savings") {
    return NextResponse.json({ error: "El tipo de cuenta debe ser checking o savings." }, { status: 400 });
  }

  const { data: vendor, error: fetchError } = await supabase
    .from("vendors")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();
  if (fetchError || !vendor) {
    return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    bank_routing_number: routing,
    bank_account_type: accountType,
  };
  if (accountNumber && accountNumber.trim()) {
    update.bank_account_number_enc = encryptSecret(accountNumber.trim());
  }

  const { error: updateError } = await supabase.from("vendors").update(update).eq("id", params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
