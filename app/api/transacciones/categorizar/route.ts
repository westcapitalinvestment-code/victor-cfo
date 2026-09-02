import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { direccionCategoriaValida } from "@/lib/direccion-categoria";

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

  // Sin .eq("owner_id", user.id) a propósito (2 sept 2026) — un
  // admin/secretaria categorizando gastos del negocio tiene su PROPIO
  // user.id, distinto al owner_id del dueño (ver lib/owner-efectivo.ts).
  // RLS (transactions_owner_write + transactions_admin_categorize,
  // migración 0055) ya decide quién puede leer/actualizar cada fila —
  // filtrar aquí por user.id solo rompería el acceso legítimo del admin.
  const [{ data: transaccion, error: fetchError }, { data: categoria, error: catError }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, owner_id, entity_id, description_raw, matched_pattern_id, tipo_flujo")
      .eq("id", transactionId)
      .single(),
    supabase.from("hacienda_categories").select("nombre").eq("id", haciendaCategoryId).single(),
  ]);

  if (fetchError || !transaccion) {
    return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });
  }
  if (catError || !categoria) {
    return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
  }

  // Mismo guardarraíl de dirección que ya protege al chat de VICTOR y al
  // motor automático (lib/direccion-categoria.ts) — sin esto, el dropdown
  // manual era la única de las 3 vías donde una transferencia SALIENTE
  // podía terminar en una categoría como "Ingresos y depósitos" sin ningún
  // aviso, tanto por error del usuario como heredado de una categorización
  // automática vieja.
  if (!direccionCategoriaValida(categoria.nombre, transaccion.tipo_flujo)) {
    return NextResponse.json(
      {
        error: `"${categoria.nombre}" no cuadra con la dirección real de esta transacción (${transaccion.tipo_flujo === "gasto" ? "salió dinero" : transaccion.tipo_flujo === "ingreso" ? "entró dinero" : "transferencia"}). Elige la categoría del lado correcto.`,
      },
      { status: 400 }
    );
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

  // El actor puede ser el dueño o un admin/secretaria categorizando en su
  // nombre — actor_role queda en el audit_log para que quede claro quién
  // hizo el cambio (transaccion.owner_id === user.id ⇒ es el dueño mismo).
  const { error: rpcError } = await supabase.rpc("record_user_correction", {
    p_transaction_id: transaccion.id,
    p_entity_id: transaccion.entity_id,
    p_raw_description: transaccion.description_raw,
    p_confirmed_hacienda_category_id: haciendaCategoryId,
    p_matched_pattern_id: transaccion.matched_pattern_id,
    p_actor_role: transaccion.owner_id === user.id ? "owner" : "admin",
  });

  // No tumbamos la respuesta si falla el aprendizaje — la transacción ya
  // quedó categorizada, que es lo que el usuario pidió. El aprendizaje es
  // un extra, no lo esencial.
  return NextResponse.json({ ok: true, aprendizajeError: rpcError?.message ?? null });
}
