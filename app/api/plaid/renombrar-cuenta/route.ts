import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ponerle un apodo a una cuenta de Plaid (ej. dos "checking" del mismo
// banco que llegan con nombres iguales o parecidos — sin esto no hay forma
// de distinguirlas salvo por el balance). Nunca toca plaid_accounts.name
// (el nombre real que manda el banco) — nickname es un campo aparte que la
// app prefiere mostrar cuando existe. accountId es el id interno (uuid) de
// la fila en plaid_accounts, no el plaid_account_id de Plaid.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const accountId: string | undefined = body?.accountId;
  const nickname: string | null = typeof body?.nickname === "string" ? body.nickname.trim() || null : null;

  if (!accountId) {
    return NextResponse.json({ error: "Falta accountId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("plaid_accounts")
    .update({ nickname })
    .eq("id", accountId)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
