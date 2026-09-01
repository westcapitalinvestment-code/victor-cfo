import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2, borrarArchivoR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del logo (para <img src=...> en
// el dashboard). DELETE: quita el logo de la entidad (y lo borra de R2).
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
    .select("logo_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !entidad || !entidad.logo_r2_key) {
    return NextResponse.json({ error: "Logo no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(entidad.logo_r2_key);
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
    .select("logo_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  if (entidad.logo_r2_key) {
    try {
      await borrarArchivoR2(entidad.logo_r2_key);
    } catch (err) {
      console.error("Error borrando logo de R2:", err);
    }
  }

  const { error: updateError } = await supabase.from("business_entities").update({ logo_r2_key: null }).eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
