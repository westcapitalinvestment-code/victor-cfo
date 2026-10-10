import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Favoritos de la sección Personal del Portal CPA (migración 0147). Misma idea
// que /api/cpa/favoritos: la RLS (cpa_personal_favoritos_self_all) garantiza
// que cada contable solo toca los suyos; es organización visual, no permiso.
async function contexto(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const body = await req.json().catch(() => null);
  const ownerId = body?.ownerId;
  if (!ownerId || typeof ownerId !== "string") {
    return { error: NextResponse.json({ error: "Falta ownerId." }, { status: 400 }) };
  }
  return { supabase, email: user.email, ownerId };
}

export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if ("error" in c && c.error) return c.error;
  const { supabase, email, ownerId } = c as { supabase: ReturnType<typeof createClient>; email: string; ownerId: string };
  const { error } = await supabase
    .from("cpa_personal_favoritos")
    .upsert({ member_email: email, owner_id: ownerId }, { onConflict: "member_email,owner_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const c = await contexto(req);
  if ("error" in c && c.error) return c.error;
  const { supabase, email, ownerId } = c as { supabase: ReturnType<typeof createClient>; email: string; ownerId: string };
  const { error } = await supabase
    .from("cpa_personal_favoritos")
    .delete()
    .eq("member_email", email)
    .eq("owner_id", ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
