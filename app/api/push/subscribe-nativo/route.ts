import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guarda (POST) o borra (DELETE) el token de push NATIVO (APNs/FCM) de este
// dispositivo — migración 0111, 30 sept 2026, app empacada con Capacitor.
// Aparte de /api/push/subscribe (Web Push/VAPID, para cuando corre en el
// navegador/PWA instalada) porque el shape del token es distinto.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  const token = typeof body?.token === "string" ? body.token : null;

  if (!platform || !token) {
    return NextResponse.json({ error: "Faltan platform ('ios'|'android') o token." }, { status: 400 });
  }

  const { error } = await supabase
    .from("native_push_tokens")
    .upsert({ owner_id: user.id, platform, token }, { onConflict: "owner_id,token" });

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
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) return NextResponse.json({ error: "Falta el token a borrar." }, { status: 400 });

  const { error } = await supabase.from("native_push_tokens").delete().eq("owner_id", user.id).eq("token", token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
