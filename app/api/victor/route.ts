import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getVictorBasePrompt, buildUserContextBlock } from "@/lib/victor/system-prompt";
import { VICTOR_TOOLS, executeVictorTool } from "@/lib/victor/tools";
import { fechaHoyPR } from "@/lib/hora-pr";

// Ruta de servidor — la ANTHROPIC_API_KEY nunca se expone al navegador.
// El cliente (VictorChat) solo llama a /api/victor con el mensaje del
// usuario; todo lo demás (system prompt, historial, memoria) se arma aquí.

export const runtime = "nodejs";
// Sin esto, Vercel corta la función con el límite por defecto de la
// plataforma. Cuando VICTOR categoriza en lote (varias transacciones
// pendientes, una llamada a Claude por cada una dentro del loop de
// herramientas) puede tardar más de un minuto en total — con este límite
// tiene margen de sobra para terminar en vez de morir a mitad de camino
// sin contestarle nada al usuario.
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cuántos mensajes recientes de la conversación se mandan como historial.
// Suficiente para contexto de corto plazo sin disparar el costo de tokens.
const MAX_HISTORY_MESSAGES = 20;

// Quién es "el fundador" para efectos de que VICTOR pueda hablar contigo
// de cosas internas (prompt, arquitectura, roadmap). Esto se verifica del
// lado del servidor contra la sesión real de Supabase — nunca contra algo
// que alguien escriba en el chat (una "clave" dicha en un mensaje se
// puede copiar/pegar o aparecer en un screenshot; el login real, no).
// Si en el futuro hay más personas de confianza (CPA, socio), esto se
// puede mover a una columna is_founder/is_admin en la tabla users.
const FOUNDER_EMAILS = ["dr.jvalentin@gmail.com"];

// Misma señal técnica que manda app/dashboard/victor-chat.tsx cuando abre
// el chat solo una vez al día — nunca la escribe el usuario a mano.
const SALUDO_DIARIO_TRIGGER = "[SALUDO_DIARIO]";

type ChatMessage = { role: "user" | "assistant"; content: string };

