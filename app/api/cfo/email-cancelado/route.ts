import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { esFounder } from "@/lib/founder";
import { sendMensajeSoporteManual } from "@/lib/email";

// Envía el correo de "Cancelados recientes" (Dashboard de Operaciones)
// de verdad, desde el servidor con remitente soporte@victorcfo.com fijo —
// reemplaza el link mailto que antes usaba el botón "Email" y salía con
// la cuenta personal de Joel (27 sept 2026, pedido de Joel: "no me gusta").
// Solo el founder, mismo candado que /api/cfo/reenviar-bienvenida.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const toEmail = typeof body?.toEmail === "string" ? body.toEmail.trim() : "";
  const asunto = typeof body?.asunto === "string" ? body.asunto.trim() : "";
  const mensaje = typeof body?.mensaje === "string" ? body.mensaje.trim() : "";

  if (!toEmail || !asunto || !mensaje) {
    return NextResponse.json({ error: "Falta destinatario, asunto o mensaje." }, { status: 400 });
  }

  const resultado = await sendMensajeSoporteManual({ toEmail, asunto, mensaje });
  if (!resultado.sent) {
    return NextResponse.json({ error: resultado.reason ?? "No se pudo enviar el correo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
