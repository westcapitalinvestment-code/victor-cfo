import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarEnManual } from "@/lib/soporte-agente";

// Agente de comentarios de Facebook/Instagram (22 nov 2026, pedido de Joel:
// "podría existir un agente que conteste esos comentarios si hacen preguntas").
// Meta avisa por webhook (app/api/meta/webhook) cada comentario nuevo en la
// página o en los anuncios; VICTOR decide: contestar en público, dar like,
// ocultar spam/estafas, o avisarle a Joel si es delicado. Usa el mismo manual
// que el agente de soporte por correo. Nunca promete ganancias ni da señales.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const GRAPH = "https://graph.facebook.com/v21.0";
const AVISOS = "info@victorcfo.com";

export type ComentarioMeta = {
  plataforma: "facebook" | "instagram";
  commentId: string;
  postId: string | null;
  autorId: string | null;
  autorNombre: string | null;
  mensaje: string;
};

const SYSTEM_PROMPT = `Eres VICTOR, la voz de la página "Victor CFO" en Facebook e Instagram. Te llega UN comentario público en una publicación o en un anuncio (casi siempre de VICTOR Trading: el guardián de riesgo para MetaTrader 5, la bitácora y el coach, $19.99/mes, en victorcfo.com/trading). Decides qué hacer con él usando las herramientas.

Qué hacer según el comentario:
- PREGUNTA sobre VICTOR (precio, cómo funciona, si sirve con su broker, si funciona en Mac, si es una estafa…): busca primero en el manual con buscar_manual y contesta con responder_publico. Si el manual no lo cubre, contesta algo general y honesto e invita a escribir por mensaje o a victorcfo.com/trading.
- SALUDO o comentario positivo ("Hola", "Interesante", "Amén", "Me interesa", emojis): responder_publico con algo breve y cálido que invite a preguntar o a probarlo, o solo me_gusta si no hace falta texto.
- SPAM o ESTAFA (alguien que ofrece cuentas gestionadas, "escríbele a fulano", recuperación de fondos, señales pagadas, links raros, promociones de otros): ocultar.
- CRÍTICA legítima ("otra estafa", "eso no sirve"): contesta con calma y hechos en responder_publico (no vendemos señales ni prometemos ganancias; ayuda a poner reglas y límites para proteger su capital; garantía de 7 días). Nunca discutas ni te pongas a la defensiva.
- DELICADO (insultos fuertes a la marca, problemas con un cobro, alguien que dice haber perdido dinero con VICTOR, temas legales, datos personales, menores, crisis personal) o no estás seguro: avisar_a_joel y NO contestes en público.
- Nada que hacer (comentario sin contenido, etiqueta a un amigo): ignorar.

Reglas de cada respuesta pública:
- Español neutro y cercano (el usuario puede ser de Puerto Rico, Latinoamérica o España). Máximo 2-3 oraciones, menos de 280 caracteres. Sin hashtags. Un emoji como mucho.
- NUNCA prometas ganancias, rentabilidad ni que no perderá la cuenta. NUNCA des señales, niveles, ni digas qué comprar o vender. VICTOR no es asesor financiero.
- No pidas datos personales en público. Si hace falta, invita a escribir por mensaje.
- No firmes la respuesta.
- Precios, garantía y funciones: solo lo que confirmes en el manual.

Debes terminar SIEMPRE con exactamente una de: responder_publico, me_gusta, ocultar, avisar_a_joel o ignorar.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_manual",
    description: "Busca un tema en el manual real de VICTOR CFO (ej. 'trading plan precio', 'trading mac', 'trading broker').",
    input_schema: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] },
  },
  {
    name: "responder_publico",
    description: "Contesta el comentario en público como la página Victor CFO (y le da me gusta).",
    input_schema: { type: "object", properties: { texto: { type: "string", description: "Respuesta corta, menos de 280 caracteres." } }, required: ["texto"] },
  },
  { name: "me_gusta", description: "Solo le da me gusta al comentario.", input_schema: { type: "object", properties: {}, required: [] } },
  {
    name: "ocultar",
    description: "Oculta el comentario (spam, estafa, promoción ajena). El autor y sus amigos lo siguen viendo; nadie más.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
  {
    name: "avisar_a_joel",
    description: "No contesta y le avisa a Joel por correo para que lo vea él (delicado o dudoso).",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
  {
    name: "ignorar",
    description: "No hace nada (comentario sin contenido, etiqueta a un amigo).",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
];

async function graph(path: string, params: Record<string, string>): Promise<{ ok: boolean; error?: string; id?: string }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "Falta META_PAGE_ACCESS_TOKEN en el servidor." };
  const body = new URLSearchParams({ ...params, access_token: token });
  try {
    const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
    const j = (await r.json().catch(() => ({}))) as { id?: string; success?: boolean; error?: { message?: string } };
    if (!r.ok || j.error) return { ok: false, error: j.error?.message ?? `HTTP ${r.status}` };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red con Meta." };
  }
}

// Instagram usa /replies y no tiene "me gusta" de página por API; Facebook usa /comments y /likes.
const responder = (c: ComentarioMeta, texto: string) =>
  c.plataforma === "instagram" ? graph(`${c.commentId}/replies`, { message: texto }) : graph(`${c.commentId}/comments`, { message: texto });
const darLike = (c: ComentarioMeta): Promise<{ ok: boolean; error?: string }> => (c.plataforma === "instagram" ? Promise.resolve({ ok: true }) : graph(`${c.commentId}/likes`, {}));
const ocultarComentario = (c: ComentarioMeta) => (c.plataforma === "instagram" ? graph(c.commentId, { hide: "true" }) : graph(c.commentId, { is_hidden: "true" }));

async function avisar(c: ComentarioMeta, motivo: string): Promise<boolean> {
  if (!resend) return false;
  const texto =
    `Un comentario en ${c.plataforma === "instagram" ? "Instagram" : "Facebook"} necesita que lo veas tú (VICTOR no contestó).\n\n` +
    `De: ${c.autorNombre ?? "(sin nombre)"}\nComentario: ${c.mensaje}\nPor qué: ${motivo}\n\n` +
    `Míralo en Meta Business Suite → Bandeja de entrada → Comentarios.`;
  const { error } = await resend.emails.send({
    from: "VICTOR CFO <soporte@victorcfo.com>",
    to: AVISOS,
    subject: `Comentario para revisar: "${c.mensaje.slice(0, 60)}"`,
    text: texto,
  });
  return !error;
}

export type ResultadoComentario = { accion: string; detalle: string; ok: boolean };

export async function procesarComentario(c: ComentarioMeta): Promise<ResultadoComentario> {
  const admin = createAdminClient();
  // Idempotencia: Meta puede mandar el mismo aviso más de una vez.
  const { error: dup } = await admin.from("meta_comentarios").insert({
    comment_id: c.commentId,
    plataforma: c.plataforma,
    post_id: c.postId,
    autor_id: c.autorId,
    autor_nombre: c.autorNombre,
    mensaje: c.mensaje.slice(0, 2000),
    accion: "procesando",
  });
  if (dup) return { accion: "duplicado", detalle: "Ya procesado.", ok: true };

  const guardar = async (r: ResultadoComentario) => {
    await admin.from("meta_comentarios").update({ accion: r.accion, detalle: r.detalle.slice(0, 2000), ok: r.ok }).eq("comment_id", c.commentId);
    return r;
  };

  if (process.env.META_AGENTE_ACTIVO === "0") return guardar({ accion: "apagado", detalle: "META_AGENTE_ACTIVO=0", ok: true });

  const mensajes: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Comentario en ${c.plataforma === "instagram" ? "Instagram" : "Facebook"} de ${c.autorNombre ?? "alguien"}:\n"""${c.mensaje.slice(0, 1500)}"""`,
    },
  ];
  try {
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const resp = await anthropic.messages.create({ model: "claude-sonnet-5", max_tokens: 600, system: SYSTEM_PROMPT, tools: TOOLS, messages: mensajes });
      mensajes.push({ role: "assistant", content: resp.content });
      const usos = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!usos.length) break;
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const u of usos) {
        const inp = (u.input ?? {}) as Record<string, string>;
        if (u.name === "buscar_manual") {
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: await buscarEnManual(String(inp.tema ?? "")) });
          continue;
        }
        if (u.name === "responder_publico") {
          const texto = String(inp.texto ?? "").trim().replace(/(\n\s*[—–-]+\s*VICTOR(\s+CFO)?\s*)+$/i, "").slice(0, 400);
          if (!texto) {
            resultados.push({ type: "tool_result", tool_use_id: u.id, content: "Falta el texto.", is_error: true });
            continue;
          }
          const r = await responder(c, texto);
          await darLike(c);
          return guardar({ accion: "respondido", detalle: r.ok ? texto : `Error: ${r.error} · Texto: ${texto}`, ok: r.ok });
        }
        if (u.name === "me_gusta") {
          const r = await darLike(c);
          return guardar({ accion: "me_gusta", detalle: r.ok ? "" : String(r.error), ok: r.ok });
        }
        if (u.name === "ocultar") {
          const r = await ocultarComentario(c);
          return guardar({ accion: "ocultado", detalle: r.ok ? String(inp.motivo ?? "") : `Error: ${r.error}`, ok: r.ok });
        }
        if (u.name === "avisar_a_joel") {
          const ok = await avisar(c, String(inp.motivo ?? ""));
          return guardar({ accion: "avisado", detalle: String(inp.motivo ?? ""), ok });
        }
        return guardar({ accion: "ignorado", detalle: String(inp.motivo ?? ""), ok: true });
      }
      if (resultados.length) mensajes.push({ role: "user", content: resultados });
    }
    const ok = await avisar(c, "El agente no llegó a una decisión.");
    return guardar({ accion: "avisado", detalle: "Sin decisión del agente.", ok });
  } catch (e) {
    return guardar({ accion: "error", detalle: e instanceof Error ? e.message : "Error del agente.", ok: false });
  }
}
