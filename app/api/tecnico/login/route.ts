import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/pin";
import { crearSesionTecnico, COOKIE_SESION_TECNICO, MAX_AGE_SESION_TECNICO } from "@/lib/tecnico-session";
import { contextoDesdeTechnicianId, construirRespuestaSesion } from "@/lib/tecnico-contexto";

// Login del técnico — NO usa Supabase Auth (ver nota grande en migración
// 0003). Entra con el access_token de su link (victorcfo.com/tecnico?t=...)
// + un PIN de 4 dígitos. Reusa hashPin de lib/pin.ts (mismo esquema
// SHA-256+pepper que el PIN de bloqueo del dueño) pasándole el id del
// técnico en vez de un userId — la función es genérica sobre ese parámetro.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!token || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Link o PIN inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tecnico } = await admin
    .from("technicians")
    .select("id, pin_hash, active")
    .eq("access_token", token)
    .maybeSingle();

  if (!tecnico || !tecnico.active) {
    return NextResponse.json({ error: "Este link no es válido o ya no está activo." }, { status: 401 });
  }

  if (hashPin(pin, tecnico.id) !== tecnico.pin_hash) {
    return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
  }

  const ctx = await contextoDesdeTechnicianId(tecnico.id);
  if (!ctx) return NextResponse.json({ error: "No se pudo cargar tu cuenta — contacta al dueño del negocio." }, { status: 500 });

  const res = NextResponse.json(await construirRespuestaSesion(ctx));

  res.cookies.set(COOKIE_SESION_TECNICO, crearSesionTecnico(tecnico.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SESION_TECNICO,
  });

  return res;
}
