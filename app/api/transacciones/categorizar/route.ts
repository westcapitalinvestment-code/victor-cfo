import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aplica una categoría a una transacción (a mano, desde la pantalla de
// Gastos, o desde el tool de VICTOR). Hace dos cosas: (1) actualiza la
// transacción misma, que es lo que el usuario ve; (2) llama
// record_user_correction (ya existe en 0001_schema_completo.sql), que
// entrena el motor de patrones para la próxima vez que llegue un gasto
// parecido — record_user_correction por sí sola NO toca la transacción,
// solo el patrón/aprendizaje, por eso hacen falta los dos pasos.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { transactionId, haciendaCategoryId, isPersonal } = await req.json();

  if (!transactionId || !haciendaCategoryId) {
    return NextResponse.json({ error: "Falta transactionId o haciendaCategoryId." }, { status: 400 });
  }

  const { data: transaccion, error: fetchError } = await supabase
    .from("transactions")
    .select("id, owner_id, entity_id, description_raw, matched_pattern_id")
    .eq("id", transactionId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !transaccion) {
    return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      hacienda_category_id: haciendaCategoryId,
      is_personal: isPersonal ?? transaccion.entity_id === null,
      category_overridden_by_user: true,
    })
    .eq("id", transactionId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: rpcError } = await supabase.rpc("record_user_correction", {
    p_transaction_id: transaccion.id,
    p_entity_id: transaccion.entity_id,
    p_raw_description: transaccion.description_raw,
    p_confirmed_hacienda_category_id: haciendaCategoryId,
    p_matched_pattern_id: transaccion.matched_pattern_id,
    p_actor_role: "owner",
  });

  // No tumbamos la respuesta si falla el aprendizaje — la transacción ya
  // quedó categorizada, que es lo que el usuario pidió. El aprendizaje es
  // un extra, no lo esencial.
  return NextResponse.json({ ok: true, aprendizajeError: rpcError?.message ?? null });
}
