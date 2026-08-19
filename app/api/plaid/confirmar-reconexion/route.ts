import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Último paso del Update Mode: cuando el usuario termina de reconectar su
// banco en el widget de Plaid (onSuccess), no hace falta pedir un
// public_token nuevo ni volver a guardar el access_token — el Item y el
// access_token siguen siendo los mismos de antes, Plaid solo necesitaba
// que el usuario confirmara sus credenciales/MFA de nuevo. Lo único que
// falta es marcar la conexión como sana otra vez para que:
//   - la pantalla de Cuentas deje de mostrar el aviso de "Reconectar".
//   - el sync (manual y el cron nocturno) vuelva a incluir este Item,
//     porque ambos filtran por status = 'active'.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const itemId: string | undefined = body?.itemId;

  if (!itemId) {
    return NextResponse.json({ error: "Falta itemId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("plaid_items")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
