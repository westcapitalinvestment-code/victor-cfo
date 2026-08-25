import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/pin";

// Verifica el PIN escrito contra el hash guardado. Requiere sesión de
// Supabase activa (no es un endpoint público) — eso, junto con el
// autobloqueo tras varios intentos fallidos que hace el PinGate del
// cliente (app/dashboard/pin-gate.tsx), es lo que limita la fuerza bruta;
// no hace falta una tabla de rate-limit aparte para una traba de pantalla.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ ok: false }, { status: 400 });

  const { data } = await supabase.from("users").select("pin_hash").eq("id", user.id).maybeSingle();
  const correcto = !!data?.pin_hash && data.pin_hash === hashPin(pin, user.id);
  return NextResponse.json({ ok: correcto });
}
