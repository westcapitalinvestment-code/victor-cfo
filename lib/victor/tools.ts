import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// Las "manos" de VICTOR — acciones reales que puede ejecutar dentro de la
// app, no solo hablar de ellas. Alcance Core únicamente por ahora (metas,
// documentos/alertas). Cuando Pro esté listo, se añaden más tools aquí
// (facturas, clientes) siguiendo el mismo patrón — no hay que tocar la
// ruta que las llama.
//
// Seguridad: cada ejecución usa el cliente de Supabase de la petición
// actual (el del usuario logueado, con su cookie de sesión), así que RLS
// aplica exactamente igual que si el usuario lo hiciera desde la UI —
// VICTOR nunca puede tocar filas de otro usuario, sin importar lo que el
// modelo "decida" hacer.

export const VICTOR_TOOLS: Anthropic.Tool[] = [
  {
    name: "crear_meta",
    description:
      "Crea una nueva meta de ahorro personal para el usuario (aparece en la card 'Metas' de su Inicio). " +
      "Úsalo cuando el usuario te diga que quiere ahorrar para algo concreto y te dé (o puedas confirmar con " +
      "él) un nombre y un monto objetivo.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre corto de la meta, ej. 'Fondo de emergencia' o 'Vacaciones diciembre'." },
        monto_objetivo: { type: "number", description: "Monto total que el usuario quiere ahorrar." },
        monto_actual: { type: "number", description: "Cuánto ya tiene ahorrado hacia esto, si lo menciona. Si no dice nada, usa 0." },
        fecha_objetivo: {
          type: "string",
          description: "Fecha límite en formato YYYY-MM-DD, solo si el usuario la menciona. Omite el campo si no aplica.",
        },
      },
      required: ["nombre", "monto_objetivo"],
    },
  },
  {
    name: "actualizar_progreso_meta",
    description:
      "Actualiza cuánto lleva ahorrado el usuario en una meta que YA existe (busca por nombre entre sus metas " +
      "activas). Úsalo cuando el usuario diga que abonó, ahorró, o quiere ajustar el monto de una meta que ya " +
      "tiene creada. El monto que des es el TOTAL acumulado, no el incremento — si el usuario dice 'le añadí " +
      "$50', suma tú mismo al monto actual que ya conoces por el contexto y manda el total.",
    input_schema: {
      type: "object",
      properties: {
        nombre_meta: { type: "string", description: "Nombre (o parte del nombre) de la meta a actualizar." },
        nuevo_monto_actual: { type: "number", description: "El nuevo monto TOTAL acumulado en la meta." },
      },
      required: ["nombre_meta", "nuevo_monto_actual"],
    },
  },
  {
    name: "editar_meta",
    description:
      "Edita el nombre y/o el monto objetivo de una meta que YA existe (busca por nombre entre sus metas " +
      "activas). Úsalo cuando el usuario quiera renombrar una meta o cambiar cuánto quiere ahorrar en total — " +
      "para actualizar solo lo AHORRADO hasta ahora usa mejor actualizar_progreso_meta.",
    input_schema: {
      type: "object",
      properties: {
        nombre_meta: { type: "string", description: "Nombre (o parte del nombre) de la meta a editar." },
        nuevo_nombre: { type: "string", description: "Nuevo nombre de la meta, solo si el usuario lo quiere cambiar." },
        nuevo_monto_objetivo: { type: "number", description: "Nuevo monto objetivo total, solo si el usuario lo quiere cambiar." },
      },
      required: ["nombre_meta"],
    },
  },
  {
    name: "eliminar_meta",
    description:
      "Elimina (borra) una meta existente del usuario. Úsalo cuando el usuario pida borrar, eliminar, quitar, " +
      "o cancelar una meta — por ejemplo si se creó duplicada o ya no aplica. Si hay más de una meta parecida " +
      "al nombre que dio, no elimines nada: pídele que aclare cuál, mencionando los nombres exactos.",
    input_schema: {
      type: "object",
      properties: {
        nombre_meta: { type: "string", description: "Nombre (o parte del nombre) de la meta a eliminar." },
      },
      required: ["nombre_meta"],
    },
  },
  {
    name: "crear_documento",
    description:
      "Guarda un documento con su fecha de vencimiento en la Bóveda del usuario — esto es lo que genera las " +
      "alertas (90/30/7 días antes de vencer) en su Inicio. Úsalo cuando el usuario mencione una licencia, " +
      "permiso, seguro, contrato, o cualquier cosa con fecha de vencimiento que quiera que le recuerdes.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del documento, ej. 'Licencia de conducir' o 'Póliza de auto'." },
        tipo: { type: "string", description: "Categoría breve: seguro, licencia, permiso, contrato, u otro." },
        fecha_vencimiento: { type: "string", description: "Fecha de vencimiento en formato YYYY-MM-DD, si el usuario la da." },
      },
      required: ["nombre"],
    },
  },
  {
    name: "categorizar_transaccion",
    description:
      "Asigna (o corrige) la categoría de UNA sola transacción bancaria ya existente — úsalo solo para " +
      "correcciones puntuales en la conversación, cuando el usuario diga cosas como 'esa compra en Uber es " +
      "transporte' o 'lo de Amazon de ayer fue ropa'. Si vas a categorizar VARIAS a la vez (por ejemplo " +
      "después de revisar_gastos_sin_categorizar), NO llames esta herramienta repetidamente — usa " +
      "categorizar_transacciones_lote una sola vez con todas juntas, es mucho más eficiente. Busca la " +
      "transacción por parte de su descripción (el nombre del comercio suele bastar) y la categoría por su " +
      "nombre en español — usa EXACTAMENTE los nombres que te dio revisar_gastos_sin_categorizar en " +
      "'Categorías disponibles', nunca inventes un nombre parecido que no esté en esa lista. Si hay varias " +
      "transacciones con la misma descripción, usa el monto Y la fecha (si los tienes) para distinguir cuál " +
      "es — esto pasa seguido con gastos recurrentes idénticos (mismo comercio, mismo monto, cada mes). Si " +
      "aun con monto y fecha sigue habiendo ambigüedad, no adivines — pregúntale cuál es.",
    input_schema: {
      type: "object",
      properties: {
        descripcion_transaccion: { type: "string", description: "Parte del nombre/descripción del comercio, tal como aparece en el gasto (ej. 'Uber', 'Amazon', 'Pueblo')." },
        monto: { type: "number", description: "Monto exacto de la transacción, si el usuario lo mencionó — ayuda a distinguir cuál transacción es cuando hay varias parecidas." },
        fecha: { type: "string", description: "Fecha exacta de la transacción en formato YYYY-MM-DD, si la tienes — imprescindible para distinguir gastos recurrentes idénticos (mismo comercio, mismo monto, distinta fecha)." },
        nombre_categoria: { type: "string", description: "Nombre de la categoría a asignar, en español — debe ser EXACTAMENTE uno de los nombres reales de la lista de categorías (ej. 'Transporte y gasolina', 'Supermercado', 'Restaurantes y comida rápida', 'Ropa y accesorios'), nunca uno inventado." },
      },
      required: ["descripcion_transaccion", "nombre_categoria"],
    },
  },
  {
    name: "categorizar_transacciones_lote",
    description:
      "Igual que categorizar_transaccion, pero para VARIAS transacciones en una sola llamada — úsala siempre " +
      "que estés categorizando en lote después de revisar_gastos_sin_categorizar, con TODAS las que reconozcas " +
      "con alta confianza en una sola llamada a esta herramienta, nunca una por una con categorizar_transaccion. " +
      "Cada elemento de 'items' sigue las mismas reglas que categorizar_transaccion (descripción + categoría " +
      "exacta de la lista, monto y fecha cuando los tengas para distinguir gastos recurrentes idénticos). El " +
      "resultado te dice cuáles se categorizaron y cuáles no (con la razón) — las que fallaron por ambigüedad " +
      "pregúntaselas al usuario agrupadas en un mensaje, no las reintentes adivinando.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Lista de transacciones a categorizar en un solo lote.",
          items: {
            type: "object",
            properties: {
              descripcion_transaccion: { type: "string", description: "Parte del nombre/descripción del comercio, tal como aparece en el gasto." },
              monto: { type: "number", description: "Monto exacto de la transacción, si lo tienes." },
              fecha: { type: "string", description: "Fecha exacta en formato YYYY-MM-DD, si la tienes." },
              nombre_categoria: { type: "string", description: "Nombre EXACTO de la categoría a asignar, de la lista real de categorías disponibles." },
            },
            required: ["descripcion_transaccion", "nombre_categoria"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "revisar_gastos_sin_categorizar",
    description:
      "Trae la lista real de transacciones bancarias del usuario que TODAVÍA no tienen categoría — la " +
      "'bandeja pendiente' de verdad, sacada directo de su banco conectado por Plaid. NO le pidas al usuario " +
      "que te copie y pegue lo que ve en pantalla — usa esta herramienta. Úsala cuando te pida revisar, " +
      "categorizar, o clasificar sus gastos, o pregunte qué le falta categorizar. Después de ver la lista, " +
      "categoriza tú mismo, en UNA sola llamada a categorizar_transacciones_lote con todas juntas, las que " +
      "reconozcas con alta confianza por el nombre del comercio, sin preguntar — nunca uses " +
      "categorizar_transaccion una por una para esto. Solo pregúntale al usuario, agrupadas en un mensaje, " +
      "las que de verdad sean ambiguas.",
    input_schema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas transacciones traer como máximo. Si no se especifica, usa 40." },
      },
      required: [],
    },
  },
  {
    name: "crear_categoria_personal",
    description:
      "Crea una categoría de gasto NUEVA, personal del usuario (no la ve nadie más, no toca el catálogo " +
      "global ni las líneas de Anejo M/Schedule C del reporte al contable — es solo para que este usuario " +
      "organice y pregunte sus propios gastos). Úsala SOLO cuando ya revisaste las categorías existentes (por " +
      "ejemplo con revisar_gastos_sin_categorizar o categorizar_transaccion) y de verdad ninguna aplica al " +
      "gasto que el usuario está describiendo. IMPORTANTE: nunca la llames sin antes preguntarle al usuario y " +
      "obtener su confirmación explícita — algo como '¿quieres que cree una categoría nueva llamada " +
      "\"Mascotas - veterinario\"?' — nunca la crees en silencio ni asumas que quiere una nueva sin que te lo diga.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre de la categoría nueva, en español, corto y claro (ej. 'Mascotas - veterinario', 'Mesada de los nenes')." },
      },
      required: ["nombre"],
    },
  },
  {
    name: "reporte_gasto_por_categoria",
    description:
      "Suma cuánto ha gastado el usuario en UNA categoría específica (global o personal suya) en un rango de " +
      "fechas — úsala para contestar preguntas como '¿cuánto estoy gastando en restaurantes?' o '¿cuánto gasté " +
      "en gasolina este mes?'. Si el usuario no menciona un período, se calcula el mes en curso por default. Si " +
      "menciona 'este año', 'el trimestre', 'todo', etc., calcula tú mismo las fechas desde/hasta con la fecha " +
      "real de hoy que ya tienes en tu contexto y mándalas. Si la categoría que pide no existe todavía (ni " +
      "global ni personal suya), dile que no tiene gastos en eso, y si quiere, ofrécele crearla con " +
      "crear_categoria_personal para el futuro — no la crees tú solo para esta pregunta.",
    input_schema: {
      type: "object",
      properties: {
        nombre_categoria: { type: "string", description: "Nombre (o parte del nombre) de la categoría a sumar, ej. 'restaurantes', 'gasolina'." },
        desde: { type: "string", description: "Fecha de inicio del rango, YYYY-MM-DD. Si no se da, usa el día 1 del mes en curso." },
        hasta: { type: "string", description: "Fecha de fin del rango, YYYY-MM-DD. Si no se da, usa la fecha de hoy." },
      },
      required: ["nombre_categoria"],
    },
  },
  {
    name: "guardar_perfil_onboarding",
    description:
      "Guarda las respuestas del onboarding conversacional de la Capa 2 (apodo, género, edad, situación, " +
      "hijos) una vez que terminaste de preguntarlas con naturalidad, una a la vez. Llama esta herramienta " +
      "UNA sola vez al final de esa conversación, con los campos que el usuario sí quiso contestar — nunca " +
      "insistas en los que evitó, y si evitó todos igual puedes llamarla sin esos campos para marcar que ya " +
      "pasaste por el onboarding y no se lo vuelvas a preguntar la próxima vez.",
    input_schema: {
      type: "object",
      properties: {
        apodo: { type: "string", description: "Cómo prefiere que lo llames, si es distinto a su nombre oficial." },
        genero: { type: "string", description: "Género del usuario, en sus propias palabras." },
        edad: { type: "number", description: "Edad del usuario." },
        situacion: { type: "string", description: "Soltero/a, casado/a, con pareja, etc., en sus propias palabras." },
        tiene_hijos: { type: "boolean", description: "Si el usuario tiene hijos." },
        hijos_detalle: { type: "string", description: "Cuántos hijos y edades, si lo compartió." },
      },
      required: [],
    },
  },
];

