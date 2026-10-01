import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2, borrarArchivoR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del Registro de Comerciante del
// contratista. DELETE: lo quita del expediente y lo borra de R2. Mismo
// patrón que /api/pagos/vendors/[id]/relevo.
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
    .select("registro_comerciante_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !vendor || !vendor.registro_comerciante_r2_key) {
    return NextResponse.json({ error: "Registro de Comerciante no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(vendor.registro_comerciante_r2_key);
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
    .select("registro_comerciante_r2_key")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .single();

  if (error || !vendor) {
    return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  }

  if (vendor.registro_comerciante_r2_key) {
    try {
      await borrarArchivoR2(vendor.registro_comerciante_r2_key);
    } catch (err) {
      console.error("Error borrando registro de comerciante de contratista en R2:", err);
    }
  }

  const { error: updateError } = await supabase
    .from("vendors")
    .update({ registro_comerciante_r2_key: null })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
