import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";
import { calcularEmbudo } from "@/lib/embudo-socios";

// "Mi semana y mi embudo" del vendedor (0197): cuántos contactos visitó, en qué
// estado están, su ritmo de las últimas semanas y cuántos ya forman parte.
export async function GET(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const admin = createAdminClient();
  const { data: socio } = await admin.from("socios").select("id, tipo, estado").eq("id", socioId).maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const mapa = await calcularEmbudo(admin, [socioId]);
  return NextResponse.json({ ok: true, embudo: mapa.get(socioId) });
}
