import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getVictorBasePrompt, buildUserContextBlock } from "@/lib/victor/system-prompt";
import { VICTOR_TOOLS, executeVictorTool } from "@/lib/victor/tools";
import { fechaHoyPR } from "@/lib/hora-pr";
import { costoEnCentavos } from "@/lib/costo-ia";

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

// Igual que arriba, pero para el arranque del onboarding conversacional
// (Capa 2). Ninguna de las dos se supone que el usuario las vea nunca en
// pantalla — victor-chat.tsx las manda con { hidden: true } para que no
// se agreguen al historial visible EN ESE MOMENTO, pero sí se guardan tal
// cual en messages_json (hacen falta ahí para que Claude tenga contexto
// real de que esto ya pasó). El problema: si alguien recarga la página
// varias veces antes de terminar el onboarding (ej. reintentando login),
// cada carga vuelve a disparar el trigger, y GET /api/victor devolvía el
// historial completo — triggers incluidos — así que sí se veían como
// burbujas "[INICIO_AUTOMATICO]" repetidas al restaurar la conversación.
// Se filtran abajo en el GET, después de leerlos de la base de datos.
const ONBOARDING_TRIGGER = "[INICIO_AUTOMATICO]";

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

  const mensajesCrudos: ChatMessage[] = Array.isArray(data.messages_json) ? data.messages_json : [];
  const mensajesVisibles = mensajesCrudos.filter(
    (m) => m.content !== ONBOARDING_TRIGGER && m.content !== SALUDO_DIARIO_TRIGGER
  );

  return NextResponse.json({
    conversationId: data.id,
    messages: mensajesVisibles,
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
  // ciclo_inicio/ciclo_fin (migración 0026) son las fechas del ciclo de
  // facturación REAL de Stripe (ej. 23 ago → 23 sept), que el webhook
  // guarda aquí en cada activación/renovación — el tope de gasto de abajo
  // los usa para no depender del mes calendario, que no coincide con
  // cuándo Stripe realmente cobra.
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, plan, plan_status, ciclo_inicio, ciclo_fin")
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
  // updated_at hace falta para el throttle por hora del tope de uso (ver
  // más abajo) — es el timestamp del último mensaje real de esta
  // conversación, así sabemos cuándo se puede dejar pasar el próximo.
  type ConversationRow = { id: string; messages_json: ChatMessage[]; tokens_usados: number; updated_at: string };
  let conversation: ConversationRow | null = null;

  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages_json, tokens_usados, updated_at")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();
    if (data) conversation = data as ConversationRow;
  }

  if (!conversation) {
    const { data } = await supabase
      .from("conversations")
      .select("id, messages_json, tokens_usados, updated_at")
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
      .select("id, messages_json, tokens_usados, updated_at")
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

  // Tope de gasto mensual por plan — red de seguridad ADEMÁS del fix de
  // caché de arriba (TTL de 1h en vez de 5min), no en vez de él. Protege
  // contra un bug o un patrón de uso fuera de lo normal que dispare el
  // costo real sin que nadie se entere hasta la factura. El founder queda
  // exento porque necesita poder probar la app libremente — su uso sí se
  // sigue registrando más abajo, solo no lo bloquea.
  // Cifras actualizadas (30 agosto 2026) tras BAJAR Core de $19.99 a
  // $14.99/mes (decisión de Joel, de cara al lanzamiento de "familiares
  // gratis" — #192). Cálculo de margen para Core: $14.99 ingreso − $7.50
  // tope de IA − $2.00 Plaid − ~$0.73 fees de Stripe (2.9%+$0.30) = $4.76
  // de ganancia ≈ 32% de margen, en el peor caso (usuario que pega justo
  // en el tope todos los meses) — bajó bastante del 48% que daba a
  // $19.99, porque el tope de IA y Plaid NO bajaron con el precio. Con el
  // fix de caché puesto, un usuario activo normal debería quedar bien por
  // debajo del tope. Pro y Pro+ se quedan con sus números viejos por ahora
  // — no son comprables todavía (PRO_DISPONIBLE = false), así que no urge
  // recalcularlos. Si en la práctica Core se acerca seguido al tope, hay
  // que subir el número — no es una talla única para siempre.
  //
  // SOLO 2 niveles, NUNCA un bloqueo total — Joel fue explícito: cortarle
  // el acceso del todo a un usuario real es lo que hace que cancele, así
  // que no existe un tercer nivel "tope_mensual" que lo deje sin poder usar
  // VICTOR. En su lugar:
  //   1. aviso            — VICTOR responde normal, pero avisa que vas rápido.
  //   2. restringido_hora — deja pasar 1 mensaje por hora, el resto del mes
  //                          si hace falta. Nunca escala a "nada hasta el
  //                          día 1" — el límite mensual completo solo es un
  //                          número de referencia, no un muro.
  //
  // El umbral de ambos niveles no es el límite mensual completo, sino el
  // límite mensual A RITMO PAREJO hasta hoy (límite × día_del_mes /
  // días_del_mes). Esto le da "arrastre" natural: alguien que casi no habla
  // con VICTOR la primera mitad del mes acumula margen de sobra para un día
  // pesado más adelante (ej. temporada de planillas), en vez de perder ese
  // margen cada medianoche como pasaría con un tope diario fijo sin
  // arrastre. Y como el presupuesto-hasta-hoy crece cada día que pasa, un
  // usuario que quede "restringido_hora" un día puede volver solo a
  // "aviso" o "normal" más adelante sin que nadie tenga que intervenir —
  // por diseño, no debería ser posible llegar al límite mensual completo
  // a mitad de mes precisamente porque este ritmo diario ya lo frena antes.
  const LIMITES_MENSUALES_CENTAVOS: Record<string, number> = { core: 750, pro: 620, proplus: 1033 };
  // Piso mínimo de presupuesto para los primeros días de CUALQUIER ciclo
  // (protege la conversación de onboarding, la más pesada de toda la
  // relación) — deja de importar apenas el ritmo-parejo lo supere solo
  // (día ~5 de un ciclo de 31 días con el tope de Core).
  const PRESUPUESTO_MINIMO_CENTAVOS = 100;
  const SIGUIENTE_PLAN: Record<string, string | null> = { core: "VICTOR Pro", pro: "VICTOR Pro+", proplus: null };

  // El ritmo-parejo se ancla al CICLO DE FACTURACIÓN REAL de Stripe
  // (ciclo_inicio/ciclo_fin, guardados por el webhook en cada activación o
  // renovación — ej. 23 ago → 23 sept), no al mes calendario. Antes de este
  // cambio (23 agosto 2026, detectado por Joel probando esto mismo) el
  // contador reseteaba el día 1 de cada mes sin importar cuándo la persona
  // pagó — alguien que se registrara el 31 de agosto tenía casi nada de
  // presupuesto ese día, pero el 1 de septiembre el contador volvía a dar
  // casi un mes completo de golpe, TODAVÍA DENTRO del mismo ciclo que ya
  // había pagado una vez (su próximo cobro real era el 30 de septiembre) —
  // podía terminar gastando casi el doble del tope pensado por ciclo.
  // Cuentas sin ciclo de Stripe (ej. las "trialing" de antes de conectar
  // Stripe, sin stripe_customer_id) caen al mes calendario como respaldo,
  // igual que se comportaba todo esto antes.
  const tieneCicloStripe = !!profile?.ciclo_inicio && !!profile?.ciclo_fin;
  const hoyPR = fechaHoyPR();
  const [anioActualStr, mesActualStr, diaActualStr] = hoyPR.split("-");
  const diasEnElMesCalendario = new Date(Number(anioActualStr), Number(mesActualStr), 0).getDate();

  let claveCicloUso: string;
  let diaDelPeriodo: number;
  let diasEnElPeriodo: number;

  if (tieneCicloStripe) {
    const inicio = new Date(`${profile!.ciclo_inicio}T00:00:00Z`);
    const fin = new Date(`${profile!.ciclo_fin}T00:00:00Z`);
    const hoy = new Date(`${hoyPR}T00:00:00Z`);
    const MS_POR_DIA = 24 * 60 * 60 * 1000;
    diasEnElPeriodo = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / MS_POR_DIA));
    diaDelPeriodo = Math.min(
      diasEnElPeriodo,
      Math.max(1, Math.round((hoy.getTime() - inicio.getTime()) / MS_POR_DIA) + 1)
    );
    claveCicloUso = profile!.ciclo_inicio as string; // ej. '2026-08-23' — único por ciclo real
  } else {
    diaDelPeriodo = Number(diaActualStr);
    diasEnElPeriodo = diasEnElMesCalendario;
    claveCicloUso = hoyPR.slice(0, 7); // 'YYYY-MM' — respaldo para cuentas sin Stripe
  }

  const planActual = profile?.plan ?? "core";
  const siguientePlan = SIGUIENTE_PLAN[planActual] ?? null;
  const notaUpgrade = siguientePlan
    ? ` Si quieres seguir hablando sin este tope, en Configuración puedes subir a ${siguientePlan}.`
    : " Si esto te está bloqueando algo urgente, escríbele a soporte.";

  let estadoUso: "normal" | "aviso" | "restringido_hora" = "normal";
  if (!isFounder) {
    const { data: usoCiclo } = await supabase
      .from("uso_ia_mensual")
      .select("costo_centavos")
      .eq("owner_id", user.id)
      .eq("ciclo_clave", claveCicloUso)
      .maybeSingle();
    const costoCicloHastaAhora = Number(usoCiclo?.costo_centavos ?? 0);
    const limiteMensual = LIMITES_MENSUALES_CENTAVOS[planActual] ?? LIMITES_MENSUALES_CENTAVOS.core;
    const presupuestoHastaHoy = Math.max(
      (limiteMensual * diaDelPeriodo) / diasEnElPeriodo,
      PRESUPUESTO_MINIMO_CENTAVOS
    );

    // Ya no hay un tercer nivel de bloqueo total — si costoCicloHastaAhora
    // llega o pasa el límite del ciclo completo, sigue cayendo en
    // "restringido_hora" (1 mensaje/hora), nunca en un corte sin acceso.
    if (costoCicloHastaAhora >= presupuestoHastaHoy) {
      estadoUso = "restringido_hora";
    } else if (costoCicloHastaAhora >= presupuestoHastaHoy * 0.85) {
      estadoUso = "aviso";
    }
  }

  // Guarda un mensaje fijo (sin llamar a Claude) y responde — usado por los
  // niveles 2 y 3 de arriba, que no deben gastar ni un centavo más.
  async function responderSinLlamarAClaude(mensaje: string) {
    const updatedMessagesFijo: ChatMessage[] = [
      ...history,
      { role: "user", content: userMessage as string },
      { role: "assistant", content: mensaje },
    ];
    await supabase
      .from("conversations")
      .update({ messages_json: updatedMessagesFijo, updated_at: new Date().toISOString() })
      .eq("id", conversation!.id);
    return NextResponse.json({ conversationId: conversation!.id, reply: mensaje });
  }

  if (estadoUso === "restringido_hora") {
    const ultimoMensajeEn = new Date(conversation.updated_at);
    const unaHoraDespues = new Date(ultimoMensajeEn.getTime() + 60 * 60 * 1000);
    const haceMenosDeUnaHora = Date.now() < unaHoraDespues.getTime();
    if (haceMenosDeUnaHora) {
      const horaLegible = new Intl.DateTimeFormat("es-PR", {
        timeZone: "America/Puerto_Rico",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(unaHoraDespues);
      return responderSinLlamarAClaude(
        `Vas más rápido de lo normal con VICTOR hoy — para cuidar el uso, te dejo seguir a partir de las ` +
          `${horaLegible}. Mientras tanto puedes seguir usando el resto de la app sin problema.${notaUpgrade}`
      );
    }
    // Pasó más de una hora desde el último mensaje — se deja pasar este UNO
    // (sigue el flujo normal de abajo, incluida la llamada real a Claude).
  }

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
  // entity_id (migración 0040, 1 sept 2026): cuentas ya asignadas a una
  // entidad de negocio no deben contar en el contexto de VICTOR de
  // Personal — mismo criterio que dashboard/page.tsx.
  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("name, type, subtype, current_balance, es_negocio")
    .eq("owner_id", user.id)
    .is("entity_id", null);
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);

  // Cuentas manuales (sin Plaid — ej. Apple Card) cuentan igual que las de
  // Plaid para que VICTOR vea el cuadro completo, no solo lo conectado
  // automáticamente.
  let manualesQuery = supabase
    .from("manual_accounts")
    .select("name, type, subtype, current_balance, es_negocio")
    .eq("owner_id", user.id);
  if (!esPro) manualesQuery = manualesQuery.eq("es_negocio", false);

  // Fecha de la transacción más antigua que tenemos guardada (de cualquier
  // cuenta) — así VICTOR puede detectar que Plaid solo trajo un pedazo del
  // año (ej. BPPR a veces solo entrega ~45 días) y sugerir proactivamente
  // que el usuario suba el estado de cuenta (CSV/QuickBooks o PDF) para
  // rellenar el resto, en vez de que el usuario tenga que darse cuenta y
  // pedirlo él mismo.
  const { data: transaccionMasVieja } = await supabase
    .from("transactions")
    .select("fecha")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Entidades de negocio activas — tipo de contribuyente (Individuo, LLC de
  // un miembro, Corporación, Profesional independiente) para explicar
  // retiro de dueño vs. salario (Regla 6, Estratega Perfil 1), MÁS el pATH
  // de ATH Móvil Business (0052) y las cuentas ya conectadas — sin esto
  // VICTOR sugiere genéricamente "consigue una cuenta a nombre de [entidad]"
  // aunque el usuario YA tenga una conectada, que fue justo el bug real que
  // Joel reportó (2 sept 2026): le pedía separar el negocio de lo personal
  // sin saber que la cuenta de VIP Medical ya estaba en la app. Vacío para
  // Core (la creación de entidades es Pro) — la query no hace daño.
  const { data: entidadesNegocioRaw } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ath_movil_business_path")
    .eq("owner_id", user.id)
    .eq("active", true);

  // Cuentas Plaid ya asignadas a una entidad específica (entity_id real,
  // asignado por /api/plaid/asignar-entidad-cuenta) — atribución exacta.
  const entidadIds = (entidadesNegocioRaw ?? []).map((e) => e.id);
  const { data: cuentasPlaidPorEntidad } =
    entidadIds.length > 0
      ? await supabase.from("plaid_accounts").select("name, entity_id").eq("owner_id", user.id).in("entity_id", entidadIds)
      : { data: [] as { name: string; entity_id: string | null }[] };

  // Cuentas manuales de negocio (ej. Apple Card, o un checking que Joel
  // metió a mano) — manual_accounts NUNCA tuvo columna entity_id, solo un
  // booleano es_negocio global por usuario. Con 1 sola entidad activa la
  // atribución es segura (todo lo que es_negocio=true es de esa entidad);
  // con 2+ entidades no hay forma de saber de cuál es cada una, así que se
  // omiten para no atribuir mal — VICTOR no debe inventar a cuál pertenece.
  const { data: cuentasManualesNegocio } =
    entidadIds.length === 1
      ? await supabase.from("manual_accounts").select("name").eq("owner_id", user.id).eq("es_negocio", true)
      : { data: [] as { name: string }[] };

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
      historialDesde: transaccionMasVieja?.fecha ?? null,
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
    entidadesNegocio: (entidadesNegocioRaw ?? []).map((e) => {
      const cuentasPlaid = (cuentasPlaidPorEntidad ?? []).filter((c) => c.entity_id === e.id).map((c) => c.name);
      // Las manuales solo se atribuyeron a esta entidad si es la ÚNICA
      // entidad activa (ver comentario arriba de la query) — mismo caso
      // (entidadIds.length === 1) implica que esta es esa única entidad.
      const cuentasManuales = entidadIds.length === 1 ? (cuentasManualesNegocio ?? []).map((c) => c.name) : [];
      return {
        name: e.name,
        entityType: e.entity_type,
        athMovilBusinessPath: e.ath_movil_business_path,
        cuentasConectadas: [...cuentasPlaid, ...cuentasManuales],
      };
    }),
  });

  const systemPrompt = getVictorBasePrompt();

  const systemBlocks: Anthropic.TextBlockParam[] = [
    // El bloque grande y estático va con cache_control para que Anthropic
    // lo cachee entre llamadas — baja el costo real de tener un system
    // prompt de ~20K tokens en cada mensaje.
    // ttl: "1h" en vez del default de 5 minutos — el patrón real de uso
    // (alguien probando la app, o un usuario real conversando con VICTOR
    // a ratos durante el día) casi siempre deja más de 5 minutos entre un
    // mensaje y el siguiente. Con 5 minutos, cada mensaje pagaba el
    // prompt completo como escritura de caché cara (1.25x el precio base)
    // en vez de lectura barata (0.1x) — 12.5x más caro por mensaje, y esto
    // era el driver real detrás del gasto diario que subía en el dashboard
    // de Anthropic. La escritura de 1 hora cuesta más (2x en vez de 1.25x)
    // pero pasa muchas menos veces, así que el neto es mucho más barato
    // para este patrón de uso disperso. Ver docs.claude.com/prompt-caching.
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } },
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
  // Segundo punto de caché, además del system prompt de arriba — este es
  // el que de verdad mueve la aguja del costo diario real EN TURNOS con
  // loop de herramientas — pero NO en una conversación normal de ida y
  // vuelta sin herramientas, que es el caso más común.
  //
  // INTENTO 1 (revertido): cachear el historial en TODOS los mensajes,
  // sin importar si había loop o no. Con datos reales de hoy se confirmó
  // que esto era un ERROR — un simple "wepa llegué" (1 sola llamada, sin
  // herramientas) costó 19.28¢ en vez de los ~3.7¢ normales, porque
  // escribir caché cuesta EL DOBLE que mandar el mismo texto sin cachear
  // (400 vs 200 centavos/MTok), y si nunca se llega a LEER ese caché
  // (porque el turno termina en 1 sola llamada), esa escritura cara nunca
  // se recupera — es puro costo extra. Ver uso_ia_log del 21 de agosto:
  // cache_creation_tokens ~5,700-6,150 en CADA mensaje (reescritura
  // completa), cache_read_tokens en 0 para el primer mensaje de la sesión.
  //
  // INTENTO 2 (este): el historial se manda SIN cachear en la 1ra llamada
  // de cada turno — igual que antes de cualquier fix, así una conversación
  // normal de 1 sola llamada nunca paga la prima de escritura de caché sin
  // necesidad. El cache_control se agrega recién ANTES de la 2da llamada
  // del MISMO turno (ver más abajo, dentro del loop, "if (i === 1)") — o
  // sea, solo cuando ya sabemos de verdad que hace falta un loop real
  // (categorización en lote, revisar pendientes, etc.), que es exactamente
  // donde SÍ hay lecturas de sobra para recuperar esa escritura cara.
  const apiMessages: Anthropic.MessageParam[] = [
    ...recentHistory.filter((m) => m.content && m.content.trim()).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];
  // Posición del último mensaje ANTES de que el loop de herramientas
  // empiece a agregarle más (assistant tool_use / user tool_result) — es
  // el punto donde ponemos el cache_control si hace falta, más abajo.
  const indiceUltimoMensajeInicial = apiMessages.length - 1;

  let assistantText = "";
  let tokensUsados = conversation.tokens_usados ?? 0;
  // Costo real (no solo tokens) acumulado en este turno — se registra en
  // uso_ia_mensual al final, para el tope de gasto de arriba. Independiente
  // de isFounder: siempre se registra (así Joel también puede ver cuánto
  // gasta su propia cuenta de prueba), lo único que cambia por ser founder
  // es que el chequeo de tope de arriba nunca lo bloquea.
  let costoAcumuladoCentavos = 0;
  // Desglose por turno para el log de diagnóstico (uso_ia_log, migración
  // 0020) — no afecta el tope de gasto (eso sigue siendo solo
  // costoAcumuladoCentavos), es solo para poder ver DESPUÉS qué fue caro y
  // por qué, en vez de adivinar. iteracionesTurno cuenta cuántas llamadas
  // reales a Claude hizo falta para este único mensaje del usuario —
  // categorizar en lote o revisar pendientes normalmente pasa de 1.
  let iteracionesTurno = 0;
  let inputTokensTurno = 0;
  let outputTokensTurno = 0;
  let cacheReadTokensTurno = 0;
  let cacheCreationTokensTurno = 0;
  const herramientasUsadasTurno = new Set<string>();
  const modelosUsadosTurno = new Set<string>();
  // EXPERIMENTO (22 agosto 2026, decisión de Joel): todo en Haiku, siempre
  // — incluso el saludo diario y turnos que usan herramientas (categorizar,
  // crear meta, consultar balance). Antes existía un enrutamiento
  // "balanceado" (Haiku para texto plano, escalaba a Sonnet en cuanto pedía
  // una herramienta) que resolvía calidad, pero tenía un problema real: el
  // saludo diario (cold start, además con herramientas) terminaba pagando
  // la escritura de caché DOS VECES — una para el intento de Haiku
  // descartado, otra para Sonnet, porque Haiku y Sonnet no comparten caché
  // entre sí — y por diseño el saludo SIEMPRE usa herramientas
  // (revisar_gastos_sin_categorizar + categorizar_transacciones_lote), así
  // que pagaba ese peor caso todos los días. Quitar la escalación completa
  // elimina ese problema de raíz y baja el costo a una cuarta parte en
  // cualquier turno con herramientas — el riesgo a vigilar es si la calidad
  // de categorización/razonamiento de Haiku aguanta sin la red de
  // seguridad de Sonnet. Si no aguanta, revertir es sencillo: este bloque
  // reemplaza por completo la lógica de enrutamiento anterior, que queda
  // documentada en el historial de git de este archivo.
  const modeloTurno: "claude-haiku-4-5" = "claude-haiku-4-5";
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
      // Recién en la 2da llamada de este turno (i === 1) sabemos de verdad
      // que hace falta un loop real de herramientas — ahí, y solo ahí,
      // marcamos el historial+mensaje del usuario con cache_control. La
      // 1ra llamada (i === 0) siempre se manda sin cachear: la mayoría de
      // los mensajes terminan ahí mismo (sin herramientas), y cachear algo
      // que nunca se vuelve a leer es pagar de más sin ninguna razón (ver
      // comentario junto a indiceUltimoMensajeInicial, arriba).
      if (i === 1) {
        const mensajeBase = apiMessages[indiceUltimoMensajeInicial];
        if (typeof mensajeBase.content === "string") {
          apiMessages[indiceUltimoMensajeInicial] = {
            ...mensajeBase,
            content: [{ type: "text", text: mensajeBase.content, cache_control: { type: "ephemeral", ttl: "1h" } }],
          };
        }
      }

      const response = await anthropic.messages.create({
        model: modeloTurno,
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
        // output_config/effort era solo para Sonnet 5 (pensamiento
        // adaptativo) — Haiku no tiene ese parámetro, así que no se manda
        // nada aquí mientras el experimento de "todo en Haiku" siga activo
        // (ver nota grande junto a modeloTurno, arriba).
        system: systemBlocks,
        tools: VICTOR_TOOLS,
        // FIX (3 sept 2026 — bug real reportado por Joel: el saludo dijo
        // "no hay transacciones sin categorizar" con 5 pendientes visibles
        // en Gastos). El system prompt YA le pedía a Haiku llamar
        // revisar_gastos_sin_categorizar "de inmediato, sin preguntar" en
        // el saludo diario, pero eso es solo una instrucción de texto — el
        // modelo puede saltársela (más probable en Haiku que en Sonnet,
        // ver nota del experimento "todo en Haiku" arriba) y redactar un
        // saludo optimista sin haber verificado nada. tool_choice fuerza a
        // nivel de API que la PRIMERA llamada del saludo sea de verdad esa
        // herramienta — ya no depende de que el modelo "obedezca", es una
        // garantía estructural. Solo aplica a i===0: de ahí en adelante
        // vuelve a "auto" para que pueda llamar también
        // revisar_documentos_por_vencer, revisar_citas_proximas,
        // categorizar_transacciones_lote, etc. según haga falta.
        ...(esSaludoDiario && i === 0
          ? { tool_choice: { type: "tool" as const, name: "revisar_gastos_sin_categorizar" } }
          : {}),
        messages: apiMessages,
      });

      modelosUsadosTurno.add("haiku");
      tokensUsados += response.usage.input_tokens + response.usage.output_tokens;
      costoAcumuladoCentavos += costoEnCentavos(modeloTurno, response.usage);

      iteracionesTurno++;
      inputTokensTurno += response.usage.input_tokens ?? 0;
      outputTokensTurno += response.usage.output_tokens ?? 0;
      cacheReadTokensTurno += response.usage.cache_read_input_tokens ?? 0;
      cacheCreationTokensTurno +=
        response.usage.cache_creation != null
          ? (response.usage.cache_creation.ephemeral_5m_input_tokens ?? 0) +
            (response.usage.cache_creation.ephemeral_1h_input_tokens ?? 0)
          : response.usage.cache_creation_input_tokens ?? 0;

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
        herramientasUsadasTurno.add(toolUse.name);
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

  // SALVAVIDAS ANTI-FABRICACIÓN (29 agosto 2026 — tercer incidente real el
  // mismo día: Apple Card, Acorn, y ahora "cambiame a coinbase a $600" —
  // VICTOR contestó "Hecho. Coinbase está actualizada a $600.00" sin haber
  // llamado NINGUNA herramienta, confirmado con uso_ia_log en null). Los
  // guardrails de texto en system-prompt.txt ya lo advierten dos veces con
  // casos reales y el modelo lo sigue haciendo de todas formas — un prompt
  // nunca garantiza al 100% que el modelo llame la herramienta correcta.
  // Este bloque no depende de que el texto del prompt "convenza" a Claude:
  // revisa la respuesta YA ESCRITA después del loop, y si suena a que
  // confirmó una acción sin haber llamado ninguna herramienta este turno,
  // le da UNA oportunidad más, explícita, de hacerlo de verdad — y si ni
  // así, se le dice la verdad al usuario en vez de dejar pasar la mentira.
  const SUENA_A_ACCION_CONFIRMADA =
    /^\s*(listo|hecho)\b|\bya\s+(la|lo|el)?\s*(cambi[eé]|actualic[eé]|elimin[eé]|cre[eé]|guard[eé]|saqu[eé])|\b(actualizad[oa]|eliminad[oa]|cambiad[oa]|creada?|guardad[oa])\b|acabo de (cambiar|actualizar|eliminar|crear|guardar|sacar|arreglar)/i;

  // Variante del mismo problema, pero como NEGACIÓN en vez de confirmación
  // (bug real reportado por Joel, 3 sept 2026: el saludo diario dijo "no
  // hay transacciones nuevas sin categorizar desde ayer" con 5 pendientes
  // visibles en la pantalla de Gastos). El tool_choice forzado de arriba
  // ya debería evitar esto de raíz para el saludo diario específicamente,
  // pero esta es la red de seguridad — igual que SUENA_A_ACCION_CONFIRMADA,
  // no depende de que el modelo "obedezca" el prompt.
  const SUENA_A_AUSENCIA_CONFIRMADA =
    /no\s+hay\s+(nada|ning[uú]n[ao]?|transacciones|gastos|documentos|citas)|todo\s+(ya\s+)?(est[aá]|esta)\s+categorizad|no\s+(tienes|tiene)\s+(nada\s+)?pendiente|sin\s+pendientes\b/i;

  const posibleFabricacion =
    herramientasUsadasTurno.size === 0 &&
    (SUENA_A_ACCION_CONFIRMADA.test(assistantText) ||
      (esSaludoDiario && SUENA_A_AUSENCIA_CONFIRMADA.test(assistantText)));

  if (posibleFabricacion) {
    console.error("Posible fabricación detectada — VICTOR confirmó una acción o ausencia sin llamar herramienta:", {
      userMessage,
      assistantText,
    });
    try {
      apiMessages.push({ role: "assistant", content: assistantText });
      apiMessages.push({
        role: "user",
        content:
          "[VERIFICACIÓN INTERNA — el usuario no escribió esto] Tu respuesta anterior sonaba a que ya " +
          "hiciste un cambio real (crear, actualizar o eliminar algo), pero no llamaste ninguna " +
          "herramienta en este turno. Si el usuario te pidió modificar, crear o eliminar algo: hazlo " +
          "AHORA MISMO llamando la herramienta correspondiente. Si de verdad no puedes (no existe una " +
          "herramienta para eso, o no encuentras la cuenta/dato), dile la verdad — que no se pudo — en " +
          "vez de decir que ya está hecho.",
      });

      const retryResponse = await anthropic.messages.create({
        model: modeloTurno,
        max_tokens: 8192,
        system: systemBlocks,
        tools: VICTOR_TOOLS,
        messages: apiMessages,
      });

      modelosUsadosTurno.add("haiku");
      tokensUsados += retryResponse.usage.input_tokens + retryResponse.usage.output_tokens;
      costoAcumuladoCentavos += costoEnCentavos(modeloTurno, retryResponse.usage);
      iteracionesTurno++;
      inputTokensTurno += retryResponse.usage.input_tokens ?? 0;
      outputTokensTurno += retryResponse.usage.output_tokens ?? 0;
      cacheReadTokensTurno += retryResponse.usage.cache_read_input_tokens ?? 0;

      if (retryResponse.stop_reason === "tool_use") {
        // Esta vez sí pidió la herramienta — se ejecuta de verdad y se usa
        // el mensaje de la propia herramienta como respuesta final (ya es
        // una frase completa y honesta, no hace falta gastar otra llamada
        // a Claude solo para redactar la confirmación).
        const toolUseBlocks = retryResponse.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );
        const mensajesHerramientas: string[] = [];
        for (const toolUse of toolUseBlocks) {
          herramientasUsadasTurno.add(toolUse.name);
          const result = await executeVictorTool(
            supabase,
            user.id,
            toolUse.name,
            (toolUse.input as Record<string, unknown>) ?? {}
          );
          mensajesHerramientas.push(result.message);
        }
        assistantText = mensajesHerramientas.join("\n\n");
      } else {
        const textoRetry = retryResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        assistantText =
          textoRetry && textoRetry.trim()
            ? textoRetry
            : "Me di cuenta de que no llegué a hacer ese cambio de verdad — ¿me lo repites para intentarlo ahora mismo?";
      }
    } catch (err) {
      console.error("Falló el reintento anti-fabricación:", err);
      assistantText = "Creo que no llegué a hacer ese cambio de verdad — ¿me lo repites para intentarlo ahora mismo?";
    }
  }

  // Registra el costo real de este turno para el tope de gasto mensual de
  // arriba — en su propio try/catch, igual que el resto de "extras" de esta
  // ruta (memoria, saludo diario): si falla, no debe tumbar la respuesta
  // que el usuario ya está esperando.
  try {
    await supabase.rpc("registrar_uso_ia", {
      p_owner_id: user.id,
      p_costo_centavos: costoAcumuladoCentavos,
      p_ciclo_clave: claveCicloUso,
    });
  } catch (err) {
    console.error("No se pudo registrar uso_ia_mensual:", err);
  }

  // Log de diagnóstico por mensaje (uso_ia_log, migración 0020) — para
  // poder ver DESPUÉS qué mensaje costó qué y por qué (cuántas iteraciones,
  // cuánto fue caché vs. fresco, qué herramientas se usaron), en vez de
  // adivinar sumando el total del día a ojo. Propio try/catch, mismo
  // motivo que el de arriba: nunca debe tumbar la respuesta al usuario.
  try {
    await supabase.rpc("registrar_uso_ia_detalle", {
      p_owner_id: user.id,
      p_costo_centavos: costoAcumuladoCentavos,
      p_iteraciones: iteracionesTurno,
      p_input_tokens: inputTokensTurno,
      p_output_tokens: outputTokensTurno,
      p_cache_read_tokens: cacheReadTokensTurno,
      p_cache_creation_tokens: cacheCreationTokensTurno,
      p_herramientas_usadas: herramientasUsadasTurno.size > 0 ? Array.from(herramientasUsadasTurno).join(", ") : null,
      p_mensaje_usuario: userMessage,
      p_modelos_usados: modelosUsadosTurno.size > 0 ? Array.from(modelosUsadosTurno).join(", ") : null,
    });
  } catch (err) {
    console.error("No se pudo registrar uso_ia_log:", err);
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

  // Nivel 1 de la escalación de uso (ver arriba) — VICTOR ya contestó
  // normal, solo se le pega un aviso corto al final. No se manda por
  // separado ni se le pide a Claude que lo redacte (costaría otra llamada);
  // es texto fijo, igual que los mensajes de los niveles 2 y 3.
  if (estadoUso === "aviso") {
    assistantText += `\n\n_Vas usando bastante a VICTOR hoy — todavía tienes margen, pero hay un tope mensual y te estás acercando.${notaUpgrade}_`;
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
    // Le dice al cliente si VICTOR de verdad ejecutó alguna herramienta
    // este turno (categorizar, crear cita, actualizar meta, etc.) — con
    // esto el chat puede refrescar la pantalla actual al instante en vez
    // de esperar los 30 minutos del auto-refresh (bug real reportado por
    // Joel, 29 agosto 2026: le pidió a VICTOR saldar una tarjeta y el
    // cambio no se veía en Gastos hasta que él mismo recargaba).
    huboAccion: herramientasUsadasTurno.size > 0,
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
