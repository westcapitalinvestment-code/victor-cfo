import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENTOS_EMBUDO } from "@/lib/embudo";

// Recibe los pasos del embudo (lib/embudo.ts). Público a propósito (la gente
// aún no tiene cuenta), así que solo acepta eventos conocidos y textos cortos.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const evento = typeof b?.evento === "string" ? b.evento : "";
  if (!EVENTOS_EMBUDO.includes(evento)) return NextResponse.json({ ok: false }, { status: 400 });
  const utm: Record<string, string> = {};
  if (b?.utm && typeof b.utm === "object") {
    for (const [k, v] of Object.entries(b.utm).slice(0, 6)) {
      if (k.startsWith("utm_") && typeof v === "string") utm[k.slice(0, 20)] = v.slice(0, 100);
    }
  }
  await createAdminClient()
    .from("embudo_eventos")
    .insert({
      evento,
      ruta: typeof b?.ruta === "string" ? b.ruta.slice(0, 100) : null,
      sesion: typeof b?.sesion === "string" ? b.sesion.slice(0, 40) : null,
      utm,
    });
  return NextResponse.json({ ok: true });
}
