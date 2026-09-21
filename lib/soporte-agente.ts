import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRespuestaSoporteEmail, sendEscalacionSoporteEmail } from "@/lib/email";

// Agente de soporte por correo (21 sept 2026, pedido de Joel: "crear un
// agente que conteste lo que sea que esté en nuestro manual, ya si es algo
// que no tenemos que lo derive a mi" + "btw el agente es Victor CFO").
//
// Mismo manual que ya usa VICTOR dentro de la app (tabla manual_articulos,
// migraciones 0060/0061/0089) — un correo de un cliente no suele nombrar el
// módulo exacto como sí lo hace alguien navegando la app, así que en vez de
// reusar el tool consultar_manual de lib/victor/tools.ts (pensado para una
// sesión de usuario con ownerId), este agente le da a Claude su PROPIO tool
// de búsqueda de manual y corre su propio loop de tool-use — mismo patrón
// que app/api/victor/route.ts, pero sin nada específico de una cuenta.
//
// Decisión explícita de Joel (AskUserQuestion, 21 sept 2026): si el agente
// SÍ encuentra la respuesta, contesta DIRECTO al cliente (no deja borrador
// para revisión) — "Responde directo (Recomendado)".

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONECTORES = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "con", "por", "para", "en", "y", "o", "a", "al", "que", "como", "mi", "me",
]);
function palabrasClave(texto: string): string[] {
  return Array.from(
    new Set(
      texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length >= 3 && !CONECTORES.has(p) && !/^\d+$/.test(p))
    )
  );
}

