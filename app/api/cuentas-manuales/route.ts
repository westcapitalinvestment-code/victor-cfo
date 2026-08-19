import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pareceCuentaDeNegocio } from "@/lib/plaid";

// Cuentas manuales — el equivalente de plaid_accounts pero sin Plaid detrás
// (bancos/tarjetas que Plaid no soporta, ej. Apple Card, o cualquier cuenta
// que el usuario prefiera llevar a mano). GET lista las del usuario, POST
// crea una nueva.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data, error } = await supabase
    .from("manual_accounts")
    .select("id, name, type, subtype, mask, current_balance, es_negocio, balance_actualizado_en")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuentas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nombre: string | undefined = body?.nombre?.trim();
  const tipo: string | undefined = body?.tipo; // depository | credit | loan | investment
  const subtipo: string | undefined = body?.subtipo?.trim() || null;
  const balanceInicial = Number(body?.balanceInicial);

  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre de la cuenta." }, { status: 400 });
  }
  const tiposValidos = ["depository", "credit", "loan", "investment"];
  if (!tipo || !tiposValidos.includes(tipo)) {
    return NextResponse.json({ error: "El tipo de cuenta no es válido." }, { status: 400 });
  }
  if (!Number.isFinite(balanceInicial)) {
    return NextResponse.json({ error: "El balance inicial no es un número válido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("manual_accounts")
    .insert({
      owner_id: user.id,
      name: nombre,
      type: tipo,
      subtype: subtipo,
      current_balance: balanceInicial,
      es_negocio: pareceCuentaDeNegocio(nombre, null, subtipo),
      balance_actualizado_en: new Date().toISOString(),
    })
    .select("id, name, type, subtype, mask, current_balance, es_negocio, balance_actualizado_en")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuenta: data });
}
