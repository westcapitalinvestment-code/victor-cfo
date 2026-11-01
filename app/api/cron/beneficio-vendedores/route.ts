import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarBeneficiosVendedores } from "@/lib/beneficio-vendedor";

// Cron diario (1 nov 2026): acredita puntos, decide si cada vendedor conserva
// su plan gratis este mes y lo aplica en su cuenta. Ver lib/beneficio-vendedor.ts.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const resumen = await procesarBeneficiosVendedores(createAdminClient());
  return NextResponse.json({ ok: true, ...resumen });
}
