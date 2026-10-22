import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Marca alertas como vistas (vista: true) o las devuelve a "nuevas" (vista: false).
// Body: { claves: string[], vista: boolean }. Máx. 100 claves guardadas.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const claves: string[] = Array.isArray(body?.claves)
    ? body.claves.filter((c: unknown): c is string => typeof c === "string" && c.length > 0 && c.length < 400).slice(0, 50)
    : [];
  const vista = body?.vista === true;
  if (claves.length === 0) return NextResponse.json({ error: "Faltan alertas." }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("alertas_vistas").eq("id", user.id).maybeSingle();
  const actuales: string[] = Array.isArray((row as { alertas_vistas?: unknown } | null)?.alertas_vistas)
    ? ((row as { alertas_vistas: string[] }).alertas_vistas)
    : [];

  const set = new Set(actuales);
  for (const c of claves) {
    if (vista) set.add(c);
    else set.delete(c);
  }
  const nuevas = Array.from(set).slice(-100);

  const { error } = await admin.from("users").update({ alertas_vistas: nuevas }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
