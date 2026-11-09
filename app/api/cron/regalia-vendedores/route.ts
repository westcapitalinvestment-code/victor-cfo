import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarRegaliasVendedores } from "@/lib/regalia-vendedor";

// Cron diario (9 nov 2026, migración 0208): crea la regalía del mes para cada
// cliente Pro/Business de un vendedor que ya llegó a su mes 7. Idempotente:
// una sola fila por cliente por mes. Ver lib/regalia-vendedor.ts.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const resumen = await procesarRegaliasVendedores(createAdminClient());
  return NextResponse.json({ ok: true, ...resumen });
}
