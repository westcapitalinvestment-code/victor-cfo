import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { elegirCamino, respuestasValidas } from "@/lib/plan-gratis";

// Guarda (POST) o borra (DELETE) el cuestionario "Tu plan" del plan gratis.
// El camino se calcula en el servidor a partir de las respuestas.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!respuestasValidas(body?.respuestas))
    return NextResponse.json({ error: "Respuestas no válidas." }, { status: 400 });

  const respuestas = body.respuestas;
  const camino = elegirCamino(respuestas);
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ onboarding_gratis: { respuestas, camino, fecha: new Date().toISOString() } })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, camino });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ onboarding_gratis: null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
