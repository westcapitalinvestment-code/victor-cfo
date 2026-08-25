import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/pin";

// Usa el cliente con sesión (no el admin) a propósito — RLS de `users`
// (users_self, migración 0001) ya garantiza que cada quien solo pueda leer
// y actualizar su propia fila, así que ni falta el service role aquí.

// GET: ¿el usuario tiene un PIN activado? Nunca se manda el hash al
// cliente, solo si existe o no.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data } = await supabase.from("users").select("pin_hash").eq("id", user.id).maybeSingle();
  return NextResponse.json({ configurado: !!data?.pin_hash });
}

// POST: activar o cambiar el PIN.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "El PIN debe ser de 4 dígitos." }, { status: 400 });
  }

  const { error } = await supabase.from("users").update({ pin_hash: hashPin(pin, user.id) }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: desactivar el PIN — la app deja de pedirlo hasta que se vuelva a activar.
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { error } = await supabase.from("users").update({ pin_hash: null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
