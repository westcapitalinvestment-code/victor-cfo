import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Actualizar el balance/nombre de una cuenta manual (PATCH) o eliminarla
// (DELETE) — mismo patrón de "verificar ownership antes de tocar nada" que
// el resto de las rutas de Plaid.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: cuenta } = await supabase
    .from("manual_accounts")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "No se encontró esa cuenta." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.nombre === "string" && body.nombre.trim()) patch.name = body.nombre.trim();
  if (typeof body?.tipo === "string") {
    const tiposValidos = ["depository", "credit", "loan", "investment"];
    if (!tiposValidos.includes(body.tipo)) {
      return NextResponse.json({ error: "El tipo de cuenta no es válido." }, { status: 400 });
    }
    patch.type = body.tipo;
  }
  if (body?.balance !== undefined) {
    const balance = Number(body.balance);
    if (!Number.isFinite(balance)) {
      return NextResponse.json({ error: "El balance no es un número válido." }, { status: 400 });
    }
    patch.current_balance = balance;
    patch.balance_actualizado_en = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("manual_accounts")
    .update(patch)
    .eq("id", params.id)
    .select("id, name, type, subtype, mask, current_balance, es_negocio, balance_actualizado_en")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuenta: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: cuenta } = await supabase
    .from("manual_accounts")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!cuenta) return NextResponse.json({ error: "No se encontró esa cuenta." }, { status: 404 });

  // ON DELETE CASCADE en transactions.manual_account_id ya borra las
  // transacciones importadas de esta cuenta junto con ella — no hace falta
  // borrarlas aparte como sí pasa con Plaid (ahí las dejamos a propósito
  // para no perder historial real del banco; aquí, sin cuenta manual detrás,
  // esas filas no tienen sentido por sí solas).
  const { error } = await supabase.from("manual_accounts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
