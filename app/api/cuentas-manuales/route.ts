import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pareceCuentaDeNegocio } from "@/lib/plaid";

// Cuentas manuales — el equivalente de plaid_accounts pero sin Plaid detrás
// (bancos/tarjetas que Plaid no soporta, ej. Apple Card, o cualquier cuenta
// que el usuario prefiera llevar a mano). GET lista las del usuario, POST
// crea una nueva.
//
// 8 sept 2026 — GET ahora acepta ?entityId= para la vista por entidad
// (/dashboard/negocio/cuentas) — sin el query param se comporta exactamente
// igual que antes (todas las cuentas del owner, usado en /dashboard/cuentas).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = req.nextUrl.searchParams.get("entityId");

  let query = supabase
    .from("manual_accounts")
    .select("id, name, type, subtype, mask, current_balance, es_negocio, entity_id, balance_actualizado_en")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;

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
  // 8 sept 2026 — entityId explícito (viene de "Añadir cuenta manual" desde
  // el tab de una entidad) le gana a la adivinanza por nombre — si el
  // usuario la está creando parado en VIP Medical, es de VIP Medical, sin
  // importar si el nombre suena a negocio o no.
  const entityId: string | null = typeof body?.entityId === "string" && body.entityId ? body.entityId : null;

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

  if (entityId) {
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (!entidad) return NextResponse.json({ error: "Esa entidad no existe o no te pertenece." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("manual_accounts")
    .insert({
      owner_id: user.id,
      name: nombre,
      type: tipo,
      subtype: subtipo,
      current_balance: balanceInicial,
      es_negocio: entityId ? true : pareceCuentaDeNegocio(nombre, null, subtipo),
      entity_id: entityId,
      balance_actualizado_en: new Date().toISOString(),
    })
    .select("id, name, type, subtype, mask, current_balance, es_negocio, entity_id, balance_actualizado_en")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuenta: data });
}
