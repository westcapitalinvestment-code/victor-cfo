import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { plaidConfigurado } from "@/lib/plaid";
import { sincronizarPlaidDeUsuario } from "@/lib/plaid-sync";

// Sincronización nocturna de Plaid para TODOS los usuarios con banco
// conectado — la dispara el Cron Job de Vercel (ver vercel.json), no un
// usuario. Sin esto, VICTOR nunca podría saludar en la mañana con "detecté
// 4 gastos de anoche" porque nadie habría bajado esas transacciones
// todavía — antes la única forma de sincronizar era que el usuario
// entrara a Cuentas y presionara el botón a mano.
//
// Seguridad: Vercel manda automáticamente el header
// "Authorization: Bearer <CRON_SECRET>" cuando invoca sus Cron Jobs,
// usando el valor real de la variable de entorno CRON_SECRET puesta en
// el proyecto — cualquier otra petición sin ese secreto exacto se
// rechaza con 401. Corre con la service_role key (createAdminClient),
// porque tiene que leer/escribir datos de TODOS los usuarios, no solo
// de uno con sesión activa como el botón manual.
export const maxDuration = 300; // hasta 5 min — puede haber varios usuarios/bancos

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!plaidConfigurado()) {
    return NextResponse.json({ error: "Plaid no está configurado todavía." }, { status: 500 });
  }

  const supabase = createAdminClient();

  // Un item de Plaid por fila, pero lo que necesitamos es la lista de
  // dueños ÚNICOS con al menos un banco activo — sincronizarPlaidDeUsuario
  // ya recorre TODOS los items de ese dueño en una sola llamada.
  const { data: items, error: itemsError } = await supabase
    .from("plaid_items")
    .select("owner_id")
    .eq("status", "active");

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const ownerIds = Array.from(new Set((items ?? []).map((i) => i.owner_id)));

  const resultados: Record<string, unknown> = {};
  let usuariosConError = 0;

  for (const ownerId of ownerIds) {
    try {
      const { data: profile } = await supabase.from("users").select("plan").eq("id", ownerId).maybeSingle();
      const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
      const resultado = await sincronizarPlaidDeUsuario(supabase, ownerId, esPro);
      resultados[ownerId] = resultado;
      if (!resultado.ok) usuariosConError++;
    } catch (err) {
      usuariosConError++;
      resultados[ownerId] = { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  return NextResponse.json({
    ok: usuariosConError === 0,
    usuariosSincronizados: ownerIds.length,
    usuariosConError,
    resultados,
  });
}
