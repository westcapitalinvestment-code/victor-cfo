import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlDescargaR2 } from "@/lib/r2";

// Redirige a una URL firmada temporal (5 min) de la foto de evidencia de un
// gasto reportado por técnico — mismo patrón que
// /api/documentos/archivo/[fileId]/ver. Bucket privado, solo el dueño.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { data: log, error } = await supabase.from("expense_evidence_logs").select("r2_key").eq("id", params.id).eq("owner_id", user.id).single();

  if (error || !log) return NextResponse.json({ error: "Evidencia no encontrada." }, { status: 404 });

  const url = await urlDescargaR2(log.r2_key);
  return NextResponse.redirect(url);
}
