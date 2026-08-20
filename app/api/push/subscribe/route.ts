import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guarda (POST) o borra (DELETE) la suscripción push de ESTE dispositivo
// para el usuario logueado. Usa el cliente con sesión (no el admin) a
// propósito — RLS de push_subscriptions ya garantiza que cada quien solo
// pueda tocar sus propias filas, así que ni falta el service role aquí.

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Faltan datos de la suscripción push." }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      owner_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent") ?? null,
    },
    { onConflict: "owner_id,endpoint" }
  );
  // Nota: a diferencia del import de transacciones (donde el índice único
  // era PARCIAL y por eso ON CONFLICT no servía), aquí el UNIQUE(owner_id,
  // endpoint) de la migración 0015 es un índice normal, sin condición WHERE
  // — así que upsert con onConflict sí funciona bien.

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: "Falta el endpoint de la suscripción a borrar." }, { status: 400 });

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("owner_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
