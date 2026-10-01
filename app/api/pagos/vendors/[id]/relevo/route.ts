import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2, borrarArchivoR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del Relevo del contratista.
// DELETE: quita el relevo del contratista (vuelve a 10% por defecto) y lo
// borra de R2. Mismo patrón que /api/entidades/[id]/relevo.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("relevo_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !vendor || !vendor.relevo_r2_key) {
    return NextResponse.json({ error: "Relevo no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(vendor.relevo_r2_key);
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

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("relevo_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !vendor) {
    return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  }

  if (vendor.relevo_r2_key) {
    try {
      await borrarArchivoR2(vendor.relevo_r2_key);
    } catch (err) {
      console.error("Error borrando relevo de contratista en R2:", err);
    }
  }

  const { error: updateError } = await supabase
    .from("vendors")
    .update({ relevo_r2_key: null, relevo_pct: null, relevo_fecha_expiracion: null })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
