import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarPin } from "@/lib/pin";
import { crearSesionSocio, COOKIE_SESION_SOCIO, MAX_AGE_SESION_SOCIO } from "@/lib/socio-session";

// Login del portal del vendedor — mismo patrón que /api/tecnico/login:
// código corto + PIN de 4 dígitos, sin Supabase Auth. Solo socios
// tipo='vendedor' aprobados tienen PIN (se genera al aprobar, ver
// app/api/socios/[id]/route.ts) — un embajador (cpa/influencer/otro) nunca
// tiene pin_hash, así que ni siquiera puede intentar entrar aquí.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!codigo || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Código o PIN inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("id, nombre, tipo, estado, pin_hash")
    .eq("codigo", codigo)
    .maybeSingle();

  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado" || !socio.pin_hash) {
    return NextResponse.json({ error: "Este código no es válido o no tiene portal activo." }, { status: 401 });
  }

  if (!verificarPin(pin, socio.id, socio.pin_hash)) {
    return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, nombre: socio.nombre });

  res.cookies.set(COOKIE_SESION_SOCIO, crearSesionSocio(socio.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SESION_SOCIO,
  });

  return res;
}
