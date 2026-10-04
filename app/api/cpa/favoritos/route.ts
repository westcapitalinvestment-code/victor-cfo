import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Favoritos del Portal CPA (migración 0140, 4 oct 2026, pedido de Joel a
// nombre de su esposa) — marcar/desmarcar un cliente como favorito del
// contable logueado ("Mis clientes" en app/cpa/cpa-client-list.tsx). No
// valida nada aparte de "estás logueado" porque la RLS de
// cpa_client_favoritos (cpa_client_favoritos_self_all) ya garantiza que
// cada contable solo pueda tocar SUS PROPIOS favoritos — no hace falta
// verificar aquí que el entityId sea de verdad un cliente suyo, Supabase lo
// rechaza solo si intenta insertar con un email que no es el de su sesión
// (y aunque lo lograra, es un simple favorito visual, no un permiso).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entityId;
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "Falta entityId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("cpa_client_favoritos")
    .upsert({ member_email: user.email, entity_id: entityId }, { onConflict: "member_email,entity_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entityId;
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "Falta entityId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("cpa_client_favoritos")
    .delete()
    .eq("member_email", user.email)
    .eq("entity_id", entityId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