type ToolResult = { ok: boolean; message: string };

// Lógica real de "buscar la transacción + asignarle categoría", compartida
// entre categorizar_transaccion (una sola, para correcciones puntuales del
// usuario en el chat) y categorizar_transacciones_lote (varias en una sola
// llamada — la usa VICTOR después de revisar_gastos_sin_categorizar para no
// tener que hacer una llamada al API por cada transacción, que era el mayor
// generador de costo: N transacciones pendientes = N round-trips completos,
// cada uno reenviando toda la conversación acumulada hasta ese punto).
async function categorizarUna(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  item: { descripcion: string; monto: number | null; fecha: string | null; nombreCategoria: string }
): Promise<ToolResult> {
  const { descripcion, monto, fecha, nombreCategoria } = item;
  if (!descripcion || !nombreCategoria) {
    return { ok: false, message: "Faltan datos (descripción de la transacción y nombre de categoría) para categorizar." };
  }

  const { data: categorias, error: catError } = await supabase
    .from("hacienda_categories")
    .select("id, nombre")
    .eq("activo", true)
    .ilike("nombre", `%${nombreCategoria}%`);

  if (catError) return { ok: false, message: `No se pudo buscar la categoría: ${catError.message}` };
  if (!categorias || categorias.length === 0) {
    return { ok: false, message: `No encontré ninguna categoría parecida a "${nombreCategoria}". Pregúntale al usuario cuál de las categorías existentes aplica.` };
  }
  if (categorias.length > 1) {
    return {
      ok: false,
      message: `Hay varias categorías parecidas a "${nombreCategoria}" (${categorias.map((c) => c.nombre).join(", ")}). Pídele al usuario que aclare cuál.`,
    };
  }

  let query = supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, entity_id, matched_pattern_id")
    .eq("owner_id", ownerId)
    .ilike("description_raw", `%${descripcion}%`)
    .order("fecha", { ascending: false })
    .limit(5);
  // revisar_gastos_sin_categorizar SIEMPRE manda el monto en positivo
  // (Math.abs), aunque en la base de datos un ingreso/depósito se
  // guarda en negativo (convención: positivo = gasto que sale, negativo
  // = dinero que entra). Si comparábamos solo contra el positivo, una
  // transacción de ingreso real (ej. INTRST PYMNT) nunca hacía match —
  // "no encontrada" aunque la herramienta la acabara de listar como
  // pendiente. Aceptamos cualquiera de los dos signos.
  if (monto !== null) query = query.or(`amount.eq.${Math.abs(monto)},amount.eq.${-Math.abs(monto)}`);
  if (fecha !== null) query = query.eq("fecha", fecha);

  const { data: transacciones, error: findError } = await query;
  if (findError) return { ok: false, message: `No se pudo buscar la transacción: ${findError.message}` };
  if (!transacciones || transacciones.length === 0) {
    // Antes de rendirse, busca solo por descripción (sin monto/fecha)
    // para que VICTOR vea qué hay de verdad y pueda diagnosticar en vez
    // de quedarse en un "no encontrada" sin más contexto.
    const { data: cercanas } = await supabase
      .from("transactions")
      .select("description_raw, amount, fecha")
      .eq("owner_id", ownerId)
      .ilike("description_raw", `%${descripcion}%`)
      .order("fecha", { ascending: false })
      .limit(5);
    const pista = cercanas && cercanas.length > 0
      ? ` Lo más parecido que sí existe: ${cercanas.map((c) => `"${c.description_raw}" $${c.amount} ${c.fecha}`).join(", ")}.`
      : "";
    return { ok: false, message: `No encontré ninguna transacción parecida a "${descripcion}"${monto !== null ? ` por $${Math.abs(monto)}` : ""}${fecha !== null ? ` en ${fecha}` : ""}.${pista} Pregúntale al usuario el nombre exacto como aparece en su banco.` };
  }
  if (transacciones.length > 1) {
    // Pasa seguido con gastos recurrentes idénticos (mismo comercio,
    // mismo monto, cada mes/semana) — el monto solo no basta para
    // distinguirlas. Si todavía no se mandó fecha, pídela explícitamente
    // en vez de solo repetir "aclara cuál es".
    return {
      ok: false,
      message: fecha === null
        ? `Hay ${transacciones.length} transacciones idénticas de "${descripcion}"` +
          `${monto !== null ? ` por $${Math.abs(monto)}` : ""} en fechas distintas ` +
          `(${transacciones.map((t) => t.fecha).join(", ")}). Vuelve a llamar esta herramienta mandando el ` +
          `campo "fecha" exacto de cuál de esas quieres categorizar.`
        : `Hay ${transacciones.length} transacciones que coinciden con "${descripcion}"` +
          `${monto !== null ? ` por $${Math.abs(monto)}` : ""} en ${fecha}. Pídele al usuario más detalle para distinguirlas.`,
    };
  }

  const transaccion = transacciones[0];
  const categoria = categorias[0];

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      hacienda_category_id: categoria.id,
      is_personal: transaccion.entity_id === null,
      category_overridden_by_user: true,
    })
    .eq("id", transaccion.id);

  if (updateError) return { ok: false, message: `No se pudo categorizar la transacción: ${updateError.message}` };

  await supabase.rpc("record_user_correction", {
    p_transaction_id: transaccion.id,
    p_entity_id: transaccion.entity_id,
    p_raw_description: transaccion.description_raw,
    p_confirmed_hacienda_category_id: categoria.id,
    p_matched_pattern_id: transaccion.matched_pattern_id,
    p_actor_role: "owner",
  });

  return { ok: true, message: `"${transaccion.description_raw}" ($${Math.abs(Number(transaccion.amount))}) categorizado como "${categoria.nombre}".` };
}

