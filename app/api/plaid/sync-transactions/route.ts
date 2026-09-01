import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidConfigurado } from "@/lib/plaid";
import { sincronizarPlaidDeUsuario } from "@/lib/plaid-sync";
import { detectarYMarcarDuplicados } from "@/lib/duplicados";

// Trae transacciones nuevas/modificadas de TODOS los bancos conectados del
// usuario, disparado a mano desde el botón "Sincronizar transacciones" en
// /dashboard/cuentas. La lógica real vive en lib/plaid-sync.ts — este
// endpoint solo resuelve quién es el usuario (sesión) y su plan, y le
// pasa el trabajo a la función compartida (la misma que usa el cron
// nocturno en app/api/cron/sync-all-plaid).
export async function POST() {
  if (!plaidConfigurado()) {
    return NextResponse.json({ error: "Plaid no está configurado todavía." }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  const resultado = await sincronizarPlaidDeUsuario(supabase, user.id, esPro);

  // Después de traer lo nuevo de Plaid, revisamos si alguna coincide con
  // una transacción manual ya existente (caso Free→Core: CSV a mano +
  // luego conectar el banco de verdad) — ver lib/duplicados.ts.
  let duplicadas = 0;
  try {
    const r = await detectarYMarcarDuplicados(supabase, user.id);
    duplicadas = r.marcadas;
  } catch (err) {
    console.error("No se pudo correr la detección de duplicados:", err);
  }

  return NextResponse.json({ ...resultado, duplicadasDetectadas: duplicadas });
}
