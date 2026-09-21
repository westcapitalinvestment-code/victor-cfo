import { NextRequest, NextResponse } from "next/server";
import { enviarBienvenidaInicial } from "@/lib/bienvenida-inicial";

// Ruta PÚBLICA a propósito (21 sept 2026) — se llama desde
// app/registro/page.tsx justo después de supabase.auth.signUp(), momento en
// el que puede NO haber sesión todavía (si el proyecto exige confirmar el
// correo antes de entrar). Sin sesión no hay forma de proteger esto con
// auth.getUser(), así que la protección real vive en enviarBienvenidaInicial:
// idempotente (no manda 2 veces) y solo dispara para cuentas creadas en las
// últimas 2 horas. El peor abuso posible es que alguien le pida a este
// endpoint que le reenvíe NUESTRO propio correo de marketing a un userId que
// ya conoce — no expone ni filtra ningún dato (la respuesta siempre es {ok:true}).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Falta userId." }, { status: 400 });
  }

  try {
    await enviarBienvenidaInicial(userId);
  } catch {
    // Best-effort — nunca debe bloquear el flujo de registro del usuario.
  }

  return NextResponse.json({ ok: true });
}