// GET — trae la conversación más reciente del usuario (mensajes + id) para
// que el chat se pinte con continuidad real al cargar, sin importar en qué
// dispositivo/navegador esté — el localStorage de conversationId solo sirve
// como atajo en el MISMO navegador, esto es lo que da continuidad real
// entre teléfono y desktop.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data } = await supabase
    .from("conversations")
    .select("id, messages_json")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ conversationId: null, messages: [] });
  }

  return NextResponse.json({
    conversationId: data.id,
    messages: Array.isArray(data.messages_json) ? data.messages_json : [],
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "VICTOR no está configurado todavía (falta ANTHROPIC_API_KEY en el servidor)." },
      { status: 500 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const userMessage: string | undefined = body?.message;
  const conversationId: string | undefined = body?.conversationId;

  if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  // 1. Perfil del usuario (nombre, plan) para el bloque de contexto.
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, plan, plan_status")
    .eq("id", user.id)
    .single();

  // 2. Memoria de VICTOR (continuidad entre sesiones — Capa 4 del prompt).
  const { data: memory } = await supabase
    .from("victor_memory")
    .select("last_conversation_summary, goals, active_strategies")
    .eq("user_id", user.id)
    .maybeSingle();

  // 2b. Perfil profundo del onboarding conversacional (0008) — si todavía
  // no está completo, VICTOR lo arranca solo cuando lo dispara el layout.
  const { data: onboardingProfile } = await supabase
    .from("user_profiles")
    .select("perfil_completo, apodo, genero, edad, situacion, tiene_hijos, hijos_detalle")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Conversación activa — la retomamos si viene un id válido; si no,
  // retomamos la más reciente del usuario (así la conversación sigue igual
  // si entra desde otro dispositivo/navegador, donde el conversationId
  // guardado en localStorage no existe — el mismo comportamiento que
  // Gemini/ChatGPT). Solo se crea una nueva si de verdad no tiene ninguna.
  type ConversationRow = { id: string; messages_json: ChatMessage[]; tokens_usados: number };
  let conversation: ConversationRow | null = null;

  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages_json, tokens_usados")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();
    if (data) conversation = data as ConversationRow;
  }

  if (!conversation) {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages_json, tokens_usados")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) conversation = data as ConversationRow;
  }

  if (!conversation) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, messages_json: [], tokens_usados: 0 })
      .select("id, messages_json, tokens_usados")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "No se pudo crear la conversación." }, { status: 500 });
    }
    conversation = data as ConversationRow;
  }

  const history: ChatMessage[] = Array.isArray(conversation.messages_json)
    ? conversation.messages_json
    : [];

  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const isFounder = !!user.email && FOUNDER_EMAILS.includes(user.email.toLowerCase());
  const esSaludoDiario = userMessage === SALUDO_DIARIO_TRIGGER;

  // Metas reales en este momento (no la copia guardada en victor_memory) —
  // así VICTOR habla con números actuales y puede resolver a qué meta se
  // refiere el usuario cuando pide actualizar el progreso de una.
  const { data: liveGoals } = await supabase
    .from("goals")
    .select("name, target_amount, current_amount")
    .eq("owner_id", user.id)
    .eq("status", "activa")
    .is("entity_id", null);

  // 2c. Cuentas bancarias reales (Plaid) — para que VICTOR pueda contestar
  // directo preguntas de balance/ahorro/deuda en vez de mandar al usuario a
  // revisar la pantalla de Cuentas. Mismo filtro de negocio que el resto de
  // la app: si el plan es Core, las cuentas que parecen de negocio no cuentan.
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("name, type, subtype, current_balance, es_negocio")
    .eq("owner_id", user.id);
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);

  // Cuentas manuales (sin Plaid — ej. Apple Card) cuentan igual que las de
  // Plaid para que VICTOR vea el cuadro completo, no solo lo conectado
  // automáticamente.
  let manualesQuery = supabase
    .from("manual_accounts")
    .select("name, type, subtype, current_balance, es_negocio")
    .eq("owner_id", user.id);
  if (!esPro) manualesQuery = manualesQuery.eq("es_negocio", false);

  const [{ data: cuentasPlaid }, { data: cuentasManuales }] = await Promise.all([cuentasQuery, manualesQuery]);
  const todasLasCuentas = [...(cuentasPlaid ?? []), ...(cuentasManuales ?? [])];

  const bancoConectado = todasLasCuentas.length > 0;
  const cuentasLiquidas = todasLasCuentas.filter((c) => c.type === "depository");
  const balanceLiquido = cuentasLiquidas.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const ahorrado = cuentasLiquidas
    .filter((c) => c.subtype === "savings")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const deudaTotal = todasLasCuentas
    .filter((c) => c.type === "credit" || c.type === "loan")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  const contextBlock = buildUserContextBlock({
    fullName: profile?.full_name ?? null,
    plan: profile?.plan ?? null,
    planStatus: profile?.plan_status ?? null,
    memorySummary: memory?.last_conversation_summary ?? null,
    goals: (memory?.goals as unknown[]) ?? null,
    activeStrategies: (memory?.active_strategies as unknown[]) ?? null,
    isFounder,
    esSaludoDiario,
    liveGoals: liveGoals ?? null,
    finanzas: {
      bancoConectado,
      balanceLiquido,
      ahorrado,
      deudaTotal,
      cuentas: todasLasCuentas.map((c) => ({
        name: c.name,
        type: c.type,
        subtype: c.subtype,
        balance: Number(c.current_balance || 0),
      })),
    },
    onboardingProfile: onboardingProfile
      ? {
          perfilCompleto: onboardingProfile.perfil_completo,
          apodo: onboardingProfile.apodo,
          genero: onboardingProfile.genero,
          edad: onboardingProfile.edad,
          situacion: onboardingProfile.situacion,
          tieneHijos: onboardingProfile.tiene_hijos,
          hijosDetalle: onboardingProfile.hijos_detalle,
        }
      : null,
  });

  const systemPrompt = getVictorBasePrompt();

  const systemBlocks: Anthropic.TextBlockParam[] = [
    // El bloque grande y estático va con cache_control para que Anthropic
    // lo cachee entre llamadas — baja el costo real de tener un system
    // prompt de ~30K tokens en cada mensaje.
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextBlock },
  ];

  // Historial en el formato que espera la API (puede traer content como
  // string en turnos normales, o como bloques si en el futuro guardamos
  // tool calls — por ahora siempre string porque solo persistimos texto).
  // Se filtran turnos con content vacío/en blanco: la API de Anthropic
  // RECHAZA con error 400 cualquier mensaje con un bloque de texto vacío,
  // así que si alguna vez quedó guardado un turno de VICTOR en blanco
  // (ver seguro más abajo), incluirlo aquí tumbaría TODA la conversación
  // en cada mensaje siguiente — un solo turno corrupto dejaría a VICTOR
  // sin poder contestar nunca más en ese chat.
  const apiMessages: Anthropic.MessageParam[] = [
    ...recentHistory.filter((m) => m.content && m.content.trim()).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let assistantText = "";
  let tokensUsados = conversation.tokens_usados ?? 0;
  // Antes en 4 — muy poco para categorizar en lote (revisar_gastos_sin_categorizar
  // + varios categorizar_transaccion + resumen final fácil pasa de 4 llamadas
  // cuando hay 8-10 gastos pendientes). Con solo 4, el loop se cortaba a
  // mitad de trabajo y el texto que quedaba en pantalla era el que VICTOR
  // había escrito ANTES de ver el resultado real de la última herramienta —
  // por eso podía decir "listo, 10 de 10" sin que fuera cierto todavía.
  const MAX_TOOL_ITERATIONS = 12;
  let seQuedoSinIteraciones = false;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        // Sonnet 5 corre con "pensamiento adaptativo" a effort "high" por
        // default — ese pensamiento interno consume del mismo tope de
        // max_tokens que la respuesta visible, y eso fue lo que cortó la
        // respuesta a la mitad de una palabra. "low" es lo que Anthropic
        // recomienda para chat conversacional (no código/agentes). Subido
        // de 4096 a 8192: con preguntas que requieren comparar/sumar varios
        // números (ej. "8 pendientes y 188 restantes, ¿están categorizados
        // o no?") el pensamiento interno se comía TODO el presupuesto de
        // 4096 sin dejar espacio para la respuesta visible — resultado:
        // VICTOR contestaba con texto vacío. Con más margen, el pensamiento
        // tiene espacio de sobra y siempre queda algo para la respuesta.
        max_tokens: 8192,
        output_config: { effort: "low" },
        system: systemBlocks,
        tools: VICTOR_TOOLS,
        messages: apiMessages,
      });

      tokensUsados += response.usage.input_tokens + response.usage.output_tokens;

      assistantText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      if (response.stop_reason !== "tool_use") break;

      // VICTOR pidió usar una o más herramientas — las ejecutamos de verdad
      // (con el cliente de Supabase del usuario, así que RLS manda) y le
      // devolvemos el resultado para que arme la respuesta final.
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      apiMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeVictorTool(
          supabase,
          user.id,
          toolUse.name,
          (toolUse.input as Record<string, unknown>) ?? {}
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.message,
          is_error: !result.ok,
        });
      }

      apiMessages.push({ role: "user", content: toolResults });
      // Sigue el loop — se le vuelve a preguntar a Claude con el resultado
      // de la herramienta ya en el historial, para que confirme al usuario.

      if (i === MAX_TOOL_ITERATIONS - 1) seQuedoSinIteraciones = true;
    }
  } catch (err) {
    console.error("Error llamando a Claude:", err);
    return NextResponse.json(
      { error: "VICTOR no pudo responder ahora mismo. Intenta de nuevo en un momento." },
      { status: 502 }
    );
  }

  // Si se acabaron las iteraciones y la última respuesta todavía pedía usar
  // una herramienta, el texto que quedó en assistantText es lo que VICTOR
  // escribió ANTES de ver ese último resultado — no una confirmación real.
  // Mejor decir la verdad que mostrar un "listo" que puede ser falso.
  if (seQuedoSinIteraciones) {
    assistantText =
      "Me quedé a mitad de categorizar todo lo que pediste — hay más de lo que puedo confirmar en una " +
      "sola respuesta. Dime 'sigue' y continúo con lo que falta, o revisa la pantalla de Gastos para ver " +
      "qué se guardó de verdad hasta ahora.";
  }

  // Seguro contra respuesta en blanco: puede pasar que Claude gaste todo el
  // presupuesto de max_tokens en "pensamiento" interno (thinking) sin dejar
  // nada para el texto visible — sobre todo en preguntas que piden comparar
  // o sumar varios números. Nunca se debe guardar ni devolver un turno
  // vacío: además de verse roto en el chat, la API de Anthropic RECHAZA
  // con error 400 cualquier mensaje futuro que incluya un turno con texto
  // vacío en el historial — eso fue lo que dejó a VICTOR sin poder
  // contestar NADA en conversaciones siguientes una vez que quedó guardado
  // un turno en blanco.
  if (!assistantText || !assistantText.trim()) {
    console.error("VICTOR devolvió texto vacío. Último userMessage:", userMessage);
    assistantText =
      "Se me enredó el pensamiento contestando eso — pasa cuando la pregunta pide comparar varios " +
      "números a la vez. ¿Me lo repites, o lo partimos en partes más chiquitas?";
  }

  // Marca que VICTOR ya saludó hoy, para que autoOpenSaludoDiario (en el
  // layout) no se vuelva a disparar aunque el usuario recargue o vuelva a
  // entrar más tarde el mismo día. No crítico — si falla, en el peor caso
  // vuelve a saludar, no rompe la respuesta al usuario.
  if (esSaludoDiario) {
    try {
      await supabase
        .from("user_profiles")
        .update({ ultimo_saludo_en: fechaHoyPR() })
        .eq("id", user.id);
    } catch (err) {
      console.error("No se pudo marcar ultimo_saludo_en:", err);
    }
  }

  const updatedMessages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantText },
  ];

  await supabase
    .from("conversations")
    .update({ messages_json: updatedMessages, tokens_usados: tokensUsados, updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Continuidad entre sesiones (Capa 4 del prompt: "VICTOR debe recordar
  // al usuario entre sesiones"). No guardamos el historial completo — un
  // modelo barato (Haiku) resume lo memorable de este intercambio en 1-2
  // líneas y lo fusiona con lo que ya sabíamos. Si algo falla aquí no debe
  // tumbar la respuesta al usuario, así que va en su propio try/catch.
  try {
    await updateVictorMemory({
      supabase,
      userId: user.id,
      userMessage,
      assistantText,
      previousSummary: memory?.last_conversation_summary ?? null,
    });
  } catch (err) {
    console.error("No se pudo actualizar victor_memory:", err);
  }

  return NextResponse.json({
    conversationId: conversation.id,
    reply: assistantText,
  });
}

async function updateVictorMemory(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  userMessage: string;
  assistantText: string;
  previousSummary: string | null;
}) {
  const { supabase, userId, userMessage, assistantText, previousSummary } = params;

  const summaryResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    output_config: { effort: "low" },
    system:
      "Actualizas la memoria de VICTOR, un CFO personal, sobre un usuario. Te doy el resumen " +
      "anterior (puede estar vacío) y el intercambio más reciente. Devuelve un resumen actualizado " +
      "en español, en 2-4 oraciones cortas, en tercera persona, con lo que vale la pena recordar en " +
      "la próxima conversación: metas mencionadas, decisiones, situación financiera, tono/preferencias. " +
      "No repitas saludos ni cosas triviales. Si de verdad no hay nada memorable en este intercambio, " +
      "responde exactamente: SIN_CAMBIOS",
    messages: [
      {
        role: "user",
        content:
          `Resumen anterior: ${previousSummary || "(ninguno todavía)"}\n\n` +
          `Usuario dijo: ${userMessage}\n` +
          `VICTOR respondió: ${assistantText}`,
      },
    ],
  });

  const newSummary = summaryResponse.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!newSummary || newSummary === "SIN_CAMBIOS") return;

  await supabase
    .from("victor_memory")
    .upsert({ user_id: userId, last_conversation_summary: newSummary, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}
