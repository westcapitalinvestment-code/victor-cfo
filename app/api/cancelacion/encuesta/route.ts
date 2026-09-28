import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint público (sin login) para /encuesta-cancelacion (27 sept 2026,
// pedido de Joel: opciones que se puedan marcar + caja de comentario en
// vez de "responde este correo"). El token viene del correo de
// cancelación (ver sendCancellationWinbackEmail) — es la única forma de
// identificar al usuario aquí, así que se invalida (se pone NULL) en
// cuanto se usa una vez, para que el link no sirva dos veces.
export async function POST(req: NextRequest) {
  let body: { token?: string; razones?: string[]; comentario?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const token = (body.token || "").trim();
  const razones = Array.isArray(body.razones) ? body.razones.filter((r) => typeof r === "string") : [];
  const comentario = typeof body.comentario === "string" ? body.comentario.trim().slice(0, 2000) : "";

  if (!token) {
    return NextResponse.json({ error: "Falta el token." }, { status: 400 });
  }
  if (razones.length === 0 && !comentario) {
    return NextResponse.json({ error: "Marca al menos una opción o escribe un comentario." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: usuario } = await supabase
    .from("users")
    .select("id")
    .eq("cancellation_survey_token", token)
    .maybeSingle();

  if (!usuario) {
    // Token ya usado, o nunca existió — no revelamos cuál de las dos,
    // mismo trato honesto que otros links de un solo uso en la app.
    return NextResponse.json({ error: "Este link ya no está disponible." }, { status: 410 });
  }

  await supabase
    .from("users")
    .update({
      // Guardamos las razones marcadas separadas por coma — el Dashboard
      // de Operaciones (RAZON_CANCELACION_LABEL) ya sabe partir esta
      // lista y traducir cada código.
      cancellation_reason: razones.length > 0 ? razones.join(",") : "other",
      cancellation_comment: comentario || null,
      // Un solo uso: una vez respondida la encuesta, el link muere.
      cancellation_survey_token: null,
    })
    .eq("id", usuario.id);

  return NextResponse.json({ ok: true });
}
