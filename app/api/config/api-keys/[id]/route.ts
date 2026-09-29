import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// DELETE: revoca una API key (no la borra — solo marca revoked_at, mismo
// criterio que clients.active/archivar: se conserva el registro para
// auditoría, pero deja de aceptarse en autenticarApiKey()).
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();

  // Confirma que la key pertenece a este usuario antes de tocarla — nunca
  // confiar en el :id del URL sin este chequeo.
  const { data: existente } = await admin
    .from("api_keys")
    .select("id")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!existente) return NextResponse.json({ error: "API key no encontrada." }, { status: 404 });

  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