async function buscarEnManual(tema: string): Promise<string> {
  const admin = createAdminClient();
  const terminos = palabrasClave(tema);
  const lista = terminos.length > 0 ? terminos : [tema.toLowerCase()];

  const orNombre = lista.flatMap((p) => [`slug.ilike.%${p}%`, `titulo.ilike.%${p}%`]).join(",");
  let { data: articulos, error } = await admin
    .from("manual_articulos")
    .select("slug, titulo, contenido")
    .or(orNombre)
    .limit(3);

  if (!error && (!articulos || articulos.length === 0)) {
    const orContenido = lista.flatMap((p) => [`resumen.ilike.%${p}%`, `contenido.ilike.%${p}%`]).join(",");
    ({ data: articulos, error } = await admin
      .from("manual_articulos")
      .select("slug, titulo, contenido")
      .or(orContenido)
      .limit(3));
  }

  if (error) return `No se pudo buscar en el manual: ${error.message}`;
  if (!articulos || articulos.length === 0) {
    return `No hay ningún artículo del manual sobre "${tema}". No inventes cómo funciona esa parte.`;
  }
  return articulos.map((a) => `### ${a.titulo} (slug: ${a.slug})\n${a.contenido}`).join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `Eres VICTOR, el asistente de VICTOR CFO, contestando un correo que llegó a soporte@victorcfo.com. Quien te escribe es un cliente o alguien interesado en la app — no un usuario dentro del chat de la app, así que no asumas que ya conoce los nombres exactos de los módulos.

Tu única fuente de verdad es la herramienta buscar_manual, que consulta el manual real de VICTOR CFO. Puedes llamarla varias veces con distintos términos si el primer intento no trae nada útil.

Reglas estrictas:
- NUNCA inventes cómo funciona algo que no confirmaste con buscar_manual. Si el manual no cubre la pregunta, o la pregunta es sobre algo específico de la cuenta del cliente (su factura, su plan, un cobro, un bug puntual, algo que requiere mirar sus datos), usa la herramienta escalar_a_joel — NO intentes adivinar ni contestar "a medias".
- Si SÍ encuentras la respuesta en el manual, usa la herramienta responder_cliente con una respuesta clara, breve, en español de Puerto Rico, tono cercano pero profesional — como VICTOR habla dentro de la app. No copies el artículo del manual tal cual; explícaselo a un cliente que no conoce la jerga interna.
- Nunca prometas nada que no esté confirmado en el manual (fechas, precios, funciones futuras).
- Correos que son claramente spam, publicidad, o no tienen nada que ver con VICTOR CFO: usa escalar_a_joel con ese motivo, para que él decida si vale la pena contestar.
- Debes terminar SIEMPRE llamando a responder_cliente o a escalar_a_joel — nunca ambas, nunca ninguna.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_manual",
    description: "Busca un tema en el manual real de VICTOR CFO. Úsalo cuantas veces necesites con distintos términos antes de decidir si puedes contestar o si hay que escalar.",
    input_schema: {
      type: "object",
      properties: { tema: { type: "string", description: "Tema o palabras clave a buscar en el manual." } },
      required: ["tema"],
    },
  },
  {
    name: "responder_cliente",
    description: "Envía la respuesta final directo al cliente, en el mismo hilo de correo. Úsalo SOLO si confirmaste la respuesta con buscar_manual.",
    input_schema: {
      type: "object",
      properties: { respuesta: { type: "string", description: "Texto de la respuesta, en español, tono VICTOR." } },
      required: ["respuesta"],
    },
  },
  {
    name: "escalar_a_joel",
    description: "Escala el correo a Joel (el fundador) en vez de contestar — para lo que el manual no cubre, temas de cuenta específicos, bugs, o spam.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Por qué se escala — breve, para que Joel sepa qué esperar antes de abrir el correo." } },
      required: ["motivo"],
    },
  },
];

type ResultadoAgente =
  | { accion: "respondido"; respuesta: string; articulosUsados: string[] }
  | { accion: "escalado"; motivo: string }
  | { accion: "error"; error: string };

// Procesa UN correo entrante: corre el loop de tool-use, y al final YA
// mandó el correo correspondiente (respuesta o escalación) — quien llama
// solo necesita el resultado para loggear en soporte_conversaciones.
export async function procesarCorreoSoporte(params: {
  deEmail: string;
  deNombre: string | null;
  asunto: string;
  cuerpo: string;
  messageId: string;
}): Promise<ResultadoAgente> {
  const { deEmail, deNombre, asunto, cuerpo, messageId } = params;

  const mensajeUsuario = `De: ${deNombre ? `${deNombre} <${deEmail}>` : deEmail}\nAsunto: ${asunto}\n\n${cuerpo}`;

  const articulosConsultados = new Set<string>();
  const mensajes: Anthropic.MessageParam[] = [{ role: "user", content: mensajeUsuario }];

  try {
    // Tope de vueltas del loop — evita que un caso raro (ej. Claude sigue
    // buscando sin decidirse) se quede corriendo indefinidamente en un
    // webhook que Resend espera que responda rápido.
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const respuesta = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: mensajes,
      });

      mensajes.push({ role: "assistant", content: respuesta.content });

      const usosHerramienta = respuesta.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (usosHerramienta.length === 0) {
        // Claude contestó texto plano sin llamar a ninguna herramienta —
        // no debería pasar (el prompt lo prohíbe), pero si pasa, se trata
        // como que no se decidió a nada: mejor escalar que quedarse callado.
        return { accion: "escalado", motivo: "El agente no llamó a responder_cliente ni a escalar_a_joel." };
      }

      const resultadosHerramienta: Anthropic.ToolResultBlockParam[] = [];

      for (const uso of usosHerramienta) {
        if (uso.name === "buscar_manual") {
          const tema = String((uso.input as { tema?: string }).tema ?? "");
          const resultado = await buscarEnManual(tema);
          const slugsEncontrados = [...resultado.matchAll(/slug: ([a-z0-9_-]+)/g)].map((m) => m[1]);
          slugsEncontrados.forEach((s) => articulosConsultados.add(s));
          resultadosHerramienta.push({ type: "tool_result", tool_use_id: uso.id, content: resultado });
        } else if (uso.name === "responder_cliente") {
          const texto = String((uso.input as { respuesta?: string }).respuesta ?? "").trim();
          if (!texto) {
            resultadosHerramienta.push({
              type: "tool_result",
              tool_use_id: uso.id,
              content: "Falta el texto de la respuesta.",
              is_error: true,
            });
            continue;
          }
          const envio = await sendRespuestaSoporteEmail({
            toEmail: deEmail,
            asuntoOriginal: asunto,
            messageIdOriginal: messageId,
            respuesta: texto,
          });
          if (!envio.sent) {
            return { accion: "error", error: envio.reason || "No se pudo enviar la respuesta." };
          }
          return { accion: "respondido", respuesta: texto, articulosUsados: Array.from(articulosConsultados) };
        } else if (uso.name === "escalar_a_joel") {
          const motivo = String((uso.input as { motivo?: string }).motivo ?? "Sin motivo especificado.");
          const envio = await sendEscalacionSoporteEmail({ deEmail, deNombre, asunto, cuerpo, motivo });
          if (!envio.sent) {
            return { accion: "error", error: envio.reason || "No se pudo enviar la escalación a Joel." };
          }
          return { accion: "escalado", motivo };
        }
      }

      if (resultadosHerramienta.length > 0) {
        mensajes.push({ role: "user", content: resultadosHerramienta });
      }
    }

    // Se acabaron las vueltas sin que Claude se decidiera — mejor escalar
    // que dejar el correo sin ninguna respuesta.
    const envio = await sendEscalacionSoporteEmail({
      deEmail,
      deNombre,
      asunto,
      cuerpo,
      motivo: "El agente no llegó a una decisión después de varios intentos de búsqueda.",
    });
    if (!envio.sent) return { accion: "error", error: envio.reason || "No se pudo enviar la escalación a Joel." };
    return { accion: "escalado", motivo: "Tope de vueltas del agente alcanzado." };
  } catch (err) {
    return { accion: "error", error: err instanceof Error ? err.message : "Error desconocido en el agente de soporte." };
  }
}
