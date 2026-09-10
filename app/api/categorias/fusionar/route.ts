import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fusionar dos categorías en una (10 sept 2026, pedido de Joel: "hay una
// que dice Telefonica y otra Telefonia y ambas tienen gastos y debe ser la
// misma"). No es solo mover las transacciones ya guardadas — si nos
// quedáramos ahí, la próxima transacción de ese mismo comercio volvería a
// caer en la categoría vieja porque el motor de auto-categorización
// (merchant_patterns, ver 0001_schema_completo.sql) seguiría apuntando ahí.
// Por eso esta ruta reasigna LAS DOS cosas: las transacciones ya guardadas
// Y los patrones que las categorizan automáticamente en el futuro.
//
// Alcance de seguridad:
//  - transactions: se reasigna solo lo de este owner (.eq("owner_id", ...)),
//    sin importar si la categoría es global o personal.
//  - merchant_patterns: no tiene owner_id propio — se apoya en RLS
//    (merchant_patterns_access, 0001) que ya limita lo que este usuario
//    puede tocar a: patrones globales (entity_id IS NULL, compartidos por
//    el motor) + patrones de SUS PROPIAS entidades de negocio. No hace
//    falta un filtro adicional aquí porque Postgres ya lo aplica.
//  - La categoría ORIGEN solo se BORRA si es personal de este usuario
//    (owner_id = user.id) — una categoría global (owner_id null) es
//    catálogo compartido, nunca se borra, solo se le "vacía" lo de este
//    usuario.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { origenId, destinoId } = await req.json();
  const origen = Number(origenId);
  const destino = Number(destinoId);

  if (!Number.isFinite(origen) || !Number.isFinite(destino)) {
    return NextResponse.json({ error: "Faltan las categorías a fusionar." }, { status: 400 });
  }
  if (origen === destino) {
    return NextResponse.json({ error: "Elige dos categorías distintas." }, { status: 400 });
  }

  // RLS de hacienda_categories (0012) ya limita esta lectura a: catálogo
  // global + las categorías personales de este mismo usuario — si alguna
  // de las dos no aparece aquí, o no existe o no le pertenece.
  const { data: categorias, error: catError } = await supabase
    .from("hacienda_categories")
    .select("id, nombre, owner_id, activo")
    .in("id", [origen, destino]);

  if (catError) {
    return NextResponse.json({ error: `No se pudieron leer las categorías: ${catError.message}` }, { status: 500 });
  }
  const catOrigen = categorias?.find((c) => c.id === origen);
  const catDestino = categorias?.find((c) => c.id === destino);
  if (!catOrigen || !catDestino) {
    return NextResponse.json({ error: "Una de las dos categorías no existe o no te pertenece." }, { status: 404 });
  }
  if (!catDestino.activo) {
    return NextResponse.json({ error: `"${catDestino.nombre}" está inactiva — elige otra categoría destino.` }, { status: 400 });
  }

  // 1) Transacciones ya guardadas — solo las de este owner, en cualquier
  // entidad (personal o negocio), ya que las categorías no son exclusivas
  // de una entidad (ver comentario en lib/estado-resultados.ts).
  const { data: transaccionesMovidas, error: txError } = await supabase
    .from("transactions")
    .update({ hacienda_category_id: destino })
    .eq("owner_id", user.id)
    .eq("hacienda_category_id", origen)
    .select("id");

  if (txError) {
    return NextResponse.json({ error: `No se pudieron reasignar las transacciones: ${txError.message}` }, { status: 500 });
  }

  // 2) Patrones de auto-categorización — para que no se recree el
  // duplicado con la próxima transacción de ese comercio. RLS decide el
  // alcance real (ver comentario arriba); no falla si no hay ninguno.
  const { data: patronesMovidos, error: patronError } = await supabase
    .from("merchant_patterns")
    .update({ hacienda_category_id: destino })
    .eq("hacienda_category_id", origen)
    .select("id");

  // No tumbamos la fusión si esto falla — las transacciones ya quedaron
  // bien, que es lo esencial; el aprendizaje futuro es un extra.
  const patronError_msg = patronError?.message ?? null;

  // 3) Borrar la categoría origen — solo si es personal de este usuario
  // (nunca el catálogo global) y solo después de haber movido todo lo de
  // arriba. Si por alguna razón sigue teniendo transacciones de OTRO
  // recurso que no controlamos aquí, el DELETE fallaría por la FK
  // (fk_transactions_hacienda_category) y simplemente no se borra — no es
  // un error fatal para el usuario, la fusión ya funcionó.
  let categoriaEliminada = false;
  let avisoEliminar: string | null = null;
  if (catOrigen.owner_id === user.id) {
    const { error: delError } = await supabase.from("hacienda_categories").delete().eq("id", origen).eq("owner_id", user.id);
    if (delError) {
      avisoEliminar = `La fusión funcionó, pero no se pudo borrar "${catOrigen.nombre}": ${delError.message}`;
    } else {
      categoriaEliminada = true;
    }
  } else {
    avisoEliminar = `"${catOrigen.nombre}" es parte del catálogo compartido — se vació lo tuyo, pero la categoría sigue existiendo para los demás.`;
  }

  return NextResponse.json({
    ok: true,
    transaccionesReasignadas: transaccionesMovidas?.length ?? 0,
    patronesReasignados: patronesMovidos?.length ?? 0,
    categoriaEliminada,
    aviso: avisoEliminar,
    aprendizajeError: patronError_msg,
  });
}
