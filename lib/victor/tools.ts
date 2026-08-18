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
      "Asigna (o corrige) la categoría de un gasto/transacción bancaria ya existente — úsalo cuando el " +
      "usuario diga cosas como 'esa compra en Uber es transporte' o 'lo de Amazon de ayer fue ropa', o cuando " +
      "tú mismo estés categorizando en lote después de revisar_gastos_sin_categorizar. Busca la transacción " +
      "por parte de su descripción (el nombre del comercio suele bastar) y la categoría por su nombre en " +
      "español — usa EXACTAMENTE los nombres que te dio revisar_gastos_sin_categorizar en 'Categorías " +
      "disponibles', nunca inventes un nombre parecido que no esté en esa lista. Si hay varias transacciones " +
      "con la misma descripción, usa el monto Y la fecha (si los tienes, por ejemplo porque salieron en la " +
      "lista de revisar_gastos_sin_categorizar) para distinguir cuál es — esto pasa seguido con gastos " +
      "recurrentes idénticos (mismo comercio, mismo monto, cada mes). Si aun con monto y fecha sigue habiendo " +
      "ambigüedad, no adivines — pregúntale cuál es.",
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
    name: "revisar_gastos_sin_categorizar",
    description:
      "Trae la lista real de transacciones bancarias del usuario que TODAVÍA no tienen categoría — la " +
      "'bandeja pendiente' de verdad, sacada directo de su banco conectado por Plaid. NO le pidas al usuario " +
      "que te copie y pegue lo que ve en pantalla — usa esta herramienta. Úsala cuando te pida revisar, " +
      "categorizar, o clasificar sus gastos, o pregunte qué le falta categorizar. Después de ver la lista, " +
      "categoriza tú mismo (con categorizar_transaccion, una llamada por transacción) las que reconozcas con " +
      "alta confianza por el nombre del comercio, sin preguntar. Solo pregúntale al usuario, agrupadas en un " +
      "mensaje, las que de verdad sean ambiguas.",
    input_schema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas transacciones traer como máximo. Si no se especifica, usa 40." },
      },
      required: [],
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
      if (!descripcion || !nombreCategoria) {
        return { ok: false, message: "Faltan datos (descripción de la transacción y nombre de categoría) para categorizar." };
      }
      const monto = Number.isFinite(Number(input.monto)) ? Number(input.monto) : null;
      const fecha = typeof input.fecha === "string" && input.fecha.trim() ? input.fecha.trim() : null;

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
      if (monto !== null) query = query.eq("amount", Math.abs(monto));
      if (fecha !== null) query = query.eq("fecha", fecha);

      const { data: transacciones, error: findError } = await query;
      if (findError) return { ok: false, message: `No se pudo buscar la transacción: ${findError.message}` };
      if (!transacciones || transacciones.length === 0) {
        return { ok: false, message: `No encontré ninguna transacción parecida a "${descripcion}"${monto !== null ? ` por $${Math.abs(monto)}` : ""}${fecha !== null ? ` en ${fecha}` : ""}. Pregúntale al usuario el nombre exacto como aparece en su banco.` };
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

    case "revisar_gastos_sin_categorizar": {
      const limite = Number.isFinite(Number(input.limite)) && Number(input.limite) > 0
        ? Math.min(Number(input.limite), 100)
        : 40;

      const { data: pendientes, error } = await supabase
        .from("transactions")
        .select("id, description_raw, amount, fecha")
        .eq("owner_id", ownerId)
        .is("entity_id", null)
        .is("hacienda_category_id", null)
        .order("fecha", { ascending: false })
        .limit(limite);

      if (error) return { ok: false, message: `No se pudo traer las transacciones pendientes: ${error.message}` };
      if (!pendientes || pendientes.length === 0) {
        return {
          ok: true,
          message: "No hay transacciones sin categorizar en este momento — todo lo que ha llegado del banco ya tiene categoría.",
        };
      }

      const { data: categorias } = await supabase
        .from("hacienda_categories")
        .select("nombre")
        .eq("activo", true)
        .order("nombre");
      const listaCategorias = (categorias ?? []).map((c) => c.nombre).join(", ");

      const lista = pendientes
        .map((t) => `- "${t.description_raw}" · $${Math.abs(Number(t.amount))} · ${t.fecha}`)
        .join("\n");

      return {
        ok: true,
        message:
          `${pendientes.length} transacción(es) sin categorizar:\n${lista}\n\n` +
          `Categorías disponibles: ${listaCategorias}.\n` +
          `Categoriza ahora mismo (llamando a categorizar_transaccion, una vez por transacción) las que ` +
          `reconozcas con alta confianza por el nombre del comercio — no le preguntes al usuario esas. Para las ` +
          `que no estés seguro, agrúpalas en un solo mensaje y pregúntale.`,
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
