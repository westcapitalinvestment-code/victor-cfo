import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarBonosOficinas } from "@/lib/bonos-oficinas";

// Genera a diario los bonos de oficinas de contables que ya cumplen las
// reglas (migración 0164). Idempotente. Mismo patrón de auth que los demás
// crons: header Authorization con CRON_SECRET.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const resultado = await generarBonosOficinas(createAdminClient());
  return NextResponse.json({ ok: true, ...resultado });
}
