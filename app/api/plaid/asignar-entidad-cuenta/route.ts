import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Asignar una cuenta de Plaid a una entidad de negocio (o quitarle la
// asignación, entityId: null → vuelve a Personal). Mismo patrón que
// renombrar-cuenta/route.ts: accountId es el id interno (uuid) de la fila
// en plaid_accounts, no el plaid_account_id de Plaid. Sin esto, todas las
// transacciones nuevas de esa cuenta se guardan con entity_id NULL —o sea,
// mezcladas con Personal (ver lib/plaid-sync.ts).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const accountId: string | undefined = body?.accountId;
  const entityId: string | null = typeof body?.entityId === "string" && body.entityId ? body.entityId : null;

  if (!accountId) {
    return NextResponse.json({ error: "Falta accountId." }, { status: 400 });
  }

  if (entityId) {
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!entidad) return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });
  }

  const { error } = await supabase
    .from("plaid_accounts")
    .update({ entity_id: entityId })
    .eq("id", accountId)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
