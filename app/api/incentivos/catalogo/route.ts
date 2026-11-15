import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";

export const dynamic = "force-dynamic";

// Editor del catálogo de incentivos (15 nov 2026) — solo el founder. Las
// leyes y los programas del DDEC cambian: Joel actualiza aquí el texto, los
// montos, las reglas o desactiva un programa sin tocar código.
const CAMPOS = [
  "nombre", "tipo", "referencia_legal", "resumen", "beneficios", "requisitos_texto", "reglas",
  "tasa_decreto", "monto_max", "urgente", "excluye", "como_solicitar", "enlace", "fuente",
  "verificado_en", "activo", "orden",
] as const;

async function founder() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && esFounder(user.email);
}

export async function GET() {
  if (!(await founder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data, error } = await createAdminClient().from("incentivos_pr").select("*").order("orden");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incentivos: data });
}

export async function PUT(req: NextRequest) {
  if (!(await founder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!/^[a-z0-9_]{3,60}$/.test(id)) return NextResponse.json({ error: "El id debe ser en minúsculas, números o _ (ej. ddec_nuevo)." }, { status: 400 });
  if (!Array.isArray(body?.reglas)) return NextResponse.json({ error: "Las reglas deben ser una lista JSON." }, { status: 400 });
  if (!["decreto", "programa", "credito"].includes(body?.tipo)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  if (!body?.nombre || !body?.resumen || !body?.beneficios || !body?.requisitos_texto) {
    return NextResponse.json({ error: "Nombre, resumen, beneficios y requisitos son obligatorios." }, { status: 400 });
  }
  const fila: Record<string, unknown> = { id, updated_at: new Date().toISOString() };
  for (const c of CAMPOS) if (body[c] !== undefined) fila[c] = body[c] === "" ? null : body[c];
  const { error } = await createAdminClient().from("incentivos_pr").upsert(fila);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
