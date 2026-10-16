import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirFounder } from "@/lib/mkt-auth";

const CAMPOS = ["activo", "tope_diario", "dias_seguimiento", "direccion_fisica", "asunto_1", "cuerpo_1", "asunto_2", "cuerpo_2"] as const;

export async function GET() {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data } = await createAdminClient().from("mkt_config").select("*").eq("id", 1).maybeSingle();
  return NextResponse.json({ config: data, remitenteConfigurado: !!process.env.MKT_FROM_EMAIL, replyTo: process.env.MKT_REPLY_TO || null });
}

export async function PUT(req: NextRequest) {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const c of CAMPOS) if (b[c] !== undefined) upd[c] = b[c];
  if (upd.tope_diario !== undefined) upd.tope_diario = Math.max(1, Math.min(100, Number(upd.tope_diario) || 10));
  if (upd.dias_seguimiento !== undefined) upd.dias_seguimiento = Math.max(2, Math.min(30, Number(upd.dias_seguimiento) || 5));
  const { error } = await createAdminClient().from("mkt_config").update(upd).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
