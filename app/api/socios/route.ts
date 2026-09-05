import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Aplicación pública al Programa de Socios (5 sept 2026) — sin sesión, la
// llama /app/socios/page.tsx. Nace siempre en estado='pendiente' y sin
// código — Joel revisa a mano desde el Dashboard de Operaciones antes de
// que nadie pueda compartir un link real (ver PATCH en
// app/api/socios/[id]/route.ts, que es quien genera el código al aprobar).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const telefono = typeof body?.telefono === "string" ? body.telefono.trim() : null;
  const tipo = body?.tipo === "cpa" || body?.tipo === "influencer" ? body.tipo : "otro";
  const comoPromociona = typeof body?.comoPromociona === "string" ? body.comoPromociona.trim() : null;

  if (!nombre || !email) {
    return NextResponse.json({ error: "Falta tu nombre o email." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("socios").insert({
    nombre,
    email,
    telefono,
    tipo,
    como_promociona: comoPromociona,
  });

  if (error) {
    console.error("Error guardando solicitud de socio:", error);
    return NextResponse.json({ error: "No se pudo enviar tu solicitud. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
