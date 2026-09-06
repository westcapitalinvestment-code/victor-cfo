import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lista los estados de cuenta (CSV/PDF) subidos a una cuenta específica —
// consumido por app/dashboard/cuentas/estados-subidos.tsx para mostrar el
// historial con botón de borrar (migración 0072, 6 sept 2026).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const origenCuenta = searchParams.get("origenCuenta");
  const cuentaId = searchParams.get("cuentaId");

  if (origenCuenta !== "plaid" && origenCuenta !== "manual") {
    return NextResponse.json({ error: "Falta indicar el tipo de cuenta." }, { status: 400 });
  }
  if (!cuentaId) {
    return NextResponse.json({ error: "Falta la cuenta." }, { status: 400 });
  }

  const columna = origenCuenta === "plaid" ? "plaid_account_id" : "manual_account_id";

  const { data, error } = await supabase
    .from("statement_uploads")
    .select("id, origen, nombre_archivo, total_importadas, total_duplicadas, metadata_extraida, created_at")
    .eq("owner_id", user.id)
    .eq(columna, cuentaId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ estados: data ?? [] });
}
