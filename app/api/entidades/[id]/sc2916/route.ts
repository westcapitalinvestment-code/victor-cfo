import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2, borrarArchivoR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del Certificado SC 2916.
// DELETE: quita el certificado de la entidad (y lo borra de R2).
// Mismo patrón que app/api/entidades/[id]/relevo/route.ts.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: entidad, error } = await supabase
    .from("business_entities")
    .select("sc2916_certificate_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !entidad || !entidad.sc2916_certificate_r2_key) {
    return NextResponse.json({ error: "Certificado no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(entidad.sc2916_certificate_r2_key);
  return NextResponse.redirect(url);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: entidad, error } = await supabase
    .from("business_entities")
    .select("sc2916_certificate_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  if (entidad.sc2916_certificate_r2_key) {
    try {
      await borrarArchivoR2(entidad.sc2916_certificate_r2_key);
    } catch (err) {
      console.error("Error borrando Certificado SC 2916 de R2:", err);
    }
  }

  const { error: updateError } = await supabase
    .from("business_entities")
    .update({ sc2916_certificate_r2_key: null })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
