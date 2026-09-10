import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Renombrar (PATCH) o eliminar (DELETE) una categoría PERSONAL propia
// (10 sept 2026, pedido de Joel — ver comentario largo en
// /api/categorias/fusionar/route.ts sobre por qué existe esta pantalla).
// Ninguna de las dos toca el catálogo global (owner_id null) — eso es
// catálogo compartido, se administra solo por migración, igual que ya
// pasaba con la escritura de /api/categorias/crear.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });

  const { nombre } = await req.json();
  const nombreLimpio = String(nombre ?? "").trim();
  if (!nombreLimpio) return NextResponse.json({ error: "Falta el nombre nuevo." }, { status: 400 });
  if (nombreLimpio.length > 60) return NextResponse.json({ error: "El nombre es muy largo (máximo 60 caracteres)." }, { status: 400 });

  // .eq("owner_id", user.id) a propósito — RLS (hacienda_categories_owner_write,
  // 0012) ya lo exige, pero lo repetimos aquí para que un intento sobre una
  // categoría global devuelva un mensaje claro en vez de un "0 filas" mudo.
  const { data: actualizada, error } = await supabase
    .from("hacienda_categories")
    .update({ nombre: nombreLimpio })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, nombre")
    .maybeSingle();

  if (error) return NextResponse.json({ error: `No se pudo renombrar: ${error.message}` }, { status: 500 });
  if (!actualizada) {
    return NextResponse.json(
      { error: "Esa categoría no existe, o es del catálogo global y no se puede renombrar (fusiónala en otra en su lugar)." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, categoria: actualizada });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });

  const { data: categoria, error: catError } = await supabase
    .from("hacienda_categories")
    .select("id, nombre, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });
  if (!categoria || categoria.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Esa categoría no existe, o es del catálogo global y no se puede eliminar (fusiónala en otra en su lugar)." },
      { status: 404 }
    );
  }

  // Guardarraíl: no se borra si todavía tiene transacciones — el usuario
  // debe fusionarla primero (mismo botón, más seguro que perder el rastro
  // de un gasto real). Contamos SOLO las de este owner, que es todo lo que
  // esta categoría personal puede tener referenciado.
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("hacienda_category_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `"${categoria.nombre}" todavía tiene ${count} transacción(es). Fusiónala en otra categoría en vez de eliminarla.` },
      { status: 409 }
    );
  }

  const { error: delError } = await supabase.from("hacienda_categories").delete().eq("id", id).eq("owner_id", user.id);
  if (delError) return NextResponse.json({ error: `No se pudo eliminar: ${delError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
