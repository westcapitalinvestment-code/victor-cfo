import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del Certificado de Registro de
// Comerciante de un contratista, para el CPA — mismo patrón y misma razón
// que /api/cpa/vendors/[id]/relevo (2 oct 2026).
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
    .single();

  if (error || !vendor || !vendor.registro_comerciante_r2_key) {
    return NextResponse.json({ error: "Registro de Comerciante no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(vendor.registro_comerciante_r2_key);
  return NextResponse.redirect(url);
}
