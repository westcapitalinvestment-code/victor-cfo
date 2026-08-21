import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Crea una categoría PERSONAL del usuario (no toca el catálogo global ni
// las líneas de Anejo M/Schedule C) — misma lógica que la tool
// crear_categoria_personal de VICTOR (lib/victor/tools.ts), pero
// disponible directo desde la pantalla de Gastos sin tener que pasar por
// el chat. Antes esta era la ÚNICA forma de crear una categoría nueva; el
// usuario que quiere monitorear algo específico (ej. "Gastos del bebé")
// tenía que pedírselo a VICTOR en vez de poder hacerlo él mismo con un
// botón "+ Añadir categoría".
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { nombre } = await req.json();
  const nombreLimpio = String(nombre ?? "").trim();

  if (!nombreLimpio) {
    return NextResponse.json({ error: "Falta el nombre de la categoría." }, { status: 400 });
  }
  if (nombreLimpio.length > 60) {
    return NextResponse.json({ error: "El nombre es muy largo (máximo 60 caracteres)." }, { status: 400 });
  }

  // Evita duplicados — RLS ya limita esta lectura al catálogo global +
  // las categorías personales de este mismo usuario, así que cualquier
  // coincidencia aquí es de verdad relevante para él.
  const { data: existentes, error: buscarError } = await supabase
    .from("hacienda_categories")
    .select("id, nombre")
    .eq("activo", true)
    .ilike("nombre", `%${nombreLimpio}%`);

  if (buscarError) {
    return NextResponse.json({ error: `No se pudo verificar categorías existentes: ${buscarError.message}` }, { status: 500 });
  }
  if (existentes && existentes.length > 0) {
    return NextResponse.json(
      { error: `Ya existe una categoría parecida: "${existentes.map((c) => c.nombre).join('", "')}".` },
      { status: 409 }
    );
  }

  const { data: nueva, error } = await supabase
    .from("hacienda_categories")
    .insert({ nombre: nombreLimpio, owner_id: user.id, activo: true })
    .select("id, nombre")
    .single();

  if (error) {
    return NextResponse.json({ error: `No se pudo crear la categoría: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, categoria: nueva });
}
