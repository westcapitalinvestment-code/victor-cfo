import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buscarEstrategia } from "@/lib/victor/estrategias-financieras";
import { buscarConocimiento } from "@/lib/victor/conocimiento-financiero";
import { buscarIdentidadCultural } from "@/lib/victor/identidad-cultural";
import { direccionCategoriaValida } from "@/lib/direccion-categoria";

// El texto real del banco (description_raw) casi nunca coincide palabra
// por palabra con cómo el usuario describe una transacción en el chat —
// ej. el usuario dice "la ATH Móvil de $100 de Martín Mercado" pero el
// banco guarda "TRANF ATHM MARTIN MERCADO 8610 ON 08/15/26" (sin la
// palabra "Móvil", sin acentos, sin "de"). Antes categorizarUna armaba UN
// solo ILIKE con la frase completa tal cual venía — si el modelo pasaba
// más de una palabra que no calzara exacto en el texto del banco, la
// búsqueda entera fallaba con "no encontrada" aunque la transacción
// correcta sí estuviera ahí. Esta función parte la frase en palabras
// sueltas, bota conectores/palabras de una letra y tokens que son solo
// números (el monto ya se compara aparte con `monto`), y esas palabras se
// usan luego con OR (cualquiera que aparezca) en vez de exigir la frase
// completa — así "Martín Mercado" sigue encontrando la transacción aunque
// "ATH Móvil" no aparezca literalmente en el texto del banco.
const CONECTORES_BUSQUEDA = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "por", "para", "en", "y", "o", "a", "al",
]);
function palabrasClave(descripcion: string): string[] {
  return Array.from(
    new Set(
      descripcion
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // quita acentos: "Móvil" → "Movil"
        .replace(/[^\p{L}\p{N}\s]/gu, " ") // quita $, comas, etc.
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length >= 3 && !CONECTORES_BUSQUEDA.has(p) && !/^\d+$/.test(p))
    )
  );
}
// Arma el filtro OR de Supabase/PostgREST a partir de las palabras clave;
// si no queda ninguna palabra útil (frase muy corta o solo conectores),
// vuelve al comportamiento anterior (la frase completa tal cual) para no
// dejar la búsqueda sin ningún filtro.
function filtroDescripcion(descripcion: string): { or?: string; ilikeCompleta?: string } {
  const palabras = palabrasClave(descripcion);
  if (palabras.length === 0) return { ilikeCompleta: descripcion };
  return { or: palabras.map((p) => `description_raw.ilike.%${p}%`).join(",") };
}

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
      "aun con monto y fecha sigue habiendo ambigüedad (dos transacciones REALMENTE idénticas el mismo día — " +
      "ej. dos abonos de 'Ahorro Directo' por el mismo monto el mismo día, que son movimientos distintos y " +
      "reales, no un duplicado de datos), usa el campo transaction_id si lo tienes de " +
      "revisar_gastos_sin_categorizar — resuelve sin ambigüedad. Si no lo tienes, no adivines — pregúntale cuál es.",
    input_schema: {
      type: "object",
      properties: {
        descripcion_transaccion: { type: "string", description: "Parte del nombre/descripción del comercio, tal como aparece en el gasto (ej. 'Uber', 'Amazon', 'Pueblo')." },
        monto: { type: "number", description: "Monto exacto de la transacción, si el usuario lo mencionó — ayuda a distinguir cuál transacción es cuando hay varias parecidas." },
        fecha: { type: "string", description: "Fecha exacta de la transacción en formato YYYY-MM-DD, si la tienes — imprescindible para distinguir gastos recurrentes idénticos (mismo comercio, mismo monto, distinta fecha)." },
        transaction_id: { type: "string", description: "El id exacto de la transacción, SOLO si lo tienes porque salió en el listado de revisar_gastos_sin_categorizar — úsalo para transacciones que son genuinamente idénticas (mismo comercio, monto y fecha, ej. dos transferencias del mismo día) y que por eso no se pueden distinguir de otra forma. Nunca lo muestres al usuario en el chat, es solo para uso interno tuyo." },
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
      "exacta de la lista, monto y fecha cuando los tengas, y transaction_id para las que sean genuinamente " +
      "idénticas entre sí — mismo comercio, monto y fecha, como dos transferencias del mismo día — donde " +
      "monto/fecha no bastan para distinguirlas). El resultado te dice cuáles se categorizaron y cuáles no " +
      "(con la razón) — las que fallaron por ambigüedad y no tenías su id, pregúntaselas al usuario agrupadas " +
      "en un mensaje, no las reintentes adivinando.",
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
              transaction_id: { type: "string", description: "El id exacto de la transacción, si lo tienes de revisar_gastos_sin_categorizar — imprescindible cuando hay transacciones genuinamente idénticas (mismo comercio, monto y fecha) para categorizar cada una por separado sin ambigüedad. Nunca lo muestres al usuario." },
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
      "categorizar, o clasificar sus gastos, o pregunte qué le falta categorizar. Cada transacción del listado " +
      "trae su id real entre corchetes al inicio — guárdalo internamente (nunca lo repitas al usuario) y " +
      "mándalo como transaction_id en categorizar_transacciones_lote para las que sean genuinamente idénticas " +
      "entre sí (mismo comercio, monto y fecha — ej. dos transferencias del mismo día a la misma cuenta, que " +
      "son movimientos reales distintos, no un error de datos) — sin el id, esas nunca se pueden distinguir " +
      "por texto. Después de ver la lista, categoriza tú mismo, en UNA sola llamada a " +
      "categorizar_transacciones_lote con todas juntas, las que reconozcas con alta confianza por el nombre " +
      "del comercio, sin preguntar — nunca uses categorizar_transaccion una por una para esto. Solo " +
      "pregúntale al usuario, agrupadas en un mensaje, las que de verdad sean ambiguas.",
    input_schema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Cuántas transacciones traer como máximo. Si no se especifica, usa 40." },
      },
      required: [],
    },
  },
    {
    name: "revisar_documentos_por_vencer",
    description:
      "Trae la lista real de documentos de la Bóveda del usuario que están por vencer o ya vencieron — " +
      "licencias, marbete, pólizas, permisos, certificaciones, etc. Úsala SIEMPRE en el saludo proactivo " +
      "diario (junto con revisar_gastos_sin_categorizar), y también cuando el usuario pregunte qué le " +
      "falta renovar, qué está por vencer, o algo sobre un documento específico de su Bóveda.",
    input_schema: {
      type: "object",
      properties: {
        dias: { type: "number", description: "Ventana de días hacia adelante a revisar. Si no se especifica, usa 30." },
      },
      required: [],
    },
  },
      {
    name: "actualizar_documento",
    description:
      "Actualiza un documento existente de la Bóveda del usuario — úsala cuando diga que ya renovó, pagó, o " +
      "tramitó algo que ya estaba guardado (ej. 'ya renové el marbete, vence el 15 de marzo' o 'ya pagué la " +
      "póliza, la nueva vence en un año'). Busca el documento por nombre — si hay más de una coincidencia, " +
      "pregúntale al usuario cuál es antes de actualizar. Si cambias la fecha de vencimiento, el ciclo de " +
      "alertas (90/30/7 días) arranca de cero automáticamente para la nueva fecha — no hace falta que hagas " +
      "nada más. Nunca inventes una fecha que el usuario no te dio.",
    input_schema: {
      type: "object",
      properties: {
        nombre_documento: { type: "string", description: "Nombre (o parte del nombre) del documento a actualizar, tal como está guardado, ej. 'marbete' o 'póliza de auto'." },
        nueva_fecha_vencimiento: { type: "string", description: "Nueva fecha de vencimiento en formato YYYY-MM-DD, si el usuario la dio." },
        nuevo_nombre: { type: "string", description: "Nuevo nombre para el documento, solo si el usuario pidió cambiarlo." },
      },
      required: ["nombre_documento"],
    },
  },
  {
    name: "eliminar_documento",
    description:
      "Elimina un documento de la Bóveda del usuario — úsala cuando ya no aplica (ej. 'vendí el carro, borra " +
      "el marbete' o 'cancelé esa póliza'). Es IRREVERSIBLE, así que SIEMPRE confirma con el usuario primero " +
      "en el chat (algo como '¿seguro que quieres que borre \"Marbete Toyota 2019\" de tu Bóveda?') y solo " +
      "llama esta herramienta después de que confirme que sí. Nunca la llames en el mismo turno donde el " +
      "usuario apenas lo menciona por primera vez.",
    input_schema: {
      type: "object",
      properties: {
        nombre_documento: { type: "string", description: "Nombre (o parte del nombre) del documento a eliminar, tal como está guardado." },
      },
      required: ["nombre_documento"],
    },
  },
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
    name: "consultar_estrategia_financiera",
    description:
      "Trae el desarrollo COMPLETO de una de las 23 estrategias financieras avanzadas del catálogo de " +
      "VICTOR (crédito, real estate, decreto Ley 60, negocio, ingreso pasivo) — con las 3 preguntas clave, " +
      "cuándo sí/no aplica, riesgos reales, y el primer paso accionable. El catálogo completo de nombres " +
      "está en tu system prompt (sección CATÁLOGO DE ESTRATEGIAS) — úsala SIEMPRE que el usuario mencione " +
      "una de esas estrategias (de un reel, podcast, curso, o de memoria), siguiendo el PROTOCOLO DE " +
      "ACTIVACIÓN. Nunca desarrolles una estrategia de memoria o inventada — tráela primero con esta " +
      "herramienta.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "El número (ej. '3') o el nombre/parte del nombre de la estrategia, tal como aparece en el catálogo (ej. 'BRRRR', 'house hacking', 'HELOC')." },
      },
      required: ["tema"],
    },
  },
  {
    name: "consultar_conocimiento_financiero",
    description:
      "Trae la explicación completa (con ejemplos y números reales) de uno de los 15 conceptos financieros " +
      "del día a día de VICTOR (presupuesto, tarjetas de crédito, inflación, amortización, etc.), o los " +
      "principios aplicados de uno de los 3 libros que VICTOR usa en conversación (Págate Primero / El " +
      "Hombre Más Rico de Babilonia, La Psicología del Dinero de Housel, El Inversor Inteligente de Graham). " +
      "La lista completa de temas disponibles está en tu system prompt. Úsala cuando la REGLA DE ORO de la " +
      "Academia de VICTOR aplique — el usuario conecta un producto, hace una pregunta, o detectas un patrón " +
      "que merece explicarse — o cuando quieras responder desde uno de los libros. Nunca inventes números de " +
      "ejemplo ni cites un libro de memoria — tráelo primero con esta herramienta.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "El nombre del concepto o del libro/autor, tal como aparece en la lista (ej. 'inflación', 'credit score', 'Housel', 'la psicología del dinero')." },
      },
      required: ["tema"],
    },
  },
  {
    name: "consultar_identidad_cultural",
    description:
      "Trae el vocabulario natural, dichos/refranes, y contexto cultural completo de un país (Puerto Rico, " +
      "México, Colombia, España) o del modo mixto/Spanglish — para que VICTOR hable como un pana/cuate/parcero " +
      "de ese país, no en español genérico. Úsala UNA VEZ que sepas el país del usuario (por el onboarding o " +
      "porque lo mencionó) y antes de empezar a usar modismos/jerga locales en la conversación — no inventes " +
      "ni recuerdes de memoria el vocabulario o los dichos, tráelos primero con esta herramienta.",
    input_schema: {
      type: "object",
      properties: {
        pais: { type: "string", description: "País o territorio del usuario, o 'modo mixto'/'spanglish' (ej. 'Puerto Rico', 'México', 'Colombia', 'España')." },
      },
      required: ["pais"],
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
  item: { descripcion: string; monto: number | null; fecha: string | null; nombreCategoria: string; transactionId?: string | null }
): Promise<ToolResult> {
  const { descripcion, monto, fecha, nombreCategoria, transactionId } = item;
  if ((!descripcion && !transactionId) || !nombreCategoria) {
    return { ok: false, message: "Faltan datos (descripción o id de la transacción, y nombre de categoría) para categorizar." };
  }

  // Búsqueda de categoría en dos pasos. Primero ilike exacto (rápido, cubre
  // el caso normal donde VICTOR usa el nombre casi literal). Si eso no
  // encuentra nada, cae a un match por palabras clave (mismo criterio que
  // filtroDescripcion/palabrasClave para transacciones) contra TODAS las
  // categorías activas — hace falta cuando VICTOR parafrasea el nombre real
  // (ej. dice "pago de tarjeta" pero el catálogo tiene "Pagos de deudas y
  // tarjetas": ilike falla porque "pago de tarjeta" no es una subcadena
  // literal de eso, aunque para cualquier persona es obviamente la misma
  // categoría). Sin este fallback, categorizarUna devolvía ok:false por "no
  // encontrada" en silencio, y en el saludo proactivo VICTOR igual le decía
  // al usuario que ya había categorizado — bug real reportado por Joel el
  // 22 de agosto 2026 (quedaba "1 gasto sin categorizar" en Home a pesar de
  // que el chat decía que ya estaba resuelto).
  const { data: categoriasExactas, error: catError } = await supabase
    .from("hacienda_categories")
    .select("id, nombre")
    .eq("activo", true)
    .ilike("nombre", `%${nombreCategoria}%`);

  if (catError) return { ok: false, message: `No se pudo buscar la categoría: ${catError.message}` };

  let categorias = categoriasExactas ?? [];

  if (categorias.length === 0) {
    const { data: todasActivas, error: catError2 } = await supabase
      .from("hacienda_categories")
      .select("id, nombre")
      .eq("activo", true);
    if (catError2) return { ok: false, message: `No se pudo buscar la categoría: ${catError2.message}` };

    const palabrasBuscadas = palabrasClave(nombreCategoria);
    if (palabrasBuscadas.length > 0) {
      categorias = (todasActivas ?? []).filter((c) => {
        const nombreNormalizado = palabrasClave(c.nombre).join(" ");
        return palabrasBuscadas.every((p) => nombreNormalizado.includes(p));
      });
    }
  }

  if (categorias.length === 0) {
    return { ok: false, message: `No encontré ninguna categoría parecida a "${nombreCategoria}". Pregúntale al usuario cuál de las categorías existentes aplica.` };
  }
  if (categorias.length > 1) {
    return {
      ok: false,
      message: `Hay varias categorías parecidas a "${nombreCategoria}" (${categorias.map((c) => c.nombre).join(", ")}). Pídele al usuario que aclare cuál.`,
    };
  }

  // Si VICTOR trae el id exacto (lo dio revisar_gastos_sin_categorizar), lo
  // usamos directo — resuelve sin ambigüedad el caso de transacciones
  // idénticas (mismo comercio, mismo monto, mismo día — ej. dos abonos de
  // "Ahorro Directo" el mismo día) que por descripción+monto+fecha nunca se
  // pueden distinguir entre sí, porque de verdad son indistinguibles por
  // esos datos. Sin id, seguimos con la búsqueda difusa de siempre.
  let transacciones: { id: string; description_raw: string; amount: number; fecha: string; entity_id: string | null; matched_pattern_id: string | null; tipo_flujo: string | null }[] | null = null;
  let findError: { message: string } | null = null;

  if (transactionId) {
    const resultado = await supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha, entity_id, matched_pattern_id, tipo_flujo")
      .eq("owner_id", ownerId)
      .eq("id", transactionId)
      .limit(1);
    transacciones = resultado.data;
    findError = resultado.error;
  } else {
    // Búsqueda por palabras sueltas con OR (ver filtroDescripcion arriba)
    // en vez de una sola frase completa — así "ATH Móvil de $100 Martín
    // Mercado" sigue encontrando "TRANF ATHM MARTIN MERCADO..." por las
    // palabras "Martín"/"Mercado" aunque "ATH Móvil" no aparezca en el
    // texto del banco. El filtro de monto/fecha se aplica después, en
    // JS, para no depender de combinar dos .or() de PostgREST a la vez
    // (descripción OR-de-palabras + monto OR-de-signos), que es frágil.
    const filtro = filtroDescripcion(descripcion);
    let query = supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha, entity_id, matched_pattern_id, tipo_flujo")
      .eq("owner_id", ownerId)
      .order("fecha", { ascending: false })
      .limit(30);
    query = filtro.or ? query.or(filtro.or) : query.ilike("description_raw", `%${filtro.ilikeCompleta}%`);
    const resultado = await query;
    findError = resultado.error;
    // revisar_gastos_sin_categorizar SIEMPRE manda el monto en positivo
    // (Math.abs), aunque en la base de datos un ingreso/depósito se
    // guarda en negativo (convención: positivo = gasto que sale, negativo
    // = dinero que entra). Si comparábamos solo contra el positivo, una
    // transacción de ingreso real (ej. INTRST PYMNT) nunca hacía match —
    // "no encontrada" aunque la herramienta la acabara de listar como
    // pendiente. Aceptamos cualquiera de los dos signos.
    transacciones = (resultado.data ?? [])
      .filter((t) => monto === null || Math.abs(Number(t.amount)) === Math.abs(monto))
      .filter((t) => fecha === null || t.fecha === fecha)
      .slice(0, 5);
  }

  if (findError) return { ok: false, message: `No se pudo buscar la transacción: ${findError.message}` };
  if (!transacciones || transacciones.length === 0) {
    if (transactionId) {
      // El id vino de revisar_gastos_sin_categorizar en algún momento
      // anterior — si ya no existe (o cambió de dueño), lo más seguro es
      // que ya se categorizó en otra llamada de este mismo lote o en
      // paralelo. No hace falta la búsqueda difusa aquí.
      return { ok: false, message: `No encontré ninguna transacción con id "${transactionId}" — puede que ya se haya categorizado antes. Vuelve a llamar revisar_gastos_sin_categorizar si quieres confirmar qué queda pendiente de verdad.` };
    }
    // Antes de rendirse, busca solo por descripción (sin monto/fecha),
    // con la misma búsqueda por palabras sueltas de arriba, para que
    // VICTOR vea qué hay de verdad y pueda diagnosticar en vez de
    // quedarse en un "no encontrada" sin más contexto.
    const filtroCercanas = filtroDescripcion(descripcion);
    let queryCercanas = supabase
      .from("transactions")
      .select("description_raw, amount, fecha")
      .eq("owner_id", ownerId)
      .order("fecha", { ascending: false })
      .limit(5);
    queryCercanas = filtroCercanas.or
      ? queryCercanas.or(filtroCercanas.or)
      : queryCercanas.ilike("description_raw", `%${filtroCercanas.ilikeCompleta}%`);
    const { data: cercanas } = await queryCercanas;
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
          `${monto !== null ? ` por $${Math.abs(monto)}` : ""} en ${fecha} — son genuinamente idénticas, no ` +
          `un error de datos. Si tienes el transaction_id de cada una (de revisar_gastos_sin_categorizar), ` +
          `vuelve a llamar esta herramienta una vez por cada id para categorizarlas por separado. Si no lo ` +
          `tienes, pídele al usuario más detalle para distinguirlas.`,
    };
  }

  const transaccion = transacciones[0];
  const categoria = categorias[0];

  // Guardrail para categorías con dirección en el nombre (ej. "ATH Móvil -
  // enviado" / "ATH Móvil - recibido", patrón que el usuario puede pedir
  // crear para cualquier comercio con flujo en dos sentidos). Sin esto,
  // como la búsqueda de arriba acepta el monto en cualquiera de los dos
  // signos (línea de comentario sobre revisar_gastos_sin_categorizar), es
  // fácil que una transacción RECIBIDA termine archivada como "enviado" o
  // viceversa — pasó de verdad con 3 transferencias ATH Móvil recibidas
  // que quedaron mal puestas en "... - enviado". Comparamos contra
  // tipo_flujo (no el signo crudo del monto) porque tipo_flujo ya resuelve
  // los casos raros como tarjetas de crédito con signo invertido.
  // direccionCategoriaValida (lib/direccion-categoria.ts) es la MISMA regla
  // que usan el trigger de la base de datos (categoria_direccion_valida en
  // 0017/0019) y la ruta de categorización manual — cubre no solo
  // "... - enviado/recibido" sino cualquier nombre con "ingres*" (ej.
  // "Ingresos y depósitos"), que es justo donde se coló el bug real: una
  // transferencia SALIENTE categorizada como si fuera dinero que entró.
  if (!direccionCategoriaValida(categoria.nombre, transaccion.tipo_flujo)) {
    return {
      ok: false,
      message: `"${transaccion.description_raw}" ($${Math.abs(Number(transaccion.amount))}) tiene tipo_flujo="${transaccion.tipo_flujo}", que no cuadra con la dirección que implica el nombre "${categoria.nombre}" — no la categoricé para no mezclar direcciones. Busca la categoría equivalente del lado correcto, o pregúntale al usuario.`,
    };
  }

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
      const transactionId = typeof input.transaction_id === "string" && input.transaction_id.trim() ? input.transaction_id.trim() : null;
      return categorizarUna(supabase, ownerId, { descripcion, monto, fecha, nombreCategoria, transactionId });
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
        const transactionId = typeof raw.transaction_id === "string" && raw.transaction_id.trim() ? raw.transaction_id.trim() : null;
        // Secuencial, no Promise.all — cada una hace update + RPC de
        // aprendizaje (record_user_correction), y el volumen de un usuario
        // Core (decenas, no miles, por lote) hace innecesario el riesgo de
        // mandar todo en paralelo contra Supabase.
        const resultado = await categorizarUna(supabase, ownerId, { descripcion, monto, fecha, nombreCategoria, transactionId });
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
        .select("id, description_raw, amount, fecha, pending")
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

      // El [id] al inicio es para uso interno tuyo (transaction_id en
      // categorizar_transacciones_lote), nunca lo repitas en el chat al
      // usuario — es lo que te deja categorizar transacciones genuinamente
      // idénticas (mismo comercio, monto y fecha) sin ambigüedad.
      //
      // (PENDIENTE) al final marca las que el banco todavía no liquida —
      // Plaid puede corregir su descripción/monto más adelante sin avisar
      // de otra forma que reemplazando la misma fila (bug real, 22 agosto
      // 2026: VICTOR categorizó un cargo pendiente por su nombre genérico,
      // el banco lo liquidó con un nombre y monto totalmente distintos, y
      // pareció que la transacción "desapareció"). Puedes categorizarlas
      // igual si reconoces el comercio con confianza, pero avísale al
      // usuario que es un estimado y que podría cambiar cuando el banco lo
      // liquide — nunca lo presentes como un dato ya cerrado.
      const lista = (pendientes ?? [])
        .map(
          (t) =>
            `- [${t.id}] "${t.description_raw}" · $${Math.abs(Number(t.amount))} · ${t.fecha}${t.pending ? " (PENDIENTE)" : ""}`
        )
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
    case "revisar_documentos_por_vencer": {
      const diasVentana = Number.isFinite(Number(input.dias)) && Number(input.dias) > 0
        ? Math.min(Number(input.dias), 120)
        : 30;
      const hoy = new Date();
      const limite = new Date(hoy.getTime() + diasVentana * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: docs, error } = await supabase
        .from("documents")
        .select("nombre, fecha_vencimiento")
        .eq("owner_id", ownerId)
        .eq("estado", "activo")
        .not("fecha_vencimiento", "is", null)
        .lte("fecha_vencimiento", limite)
        .order("fecha_vencimiento", { ascending: true });

      if (error) return { ok: false, message: `No se pudo revisar los documentos de la Bóveda: ${error.message}` };
      if (!docs || docs.length === 0) {
        return { ok: true, message: `No hay documentos venciendo en los próximos ${diasVentana} días.` };
      }

      const lista = docs
        .map((d) => {
          const dias = Math.round(
            (new Date(d.fecha_vencimiento + "T00:00:00").getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000)
          );
          const cuando =
            dias < 0
              ? `venció hace ${Math.abs(dias)} día(s)`
              : dias === 0
                ? "vence hoy"
                : `vence en ${dias} día(s) (${d.fecha_vencimiento})`;
          return `"${d.nombre}" ${cuando}`;
        })
        .join("; ");

      return { ok: true, message: `Documentos por vencer o vencidos: ${lista}.` };
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

    case "consultar_estrategia_financiera": {
      const tema = String(input.tema ?? "").trim();
      if (!tema) return { ok: false, message: "Falta el tema/nombre/número de la estrategia a consultar." };

      const resultado = buscarEstrategia(tema);
      if (resultado === null) {
        return {
          ok: false,
          message: `No encontré ninguna estrategia parecida a "${tema}" en el catálogo. Revisa la lista de nombres en tu system prompt (sección CATÁLOGO DE ESTRATEGIAS) y prueba con el nombre exacto o el número.`,
        };
      }
      if (Array.isArray(resultado)) {
        return {
          ok: false,
          message: `Hay varias estrategias parecidas a "${tema}" (${resultado.map((e) => `${e.numero}. ${e.titulo}`).join(", ")}). Usa el número exacto para traer la que corresponde.`,
        };
      }
      return { ok: true, message: resultado.texto };
    }

    case "consultar_conocimiento_financiero": {
      const tema = String(input.tema ?? "").trim();
      if (!tema) return { ok: false, message: "Falta el tema/concepto/libro a consultar." };

      const resultado = buscarConocimiento(tema);
      if (resultado === null) {
        return {
          ok: false,
          message: `No encontré ningún concepto o libro parecido a "${tema}". Revisa la lista de temas disponibles en tu system prompt (Academia de VICTOR / Referencias) y prueba con el nombre exacto.`,
        };
      }
      if (Array.isArray(resultado)) {
        return {
          ok: false,
          message: `Hay varios temas parecidos a "${tema}" (${resultado.map((c) => c.titulo).join(", ")}). Usa el nombre exacto para traer el que corresponde.`,
        };
      }
      return { ok: true, message: resultado.texto };
    }

    case "consultar_identidad_cultural": {
      const pais = String(input.pais ?? "").trim();
      if (!pais) return { ok: false, message: "Falta el país a consultar." };

      const resultado = buscarIdentidadCultural(pais);
      if (resultado === null) {
        return {
          ok: false,
          message: `No tengo vocabulario cultural específico para "${pais}" — usa español latinoamericano neutral, sin modismos de ningún país en particular.`,
        };
      }
      if (Array.isArray(resultado)) {
        return {
          ok: false,
          message: `Hay varias coincidencias para "${pais}" (${resultado.map((c) => c.titulo).join(", ")}). Usa el nombre exacto para traer la que corresponde.`,
        };
      }
      return { ok: true, message: resultado.texto };
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
