import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirFounder } from "@/lib/mkt-auth";

const RE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export async function GET() {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data } = await createAdminClient().from("mkt_prospectos").select("*").order("created_at", { ascending: false }).limit(1000);
  return NextResponse.json({ prospectos: data ?? [] });
}

// POST { texto } — una línea por prospecto: email, nombre, empresa, nota (CSV simple)
export async function POST(req: NextRequest) {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { texto, fuente } = await req.json().catch(() => ({}));
  if (typeof texto !== "string" || !texto.trim()) return NextResponse.json({ error: "Pega al menos una línea." }, { status: 400 });
  const admin = createAdminClient();

  const vistos = new Set<string>();
  const filas: { email: string; nombre: string | null; empresa: string | null; nota: string | null; fuente: string | null }[] = [];
  let invalidos = 0;
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const [email, nombre, empresa, ...resto] = linea.split(/[,;\t]/).map((s) => s.trim());
    const e = (email || "").toLowerCase();
    if (!RE_EMAIL.test(e)) { invalidos++; continue; }
    if (vistos.has(e)) continue;
    vistos.add(e);
    filas.push({ email: e, nombre: nombre || null, empresa: empresa || null, nota: resto.join(", ") || null, fuente: fuente || null });
  }
  if (filas.length === 0) return NextResponse.json({ error: "No encontré emails válidos.", invalidos }, { status: 400 });

  // Excluir: ya existentes (incluye bajas) y usuarios actuales de VICTOR.
  const lista = filas.map((f) => f.email);
  const [{ data: yaProspectos }, { data: yaUsuarios }] = await Promise.all([
    admin.from("mkt_prospectos").select("email").in("email", lista),
    admin.from("users").select("email").in("email", lista),
  ]);
  const excluir = new Set([...(yaProspectos ?? []), ...(yaUsuarios ?? [])].map((r) => String(r.email).toLowerCase()));
  const nuevas = filas.filter((f) => !excluir.has(f.email));
  if (nuevas.length) {
    const { error } = await admin.from("mkt_prospectos").insert(nuevas);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ agregados: nuevas.length, omitidos: filas.length - nuevas.length, invalidos });
}

// PATCH { id, estado } — solo respondio | pendiente
export async function PATCH(req: NextRequest) {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { id, estado } = await req.json().catch(() => ({}));
  if (!id || !["respondio", "pendiente"].includes(estado)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("mkt_prospectos").select("estado").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "No existe." }, { status: 404 });
  if ((p as { estado: string }).estado === "baja") return NextResponse.json({ error: "Se dio de baja; no se puede reactivar." }, { status: 400 });
  await admin.from("mkt_prospectos").update({ estado }).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requerirFounder())) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  const admin = createAdminClient();
  // Las bajas se conservan (lista de exclusión); lo demás se puede borrar.
  const { error } = await admin.from("mkt_prospectos").delete().eq("id", id).neq("estado", "baja");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
