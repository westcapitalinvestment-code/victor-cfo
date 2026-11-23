import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nuevoTokenSync } from "@/lib/trading-vinculo";

// La persona escribe aquí el código de 6 dígitos que su guardián muestra en el
// gráfico de MT5 (23 nov 2026). Se le asigna el token de sincronización de la
// cuenta elegida; el guardián lo recoge en su próxima llamada (unos segundos).
export const dynamic = "force-dynamic";

const MAX_FALLOS_HORA = 10;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const codigo = String(body?.codigo ?? "").replace(/\D/g, "");
  const accountId = String(body?.account_id ?? "");
  if (codigo.length !== 6) return NextResponse.json({ error: "El código tiene 6 números." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return NextResponse.json({ error: "Cuenta inválida." }, { status: 400 });

  const admin = createAdminClient();
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("trading_vinculo_intentos")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", u.user.id)
    .gt("created_at", haceUnaHora);
  if ((count ?? 0) >= MAX_FALLOS_HORA) return NextResponse.json({ error: "Demasiados intentos. Espera un rato y vuelve a probar." }, { status: 429 });

  const { data: cuenta } = await admin
    .from("trading_accounts")
    .select("id, owner_id, numero_cuenta, broker")
    .eq("id", accountId)
    .maybeSingle();
  if (!cuenta || cuenta.owner_id !== u.user.id) return NextResponse.json({ error: "Cuenta inválida." }, { status: 400 });

  const { data: filas } = await admin
    .from("trading_vinculos")
    .select("id, login, servidor")
    .eq("codigo", codigo)
    .is("token", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const v = filas?.[0];
  if (!v) {
    await admin.from("trading_vinculo_intentos").insert({ owner_id: u.user.id });
    return NextResponse.json({ error: "Ese código no existe o ya venció. Mira el número que sale en el gráfico de MT5." }, { status: 400 });
  }

  // Token de la cuenta: el que ya tenga o uno nuevo.
  const { data: tk } = await admin.from("trading_sync_tokens").select("token").eq("account_id", cuenta.id).maybeSingle();
  let token = tk?.token as string | undefined;
  if (!token) {
    token = nuevoTokenSync();
    const { error } = await admin
      .from("trading_sync_tokens")
      .insert({ account_id: cuenta.id, owner_id: u.user.id, token, created_at: new Date().toISOString(), last_sync_at: null });
    if (error) return NextResponse.json({ error: "No se pudo conectar. Intenta otra vez." }, { status: 500 });
  }
  await admin.from("trading_vinculos").update({ token, account_id: cuenta.id }).eq("id", v.id);

  const datosCuenta: Record<string, string> = {};
  if (!cuenta.numero_cuenta) datosCuenta.numero_cuenta = v.login;
  if (!cuenta.broker && v.servidor) datosCuenta.broker = v.servidor;
  if (Object.keys(datosCuenta).length) await admin.from("trading_accounts").update(datosCuenta).eq("id", cuenta.id);

  return NextResponse.json({ ok: true, login: v.login });
}
