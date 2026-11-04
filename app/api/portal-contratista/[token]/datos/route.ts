import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El contratista actualiza su dirección postal y correo (para recibir el
// 480.6SP). Solo esos dos campos; nada financiero ni bancario.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!TOKEN_RE.test(params.token)) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const address = typeof body?.address === "string" ? body.address.trim().slice(0, 300) : "";
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Correo no válido." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vendors")
    .update({ address: address || null, email: email || null })
    .eq("portal_token", params.token)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "No se pudo guardar." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