export async function executeVictorTool(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case "crear_meta": {
      const nombre = String(input.nombre ?? "").trim();
      const montoObjetivo = Number(input.monto_objetivo);
      if (!nombre || !Number.isFinite(montoObjetivo) || montoObjetivo <= 0) {
        return { ok: false, message: "Faltan datos válidos (nombre y monto objetivo) para crear la meta." };
      }
      const montoActual = Number.isFinite(Number(input.monto_actual)) ? Number(input.monto_actual) : 0;
      const fechaObjetivo = typeof input.fecha_objetivo === "string" ? input.fecha_objetivo : null;

      const { error } = await supabase.from("goals").insert({
        owner_id: ownerId,
        name: nombre,
        target_amount: montoObjetivo,
        current_amount: montoActual,
        target_date: fechaObjetivo,
      });

      if (error) return { ok: false, message: `No se pudo crear la meta: ${error.message}` };
      return { ok: true, message: `Meta "${nombre}" creada con objetivo de $${montoObjetivo}.` };
    }

    case "actualizar_progreso_meta": {
      const nombreMeta = String(input.nombre_meta ?? "").trim();
      const nuevoMonto = Number(input.nuevo_monto_actual);
      if (!nombreMeta || !Number.isFinite(nuevoMonto)) {
        return { ok: false, message: "Faltan datos válidos para actualizar la meta." };
      }

      const { data: matches, error: findError } = await supabase
        .from("goals")
        .select("id, name")
        .eq("owner_id", ownerId)
        .eq("status", "activa")
        .ilike("name", `%${nombreMeta}%`);

      if (findError) return { ok: false, message: `No se pudo buscar la meta: ${findError.message}` };
      if (!matches || matches.length === 0) {
        return { ok: false, message: `No encontré ninguna meta activa parecida a "${nombreMeta}". Pregúntale al usuario el nombre exacto.` };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          message: `Hay varias metas parecidas a "${nombreMeta}" (${matches.map((m) => m.name).join(", ")}). Pídele al usuario que aclare cuál.`,
        };
      }

      const { error: updateError } = await supabase
        .from("goals")
        .update({ current_amount: nuevoMonto, updated_at: new Date().toISOString() })
        .eq("id", matches[0].id);

      if (updateError) return { ok: false, message: `No se pudo actualizar la meta: ${updateError.message}` };
      return { ok: true, message: `Meta "${matches[0].name}" actualizada a $${nuevoMonto} acumulado.` };
    }

    case "editar_meta": {
      const nombreMeta = String(input.nombre_meta ?? "").trim();
      if (!nombreMeta) return { ok: false, message: "Falta el nombre de la meta a editar." };

      const nuevoNombre = typeof input.nuevo_nombre === "string" ? input.nuevo_nombre.trim() : null;
      const nuevoMontoObjetivo = Number.isFinite(Number(input.nuevo_monto_objetivo))
        ? Number(input.nuevo_monto_objetivo)
        : null;

      if (!nuevoNombre && nuevoMontoObjetivo === null) {
        return { ok: false, message: "No hay ningún cambio que hacer (falta nuevo nombre o nuevo monto objetivo)." };
      }

      const { data: matches, error: findError } = await supabase
        .from("goals")
        .select("id, name")
        .eq("owner_id", ownerId)
        .eq("status", "activa")
        .ilike("name", `%${nombreMeta}%`);

      if (findError) return { ok: false, message: `No se pudo buscar la meta: ${findError.message}` };
      if (!matches || matches.length === 0) {
        return { ok: false, message: `No encontré ninguna meta activa parecida a "${nombreMeta}". Pregúntale al usuario el nombre exacto.` };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          message: `Hay varias metas parecidas a "${nombreMeta}" (${matches.map((m) => m.name).join(", ")}). Pídele al usuario que aclare cuál.`,
        };
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (nuevoNombre) patch.name = nuevoNombre;
      if (nuevoMontoObjetivo !== null) patch.target_amount = nuevoMontoObjetivo;

      const { error: updateError } = await supabase.from("goals").update(patch).eq("id", matches[0].id);
      if (updateError) return { ok: false, message: `No se pudo editar la meta: ${updateError.message}` };
      return { ok: true, message: `Meta "${matches[0].name}" actualizada${nuevoNombre ? ` a "${nuevoNombre}"` : ""}${nuevoMontoObjetivo !== null ? `, objetivo $${nuevoMontoObjetivo}` : ""}.` };
    }

    case "eliminar_meta": {
      const nombreMeta = String(input.nombre_meta ?? "").trim();
      if (!nombreMeta) return { ok: false, message: "Falta el nombre de la meta a eliminar." };

      const { data: matches, error: findError } = await supabase
        .from("goals")
        .select("id, name")
        .eq("owner_id", ownerId)
        .eq("status", "activa")
        .ilike("name", `%${nombreMeta}%`);

      if (findError) return { ok: false, message: `No se pudo buscar la meta: ${findError.message}` };
      if (!matches || matches.length === 0) {
        return { ok: false, message: `No encontré ninguna meta activa parecida a "${nombreMeta}". Pregúntale al usuario el nombre exacto.` };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          message: `Hay varias metas parecidas a "${nombreMeta}" (${matches.map((m) => m.name).join(", ")}). Pídele al usuario que aclare cuál — por ejemplo, si son duplicadas, confirma que quiere borrar solo una.`,
        };
      }

      const { error: deleteError } = await supabase.from("goals").delete().eq("id", matches[0].id);
      if (deleteError) return { ok: false, message: `No se pudo eliminar la meta: ${deleteError.message}` };
      return { ok: true, message: `Meta "${matches[0].name}" eliminada.` };
    }

    case "crear_documento": {
      const nombre = String(input.nombre ?? "").trim();
      if (!nombre) return { ok: false, message: "Falta el nombre del documento." };
      const tipo = typeof input.tipo === "string" ? input.tipo : "otro";
      const fechaVencimiento = typeof input.fecha_vencimiento === "string" ? input.fecha_vencimiento : null;

      const { error } = await supabase.from("documents").insert({
        owner_id: ownerId,
        nombre,
        tipo,
        fecha_vencimiento: fechaVencimiento,
      });

      if (error) return { ok: false, message: `No se pudo guardar el documento: ${error.message}` };
      return { ok: true, message: `Documento "${nombre}" guardado en la Bóveda${fechaVencimiento ? `, vence ${fechaVencimiento}` : ""}.` };
    }

    case "categorizar_transaccion": {
      const descripcion = String(input.descripcion_transaccion ?? "").trim();
      const nombreCategoria = String(input.nombre_categoria ?? "").trim();
      const monto = Number.isFinite(Number(input.monto)) ? Number(input.monto) : null;
      const fecha = typeof input.fecha === "string" && input.fecha.trim() ? input.fecha.trim() : null;
      return categorizarUna(supabase, ownerId, { descripcion, monto, fecha, nombreCategoria });
    }

    case "categorizar_transacciones_lote": {
      // Batch real: N transacciones en UNA sola llamada al API, en vez de
      // una llamada por transacción. Esto es lo que de verdad baja el
      // costo — antes, categorizar 20 gastos pendientes eran 20 round-trips
      // a Claude, cada uno reenviando el system prompt (cacheado, pero el
      // 10% del costo igual se paga cada vez) MÁS toda la conversación
      // acumulada hasta ese punto (esa parte nunca se cachea). Con el lote,
      // es 1 sola llamada sin importar cuántas transacciones traiga.
      const itemsRaw = Array.isArray(input.items) ? input.items : [];
      if (itemsRaw.length === 0) {
        return { ok: false, message: "No se recibió ninguna transacción en 'items' para categorizar en lote." };
      }
      // Tope defensivo — evita que una lista descontrolada (o un límite mal
      // pasado a revisar_gastos_sin_categorizar) genere 100+ updates/RPCs
      // seguidos en una sola llamada de tool.
      const LIMITE_LOTE = 60;
      const items = itemsRaw.slice(0, LIMITE_LOTE) as Array<Record<string, unknown>>;

      const resultados: { descripcion: string; ok: boolean; message: string }[] = [];
      for (const raw of items) {
        const descripcion = String(raw.descripcion_transaccion ?? "").trim();
        const nombreCategoria = String(raw.nombre_categoria ?? "").trim();
        const monto = Number.isFinite(Number(raw.monto)) ? Number(raw.monto) : null;
        const fecha = typeof raw.fecha === "string" && raw.fecha.trim() ? raw.fecha.trim() : null;
        // Secuencial, no Promise.all — cada una hace update + RPC de
        // aprendizaje (record_user_correction), y el volumen de un usuario
        // Core (decenas, no miles, por lote) hace innecesario el riesgo de
        // mandar todo en paralelo contra Supabase.
        const resultado = await categorizarUna(supabase, ownerId, { descripcion, monto, fecha, nombreCategoria });
        resultados.push({ descripcion: descripcion || "(sin descripción)", ok: resultado.ok, message: resultado.message });
      }

      const exitosas = resultados.filter((r) => r.ok);
      const fallidas = resultados.filter((r) => !r.ok);
      const resumenExitosas = exitosas.length > 0
        ? `Categorizadas (${exitosas.length}): ${exitosas.map((r) => r.descripcion).join(", ")}.`
        : "";
      const resumenFallidas = fallidas.length > 0
        ? `\n\nNo se pudieron categorizar (${fallidas.length}) — resuélvelas una por una o pregúntale al usuario:\n` +
          fallidas.map((r) => `- "${r.descripcion}": ${r.message}`).join("\n")
        : "";
      const nota = itemsRaw.length > LIMITE_LOTE
        ? `\n\n(Se procesaron solo las primeras ${LIMITE_LOTE} de ${itemsRaw.length} — vuelve a llamar esta herramienta con el resto.)`
        : "";

      return {
        ok: exitosas.length > 0,
        message: `${resumenExitosas}${resumenFallidas}${nota}`.trim() || "No se pudo categorizar ninguna del lote.",
      };
    }

    case "revisar_gastos_sin_categorizar": {
      const limite = Number.isFinite(Number(input.limite)) && Number(input.limite) > 0
        ? Math.min(Number(input.limite), 100)
        : 40;

      // Antes solo se traía este lote (hasta `limite`, tope 100) y el
      // mensaje reportaba nada más `pendientes.length` — si había 142 sin
      // categorizar y venían con el default de 40, VICTOR veía "40 sin
      // categorizar", categorizaba esas, y como el mensaje nunca decía que
      // había 102 más, terminaba diciéndole al usuario "ya está todo" sin
      // serlo. Ahora se pide también el TOTAL real (count exact, sin traer
      // las filas) con el mismo filtro, para que VICTOR sepa siempre cuánto
      // falta de verdad y nunca declare terminado algo que no lo está.
      const { count: totalPendientes, error: countError } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .is("entity_id", null)
        .is("hacienda_category_id", null);

      if (countError) return { ok: false, message: `No se pudo contar las transacciones pendientes: ${countError.message}` };

      if (!totalPendientes || totalPendientes === 0) {
        return {
          ok: true,
          message: "No hay transacciones sin categorizar en este momento — todo lo que ha llegado del banco ya tiene categoría.",
        };
      }

      const { data: pendientes, error } = await supabase
        .from("transactions")
        .select("id, description_raw, amount, fecha")
        .eq("owner_id", ownerId)
        .is("entity_id", null)
        .is("hacienda_category_id", null)
        .order("fecha", { ascending: false })
        .limit(limite);

      if (error) return { ok: false, message: `No se pudo traer las transacciones pendientes: ${error.message}` };

      const { data: categorias } = await supabase
        .from("hacienda_categories")
        .select("nombre")
        .eq("activo", true)
        .order("nombre");
      const listaCategorias = (categorias ?? []).map((c) => c.nombre).join(", ");

      const lista = (pendientes ?? [])
        .map((t) => `- "${t.description_raw}" · $${Math.abs(Number(t.amount))} · ${t.fecha}`)
        .join("\n");

      const quedanFuera = totalPendientes - (pendientes?.length ?? 0);
      const avisoTotal =
        quedanFuera > 0
          ? `\n\nOJO: en total hay ${totalPendientes} transacciones sin categorizar — esta lista trae solo las ` +
            `${pendientes?.length ?? 0} más recientes. Después de categorizar estas, vuelve a llamar ` +
            `revisar_gastos_sin_categorizar para traer las ${quedanFuera} que quedan. NUNCA le digas al usuario ` +
            `"ya está todo" o "ya no queda nada" mientras el total siga siendo mayor que cero — si no te da ` +
            `tiempo de terminarlas todas en este turno, dile honestamente cuántas categorizaste y cuántas ` +
            `quedan pendientes (el número real, no una aproximación).`
          : "";

      return {
        ok: true,
        message:
          `${pendientes?.length ?? 0} transacción(es) sin categorizar (de ${totalPendientes} en total):\n${lista}\n\n` +
          `Categorías disponibles: ${listaCategorias}.\n` +
          `Categoriza ahora mismo, en UNA sola llamada a categorizar_transacciones_lote con todas juntas (NO ` +
          `una por una con categorizar_transaccion), las que reconozcas con alta confianza por el nombre del ` +
          `comercio — no le preguntes al usuario esas. Para las que no estés seguro, agrúpalas en un solo ` +
          `mensaje y pregúntale.${avisoTotal}`,
      };
    }

    case "crear_categoria_personal": {
      const nombre = String(input.nombre ?? "").trim();
      if (!nombre) return { ok: false, message: "Falta el nombre de la categoría a crear." };

      // Evita duplicados — RLS ya limita esta lectura al catálogo global +
      // las categorías personales de este mismo usuario, así que si algo
      // parecido aparece aquí, es de verdad relevante para él.
      const { data: existentes, error: buscarError } = await supabase
        .from("hacienda_categories")
        .select("id, nombre")
        .eq("activo", true)
        .ilike("nombre", `%${nombre}%`);

      if (buscarError) return { ok: false, message: `No se pudo verificar categorías existentes: ${buscarError.message}` };
      if (existentes && existentes.length > 0) {
        return {
          ok: false,
          message: `Ya existe una categoría parecida: "${existentes.map((c) => c.nombre).join('", "')}". Usa esa en vez de crear una nueva, a menos que el usuario confirme que de verdad quiere una distinta.`,
        };
      }

      const { data: nueva, error } = await supabase
        .from("hacienda_categories")
        .insert({ nombre, owner_id: ownerId, activo: true })
        .select("id, nombre")
        .single();

      if (error) return { ok: false, message: `No se pudo crear la categoría: ${error.message}` };
      return { ok: true, message: `Categoría personal "${nueva.nombre}" creada — ya la puedes usar con categorizar_transaccion.` };
    }

    case "reporte_gasto_por_categoria": {
      const nombreCategoria = String(input.nombre_categoria ?? "").trim();
      if (!nombreCategoria) return { ok: false, message: "Falta el nombre de la categoría para el reporte." };

      const { data: categorias, error: catError } = await supabase
        .from("hacienda_categories")
        .select("id, nombre")
        .eq("activo", true)
        .ilike("nombre", `%${nombreCategoria}%`);

      if (catError) return { ok: false, message: `No se pudo buscar la categoría: ${catError.message}` };
      if (!categorias || categorias.length === 0) {
        return {
          ok: true,
          message: `No existe ninguna categoría (global ni personal) parecida a "${nombreCategoria}", así que no hay gastos que reportar en ella. Si el usuario la usa seguido, ofrécele crearla con crear_categoria_personal para el futuro.`,
        };
      }
      if (categorias.length > 1) {
        return {
          ok: false,
          message: `Hay varias categorías parecidas a "${nombreCategoria}" (${categorias.map((c) => c.nombre).join(", ")}). Pídele al usuario que aclare cuál.`,
        };
      }

      const categoria = categorias[0];
      const hoy = new Date();
      const desde =
        typeof input.desde === "string" && input.desde.trim()
          ? input.desde.trim()
          : new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
      const hasta =
        typeof input.hasta === "string" && input.hasta.trim() ? input.hasta.trim() : hoy.toISOString().slice(0, 10);

      const { data: transacciones, error: txError } = await supabase
        .from("transactions")
        .select("amount, fecha, description_raw, tipo_flujo")
        .eq("owner_id", ownerId)
        .is("entity_id", null)
        .eq("hacienda_category_id", categoria.id)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false });

      if (txError) return { ok: false, message: `No se pudo calcular el reporte: ${txError.message}` };

      // Solo gastos reales (tipo_flujo === "gasto") — un ingreso/depósito o
      // una transferencia interna (ej. pago de tarjeta) mal categorizados en
      // esta categoría no deben inflar el total de gasto. Antes esto miraba
      // solo el signo de amount, que es justo el bug que mezclaba ingresos
      // en el reporte de gastos.
      const gastos = (transacciones ?? []).filter((t) => t.tipo_flujo === "gasto");
      const total = gastos.reduce((sum, t) => sum + Number(t.amount), 0);

      if (gastos.length === 0) {
        return { ok: true, message: `No hay gastos en la categoría "${categoria.nombre}" entre ${desde} y ${hasta}.` };
      }

      const detalle = gastos
        .slice(0, 10)
        .map((t) => `- ${t.fecha} · ${t.description_raw} · $${Number(t.amount).toFixed(2)}`)
        .join("\n");
      const nota = gastos.length > 10 ? `\n(mostrando las 10 más recientes de ${gastos.length} en total)` : "";

      return {
        ok: true,
        message:
          `Gasto total en "${categoria.nombre}" entre ${desde} y ${hasta}: $${total.toFixed(2)} ` +
          `(${gastos.length} transacción${gastos.length > 1 ? "es" : ""}).\n${detalle}${nota}`,
      };
    }

    case "guardar_perfil_onboarding": {
      // Se llama UNA vez, al terminar de recorrer las preguntas de la
      // Capa 2 (nombre/apodo ya vive en users.full_name vía el formulario
      // de onboarding — aquí solo va lo adicional). Cualquier campo que el
      // usuario no quiso contestar simplemente no se manda.
      const patch: Record<string, unknown> = { perfil_completo: true, updated_at: new Date().toISOString() };
      if (typeof input.apodo === "string" && input.apodo.trim()) patch.apodo = input.apodo.trim();
      if (typeof input.genero === "string" && input.genero.trim()) patch.genero = input.genero.trim();
      if (Number.isFinite(Number(input.edad))) patch.edad = Number(input.edad);
      if (typeof input.situacion === "string" && input.situacion.trim()) patch.situacion = input.situacion.trim();
      if (typeof input.tiene_hijos === "boolean") patch.tiene_hijos = input.tiene_hijos;
      if (typeof input.hijos_detalle === "string" && input.hijos_detalle.trim()) patch.hijos_detalle = input.hijos_detalle.trim();

      const { error } = await supabase.from("user_profiles").update(patch).eq("id", ownerId);
      if (error) return { ok: false, message: `No se pudo guardar el perfil: ${error.message}` };
      return { ok: true, message: "Perfil de onboarding guardado." };
    }

    default:
      return { ok: false, message: `Herramienta desconocida: ${toolName}.` };
  }
}
