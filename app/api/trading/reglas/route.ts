import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aplicarPendientes, cancelarPendiente, guardarReglas, listarPendientes } from "@/lib/trading-reglas-server";

// Reglas de trading (22 nov 2026). Apretar aplica ya; aflojar, desde mañana.
// GET: aplica los pendientes que vencieron y devuelve los que faltan.
// POST { cambios, origen }: guarda. DELETE ?id=: cancela un cambio pendiente.
export const dynamic = "force-dynamic";

async function usuario() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function GET() {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const aplicados = await aplicarPendientes(supabase, user.id);
  const pendientes = await listarPendientes(supabase, user.id);
  return NextResponse.json({ aplicados, pendientes });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const cambios = body?.cambios && typeof body.cambios === "object" ? (body.cambios as Record<string, unknown>) : null;
  if (!cambios) return NextResponse.json({ error: "Faltan los cambios." }, { status: 400 });
  const origen = body?.origen === "plan" ? "plan" : "web";
  const r = await guardarReglas(supabase, user.id, cambios, origen);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const ok = await cancelarPendiente(supabase, user.id, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No se pudo cancelar." }, { status: 400 });
}
