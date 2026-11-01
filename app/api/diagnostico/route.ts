import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AREAS = ["cobros", "separacion", "ganancia", "retenciones", "documentos", "impuestos"];

// Guarda el correo + resultado del diagnóstico público (sin sesión).
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const email = String(b?.email ?? "").trim().toLowerCase().slice(0, 200);
  const area = String(b?.area ?? "");
  if (!EMAIL_RE.test(email) || !AREAS.includes(area)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const socio = String(b?.socio ?? "").toUpperCase();
  const admin = createAdminClient();
  const { error } = await admin.from("diagnostico_leads").insert({
    email,
    area,
    puntajes: b?.puntajes && typeof b.puntajes === "object" ? b.puntajes : null,
    respuestas: Array.isArray(b?.respuestas) ? b.respuestas.slice(0, 20) : null,
    socio_codigo: /^[A-Z0-9]{4,12}$/.test(socio) ? socio : null,
    origen: String(b?.origen ?? "").slice(0, 60) || null,
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
