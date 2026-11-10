import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { pagosPendientes } from "@/lib/pago-socios";

export const dynamic = "force-dynamic";

// Lista de lo que hay que pagarle a cada socio en la próxima quincena —
// solo el founder. Sin datos de banco (esos van solo dentro del PDF).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    const pagos = await pagosPendientes(createAdminClient());
    return NextResponse.json({ pagos });
  } catch {
    return NextResponse.json({ error: "No se pudieron calcular los pagos." }, { status: 500 });
  }
}
