import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico, construirRespuestaSesion } from "@/lib/tecnico-contexto";

// Re-hidrata la sesión del técnico cuando recarga /tecnico con la cookie ya
// puesta (para no pedirle el PIN de nuevo cada vez que abre el link).
export async function GET(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await construirRespuestaSesion(ctx));
}
