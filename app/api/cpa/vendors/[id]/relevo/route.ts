import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// GET: redirige a una URL firmada temporal del Certificado de Relevo de un
// contratista, para el CPA (2 oct 2026, pedido de Joel: "una vez se suba
// alguna forma o documento, el contable lo ve?" — hoy el portal CPA solo
// mostraba el badge de vigente/vencido, nunca el archivo real).
// Deliberadamente NO filtra por owner_id — usa el cliente con sesión para
// que RLS (*_cpa_read) decida si este usuario (dueño o CPA vinculado) puede
// leer esta fila de vendors. Si no tiene acceso, RLS devuelve 0 filas y esto
// responde 404, igual que /api/pagos/vendors/[id]/relevo pero sin asumir
// que quien pide el archivo es necesariamente el dueño.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: vendor, error } = await supabase.from("vendors").select("relevo_r2_key").eq("id", params.id).single();

  if (error || !vendor || !vendor.relevo_r2_key) {
    return NextResponse.json({ error: "Relevo no encontrado." }, { status: 404 });
  }

  const url = await urlDescargaR2(vendor.relevo_r2_key);
  return NextResponse.redirect(url);
}
