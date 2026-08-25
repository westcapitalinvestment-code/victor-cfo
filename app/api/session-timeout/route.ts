import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cuántos minutos sin actividad antes de que la app cierre la sesión de
// verdad (ver app/dashboard/session-timeout-gate.tsx). 0 = "Nunca". Cada
// quien elige su valor en Configuración (session-timeout-config.tsx); solo
// se aceptan estas opciones fijas para no dejar valores raros guardados
// por error.
const OPCIONES_VALIDAS = [0, 15, 30, 60, 240];

// Usa el cliente con sesión (no el admin) — RLS de `users` (users_self,
// migración 0001) ya garantiza que cada quien solo pueda leer/actualizar
// su propia fila.

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data } = await supabase.from("users").select("session_timeout_minutes").eq("id", user.id).maybeSingle();
  return NextResponse.json({ minutos: data?.session_timeout_minutes ?? 15 });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const minutos = typeof body?.minutos === "number" ? body.minutos : NaN;
  if (!OPCIONES_VALIDAS.includes(minutos)) {
    return NextResponse.json({ error: "Valor no válido." }, { status: 400 });
  }

  const { error } = await supabase.from("users").update({ session_timeout_minutes: minutos }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
