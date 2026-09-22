"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// "El alma de VICTOR" — botón flotante + panel de chat, disponible en
// cualquier pantalla del dashboard (se monta una sola vez desde el
// layout). Calcado del modal #m-victor-chat de VICTOR — Dashboard Core.html.
// Habla con /api/victor, que es donde vive la llave de Anthropic, el
// system prompt completo, y ahora también sus "manos" (tool use) —
// este componente nunca ve esas cosas, solo manda texto y pinta la respuesta.

type ChatMessage = { role: "user" | "assistant"; content: string; imageDataUrl?: string };

// Tipos de imagen que Anthropic acepta para visión — mismo criterio que
// app/api/victor/route.ts, para no dejar pegar algo que el servidor va a
// rechazar después de todos modos (ej. un .heic de un iPhone).
const IMAGE_MEDIA_TYPES_ACEPTADOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const STORAGE_KEY = "victor_conversation_id";
const ONBOARDING_TRIGGER = "[INICIO_AUTOMATICO]";
const SALUDO_DIARIO_TRIGGER = "[SALUDO_DIARIO]";

const SUGERENCIAS = ["Analizar mis gastos", "Ver mis metas", "Ayúdame con una estrategia"];

// Logo/cara de VICTOR — antes era un PNG en base64 metido directo en el
// código (~4KB en una sola línea gigante). Se movió a un archivo real en
// /public (28 agosto 2026) porque ese base64 gigante se corrompía cada vez
// que Joel lo copiaba/pegaba a mano en el editor web de GitHub (una sola
// letra mal en un string de miles de caracteres ya rompe la imagen) —
// bug real reportado por Joel: el botón flotante se veía verde sólido con
// apenas un fantasma de la cara, en vez de la cara real. Un archivo en
// /public se sube directo (drag & drop, sin copiar texto), así que nunca
// más puede corromperse en el paste.
const VICTOR_AVATAR = "/victor-avatar.png";

// Lista de mensajes, memoizada aparte del resto del chat (21 sept 2026,
// reportado por Joel: "la PWA esta lenta cuando uno escribe"). Causa real,
// no era la señal — cada mensaje de VICTOR pasa por <ReactMarkdown>, que
// vuelve a parsear TODO el markdown de TODA la conversación en cada
// render. Como el input vive en el mismo componente que la lista de
// mensajes, cada letra que el usuario tecleaba (setInput) volvía a
// renderizar — y por lo tanto volvía a parsear — la conversación entera.
// Con una conversación larga eso se siente cada vez más lento a medida
// que pasan los mensajes, exactamente lo que Joel describió. Sacando la
// lista a su propio componente con memo(), React solo la vuelve a pintar
// cuando `messages`, `loading` o `error` de verdad cambian — no en cada
// tecla.
const PanelMensajes = memo(function PanelMensajes({
  scrollRef,
  messages,
  loading,
  error,
  avatar,
  onSugerencia,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  avatar: string;
  onSugerencia: (texto: string) => void;
}) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ minHeight: 240 }}>
      {messages.length === 0 && !loading && (
        <div className="mb-3 flex items-start gap-2">
          <img src={avatar} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
          <div className="rounded-r-[10px] rounded-bl-[10px] border border-border bg-bg p-2.5 text-sm text-text">
            ¡Hola! Soy VICTOR. Cuéntame qué necesitas — tus gastos, tus metas, o si tienes una
            idea que quieres evaluar juntos.
          </div>
        </div>
      )}

      {messages.map((m, i) => (
        <div key={i} className={`mb-3 flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          {m.role === "assistant" && (
            <img src={avatar} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
          )}
          <div
            className={`max-w-[80%] rounded-[10px] p-2.5 text-sm ${
              m.role === "user"
                ? "rounded-br-none whitespace-pre-wrap text-white"
                : "rounded-bl-none border border-border bg-bg text-text"
            }`}
            style={m.role === "user" ? { background: "#1D9E75" } : undefined}
          >
            {m.imageDataUrl && (
              <img src={m.imageDataUrl} alt="Imagen enviada" className="mb-1.5 max-h-40 w-full rounded-lg object-cover" />
            )}
            {m.role === "assistant" ? (
              <div className="vc-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        </div>
      ))}

      {loading && (
        <div className="mb-3 flex justify-start gap-2">
          <img src={avatar} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
          <div className="rounded-[10px] rounded-bl-none border border-border bg-bg p-2.5 text-sm text-muted">
            VICTOR está analizando y escribiendo…
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red">{error}</p>}

      {messages.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              onClick={() => onSugerencia(s)}
              className="rounded-pill border border-teal px-3 py-1.5 text-xs text-teal"
              style={{ background: "rgba(29,158,117,.1)" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default function VictorChat({
  autoOpenOnboarding = false,
  autoOpenSaludoDiario = false,
  plan = null,
  esReferido = false,
}: {
  autoOpenOnboarding?: boolean;
  autoOpenSaludoDiario?: boolean;
  // Gate del plan gratis (30 agosto 2026, migración 0031): un usuario
  // 'gratis' tiene cuenta real e independiente, pero hablar con VICTOR es
  // una de las dos cosas caras (~$7.50/mes de tope de Anthropic) que
  // requieren Core. esReferido ya no cambia el precio mostrado (4 sept
  // 2026: Core referido pasó de descuento permanente a primer mes gratis,
  // igual que Pro) — solo agrega el mensaje de "primer mes gratis" abajo
  // del precio normal (viene de layout.tsx, que lo lee de
  // users.referred_by).
  plan?: string | null;
  esReferido?: boolean;
}) {
  const bloqueado = plan === "gratis";
  const precioUpgrade = "14.99";
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function activarCore() {
    setUpgradeLoading(true);
    setUpgradeError(null);
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "core", ciclo: "mensual", returnTo, cancelTo: returnTo }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }
    setUpgradeLoading(false);
    setUpgradeError(json?.error || "No se pudo iniciar el pago. Intenta de nuevo en un momento.");
  }
  // Por defecto abierto — VICTOR debe sentirse presente e invitar a hablar,
  // no escondido detrás de un botón. Si el usuario lo cierra, se queda
  // cerrado mientras navega (el layout no se remonta entre páginas del
  // dashboard); vuelve a abrirse solo en la próxima carga completa.
  // Para refrescar la pantalla actual al instante cuando VICTOR ejecuta
  // algo que cambia datos (categorizar, crear cita, etc.) — ver el uso en
  // send(), justo después de recibir data.huboAccion.
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  // Menú del botón "+" (Tomar foto / Elegir foto) — ver JSX del input.
  const [showAdjuntar, setShowAdjuntar] = useState(false);
  // Imagen pegada (Ctrl+V) o adjuntada, lista para mandar en el próximo
  // mensaje — se limpia sola después de enviar. dataUrl es para la vista
  // previa y la burbuja del chat; base64/mediaType es lo que de verdad se
  // manda al servidor (misma separación que ya usa subir-csv.tsx para PDFs).
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; base64: string; mediaType: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Tope de seguridad del dictado por voz — ver el bug real reportado por
  // Joel más abajo, junto a la config de SpeechRecognition.
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reintento automático de "audio-capture" — ver comentario en
  // toggleVoice/iniciarReconocimiento más abajo. Evita reintentar en bucle
  // si el micrófono de verdad no está disponible.
  const audioCaptureRetryRef = useRef(false);
  // Fix (21 sept 2026, confirmado por Joel en Safari/iPhone: el mensaje se
  // transcribía y mandaba bien, pero la caja de texto se quedaba con el
  // mismo texto "atascado" como si hubiera que reenviarlo). Safari a veces
  // dispara onresult UNA VEZ MÁS después de haber marcado el resultado
  // como final y de llamar recognitionRef.current?.stop() — esa segunda
  // vuelta repetía setInput(transcript) (repoblando la caja) y volvía a
  // llamar a send(), que esta vez salía temprano por el guard `loading`
  // (la primera llamada a send() ya lo había puesto en true) SIN llegar a
  // limpiar el input. Esta bandera se pone en true en cuanto se procesa el
  // primer resultado final de la sesión, y onresult la revisa de primero
  // para ignorar cualquier evento tardío/duplicado — se resetea a false
  // cada vez que arranca una sesión nueva de reconocimiento.
  const resultadoFinalProcesadoRef = useRef(false);
  // send() se redefine en cada render (lee input/pendingImage/conversationId
  // por closure) — el listener de reconocimiento de voz se arma UNA sola vez
  // (useEffect con deps []), así que sin este ref quedaría pegado para
  // siempre a la versión de send() del primer render (conversationId
  // siempre null, loading siempre false). sendRef siempre apunta a la
  // versión más reciente; sendStable es una identidad fija para pasar como
  // prop a componentes memoizados sin romper el memo().
  const sendRef = useRef<(text?: string, opts?: { hidden?: boolean }) => Promise<void>>(async () => {});
  const sendStable = useCallback((text?: string, opts?: { hidden?: boolean }) => {
    sendRef.current(text, opts);
  }, []);

  // Continuidad real entre dispositivos: al montar, trae la conversación
  // más reciente del usuario desde el servidor (no solo lo que haya en
  // localStorage de ESTE navegador) — así si empezaste en el celular y
  // sigues en desktop, VICTOR se ve tal como quedó, no en blanco.
  useEffect(() => {
    if (bloqueado) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setConversationId(saved);

    fetch("/api/victor")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.conversationId) return;
        setConversationId(data.conversationId);
        window.localStorage.setItem(STORAGE_KEY, data.conversationId);
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {
        // Sin conexión o error puntual — el chat sigue funcionando, solo
        // arranca sin el historial visual hasta el próximo mensaje.
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Devuelve el cursor a la caja de texto en cuanto VICTOR termina de
  // responder (o al abrir el panel) — sin esto, el usuario tenía que
  // hacer clic de nuevo cada vez para seguir escribiendo.
  useEffect(() => {
    if (!loading && open) inputRef.current?.focus();
  }, [loading, open]);

  // Bug real (23 agosto 2026, reportado por Joel): la caja de escribir era
  // un <input> de una sola línea — un mensaje largo se corría hacia la
  // derecha en vez de bajar de línea, así que para editarlo había que
  // moverse con las flechas a ciegas. Ahora es un <textarea> que crece
  // solo (hasta un tope, luego hace scroll adentro) cada vez que cambia el
  // contenido — cubre escribir, pegar, dictado por voz, y borrar todo a la
  // vez sin tener que tocar cada punto donde se llama setInput().
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // VICTOR se queda abierto sin importar dónde toque el usuario en el
  // dashboard (antes se cerraba solo al hacer clic afuera — quitado a
  // propósito). Solo se minimiza si el usuario toca el botón "−" o el FAB.

  // El pill de VICTOR en el topbar (topbar.tsx) dispara este evento al
  // tocarlo, en vez de necesitar que el estado `open` viva en un ancestro
  // común — así el topbar puede abrir el chat sin acoplarse a este
  // componente. Es el reemplazo de la campanita: en vez de una lista de
  // notificaciones aparte, tocar el pill te trae directo a hablar con
  // VICTOR, que es donde de verdad están las alertas.
  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener("victor:abrir", handler);
    return () => window.removeEventListener("victor:abrir", handler);
  }, []);

  // VICTOR toma la iniciativa: si el usuario acaba de crear su cuenta y
  // todavía no pasó por el onboarding conversacional (Capa 2), el panel se
  // abre solo y le manda a VICTOR una señal técnica invisible para que
  // arranque él mismo — el usuario nunca ve "[INICIO_AUTOMATICO]" en pantalla.
  const triggeredRef = useRef(false);
  useEffect(() => {
    // Un usuario 'gratis' no tiene acceso al chat todavía — no tiene
    // sentido dispararle el onboarding conversacional de VICTOR antes de
    // que pague. Se dispara en cuanto suba a Core (el layout deja de
    // mandar bloqueado=true en la próxima carga).
    if (bloqueado) return;
    if (autoOpenOnboarding && !triggeredRef.current) {
      triggeredRef.current = true;
      setOpen(true);
      send(ONBOARDING_TRIGGER, { hidden: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenOnboarding, bloqueado]);

  // Mismo patrón, para el saludo proactivo diario (después de que el
  // onboarding ya pasó): VICTOR se abre solo la primera vez que el usuario
  // entra al dashboard cada día y le manda una señal técnica invisible
  // — el usuario nunca ve "[SALUDO_DIARIO]" en pantalla, solo la respuesta
  // cálida de VICTOR. Nunca se dispara junto con el onboarding (el server
  // ya los manda como mutuamente excluyentes), pero el chequeo de
  // !autoOpenOnboarding es una segunda capa de seguridad por si acaso.
  const saludoTriggeredRef = useRef(false);
  useEffect(() => {
    if (bloqueado) return;
    if (autoOpenSaludoDiario && !autoOpenOnboarding && !saludoTriggeredRef.current) {
      saludoTriggeredRef.current = true;
      setOpen(true);
      send(SALUDO_DIARIO_TRIGGER, { hidden: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenSaludoDiario, autoOpenOnboarding, bloqueado]);

  // Dictado por voz — Web Speech API, nativo del navegador (Chrome/Edge).
  // Pensado para cuando el usuario está manejando o simplemente no quiere
  // escribir: toca el micrófono, habla, y en cuanto termina se manda solo.
  //
  // Fix (21 sept 2026, reportado por Joel: "se activa pero una vez digo lo
  // que quiero no puedo enviarlo, se queda grabando y no lo envía"). Con
  // interimResults=false, el usuario no veía NADA en pantalla hasta que el
  // navegador confirmara un resultado final — en un PWA instalado en
  // Android, ese evento final (onresult/onend) a veces nunca llega aunque
  // el micrófono sí captó el audio, dejando "listening" pegado en true para
  // siempre sin ningún error. Dos cambios:
  //   1. interimResults=true — el texto va apareciendo en la caja MIENTRAS
  //      habla (como en cualquier dictado real), así que aunque el evento
  //      final nunca llegue, el usuario YA tiene su texto en el input y
  //      puede tocar Enviar él mismo en vez de quedar atascado.
  //   2. Un timeout de seguridad (voiceTimeoutRef) que apaga el micrófono
  //      solo a los 12s si no ha pasado nada — antes esto podía quedarse
  //      "grabando" indefinidamente sin ninguna salida.
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setVoiceSupported(true);

    const recognition = new SpeechRecognition();
    // Reversión (21 sept 2026, confirmado por Joel en iPhone: llevaba MESES
    // funcionando bien con "es-PR" en la app instalada — dejó de enviar el
    // mensaje hace ~3 días (root cause real: el bug de sendRef, ya
    // arreglado), no por el idioma. El cambio a "es-US" se hizo el mismo
    // día basado en una hipótesis de Android que no aplicaba a su teléfono
    // (es iPhone) y coincide justo con la aparición del error
    // "audio-capture" que no existía antes. Se revierte a "es-PR", el
    // valor que sí estaba confirmado funcionando en su celular por meses.
    // Si en el futuro se confirma un problema real de idioma en Android,
    // hay que resolverlo sin tocar el valor que funciona en iOS.
    recognition.lang = "es-PR";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    function limpiarTimeoutVoz() {
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Todo el cuerpo envuelto en try/catch — si algo de esto llegara a
      // lanzar (ej. un evento con forma inesperada en algún Android raro),
      // antes se perdía como excepción sin atrapar dentro de un callback
      // del navegador, lo cual en un PWA instalado puede tumbar la sesión
      // en vez de solo fallar en pantalla. Con el try/catch, en el peor
      // caso se apaga el micrófono con un mensaje — nunca se cae la app.
      try {
        // Un evento tardío/duplicado después del resultado final (ver
        // comentario en resultadoFinalProcesadoRef más arriba) se ignora
        // por completo — ni repuebla el input ni vuelve a intentar enviar.
        if (resultadoFinalProcesadoRef.current) return;
        // Reinicia el tope de seguridad cada vez que llega algo nuevo —
        // solo se apaga solo si de verdad se quedó en silencio total.
        limpiarTimeoutVoz();
        const resultado = event.results[event.results.length - 1];
        const transcript = resultado[0].transcript;
        setInput(transcript);
        if (resultado.isFinal) {
          if (transcript.trim()) {
            resultadoFinalProcesadoRef.current = true;
            recognitionRef.current?.stop();
            sendRef.current(transcript.trim());
            // Red de seguridad extra (21 sept 2026, reportado por Joel
            // TAMBIÉN en la app instalada de iPhone, no solo en Safari — el
            // guard de resultadoFinalProcesadoRef de arriba debería bastar,
            // pero el síntoma persiste ahí, así que además de esa bandera
            // se limpia el input a la fuerza medio segundo después de
            // enviar. send() ya lo limpia de inmediato — este golpe extra
            // solo entra en acción si algo (que sea lo que sea, en esa
            // plataforma) lo repuebla después. No hace daño si no hay nada
            // que limpiar.
            setTimeout(() => setInput(""), 500);
          }
        } else {
          // Todavía hablando — vuelve a armar el tope de seguridad.
          voiceTimeoutRef.current = setTimeout(() => recognitionRef.current?.stop(), 12000);
        }
      } catch {
        limpiarTimeoutVoz();
        recognitionRef.current?.stop();
        setListening(false);
        setError("Hubo un problema procesando el dictado. Inténtalo de nuevo.");
      }
    };
    // Antes esto solo apagaba "listening" sin decir nada — para el usuario
    // se sentía como "el micrófono no sirve" sin ninguna pista de por qué
    // (28 agosto 2026, reportado por Joel). La causa más común en un PWA
    // instalado es que el permiso de micrófono nunca se concedió para esa
    // instalación específica (es un permiso aparte del navegador normal) —
    // ahora se lo decimos explícitamente en vez de fallar en silencio.
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      limpiarTimeoutVoz();
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("VICTOR no tiene permiso para usar el micrófono. Revisa los permisos de la app en Ajustes del celular y vuelve a intentar.");
      } else if (event.error === "no-speech") {
        setError("No se escuchó nada — inténtalo de nuevo, más cerca del micrófono.");
      } else if (event.error === "network") {
        setError("El dictado por voz necesita conexión a internet — revisa tu señal e inténtalo de nuevo.");
      } else if (event.error === "language-not-supported") {
        setError("Este celular no tiene instalado el paquete de voz en español. Prueba escribiendo el mensaje.");
      } else if (event.error === "audio-capture") {
        // Fix (21 sept 2026, reportado por Joel: ya no tumba la app, pero
        // sale este error justo al hablar). Causa probable: toggleVoice
        // suelta el stream de getUserMedia y arranca SpeechRecognition casi
        // en el mismo instante — en algunos Android el hardware de audio
        // tarda un pelín en liberarse, y esa carrera hace que
        // SpeechRecognition no consiga el micrófono la primera vez. Se
        // reintenta una sola vez, solo — si vuelve a fallar, ahí sí es un
        // problema real (otra app usando el mic, o hardware no disponible).
        if (!audioCaptureRetryRef.current) {
          audioCaptureRetryRef.current = true;
          setTimeout(() => iniciarReconocimiento(), 400);
        } else {
          setError("No se pudo acceder al micrófono — puede que otra app lo esté usando ahora mismo. Ciérrala e inténtalo de nuevo.");
        }
      } else if (event.error !== "aborted") {
        // Incluye el código real (event.error) en el mensaje — mientras no
        // sepamos cuál de los errores restantes del spec (audio-capture,
        // language-not-supported, bad-grammar, etc.) es el que está
        // pasando de verdad, este texto es la única forma de verlo sin
        // acceso remoto a la consola del celular de Joel.
        setError(`No se pudo usar el micrófono ahora mismo (error: ${event.error}). Inténtalo de nuevo.`);
      }
    };
    recognition.onend = () => {
      limpiarTimeoutVoz();
      setListening(false);
    };

    recognitionRef.current = recognition;
    return () => limpiarTimeoutVoz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cámara / adjuntar archivo del teléfono (21 sept 2026, pedido de Joel:
  // "si se le puede agregar una camara y para descargar archivos del
  // telefono por si le tengo que enviar una foto de un recibo o algo que
  // el usuario no entienda y le preg a victor"; menú "+" rediseñado el
  // mismo día a pedido de Joel para que tomar foto y elegir de galería
  // sean dos opciones explícitas, como en Gemini). Mismo mecanismo que ya
  // usa el paste de Ctrl+V más abajo (dataUrl para la vista previa, base64
  // puro para mandarle a Claude) — reusa el mismo estado pendingImage, así
  // que no hace falta tocar send() para nada. Un solo handler sirve para
  // los dos <input type="file"> del menú (fileInputRef y cameraInputRef,
  // ver JSX) — lo único que cambia entre ellos es el atributo `capture`.
  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo dos veces seguidas
    if (!file) return;
    if (!IMAGE_MEDIA_TYPES_ACEPTADOS.includes(file.type)) {
      setError("Ese tipo de imagen no es compatible — prueba con un PNG, JPG, WEBP o GIF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      const base64 = resultado.split(",")[1] || "";
      setPendingImage({ dataUrl: resultado, base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
  }

  // Arranca (o reintenta arrancar) el reconocimiento — separado de
  // toggleVoice para que el reintento automático de "audio-capture" (ver
  // onerror más arriba) pueda llamarlo directo, sin repetir el
  // getUserMedia de permiso cada vez.
  function iniciarReconocimiento() {
    try {
      resultadoFinalProcesadoRef.current = false;
      recognitionRef.current?.start();
      setListening(true);
      // Tope de seguridad inicial — si nunca llega ni un solo resultado
      // interino (el caso más raro y más frustrante: "se queda grabando y
      // no pasa nada"), esto lo apaga solo a los 12s en vez de dejarlo
      // pegado para siempre.
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = setTimeout(() => recognitionRef.current?.stop(), 12000);
    } catch {
      // .start() puede lanzar de una vez (no async) si ya había una
      // sesión de reconocimiento activa (ej. doble toque rápido) — el
      // onerror de arriba no se dispara en ese caso porque nunca llegó
      // a arrancar, así que hay que atraparlo aquí también.
      setListening(false);
      setError("No se pudo activar el micrófono. Inténtalo de nuevo.");
    }
  }

  async function toggleVoice() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setOpen(true);
    setError(null);
    audioCaptureRetryRef.current = false;

    // Reversión (21 sept 2026, confirmado por Joel en iPhone/Safari instalado
    // como app: con el atajo de "saltar getUserMedia si el permiso ya está
    // concedido" que se probó hoy, el micrófono dejó de funcionar del todo
    // en la app instalada — "audio-capture" en cada intento. En iOS,
    // getUserMedia no es solo para pedir permiso: también abre el canal de
    // audio que SpeechRecognition necesita para poder grabar, así que
    // saltárselo rompe el reconocimiento aunque el permiso ya esté dado.
    // De vuelta al comportamiento previo (confirmado por Joel: sí grababa y
    // transcribía bien, solo hacía falta el fix de sendRef para que
    // enviara) — se pide el micrófono en cada toque del botón, sin atajos.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        // Pausa corta antes de arrancar SpeechRecognition — solo se llega
        // aquí quando de verdad se acaba de pedir el permiso por primera
        // vez, así que este pequeño respiro (y no un vaivén constante) es
        // seguro y no afecta el uso normal del día a día.
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          setError("VICTOR no tiene permiso para usar el micrófono. Revisa los permisos de la app en Ajustes del celular y vuelve a intentar.");
        } else if (err instanceof DOMException && err.name === "NotFoundError") {
          setError("No se encontró un micrófono disponible en este dispositivo.");
        } else {
          setError("No se pudo activar el micrófono. Inténtalo de nuevo.");
        }
        return;
      }
    }

    iniciarReconocimiento();
  }

  async function send(text?: string, opts?: { hidden?: boolean }) {
    if (bloqueado) return;
    const content = (text ?? input).trim();
    // Con una imagen pegada, un mensaje sin texto es válido (igual que
    // pegar una foto sola en cualquier chat de IA) — antes esto se
    // bloqueaba porque solo se revisaba `content`.
    const imagenAEnviar = pendingImage;
    if ((!content && !imagenAEnviar) || loading) return;

    setError(null);
    setInput("");
    setPendingImage(null);
    if (!opts?.hidden) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: content || "Analiza esta imagen.", imageDataUrl: imagenAEnviar?.dataUrl },
      ]);
    }
    setLoading(true);

    try {
      const res = await fetch("/api/victor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId,
          ...(imagenAEnviar ? { imageBase64: imagenAEnviar.base64, imageMediaType: imagenAEnviar.mediaType } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Algo salió mal.");
      }

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        window.localStorage.setItem(STORAGE_KEY, data.conversationId);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

      // VICTOR ejecutó algo de verdad este turno (categorizar, crear cita,
      // actualizar meta, etc.) — refresca la pantalla actual ahora mismo en
      // vez de esperar los 30 minutos del auto-refresh (bug real reportado
      // por Joel, 29 agosto 2026: saldó una tarjeta por el chat y el cambio
      // no se veía en Gastos hasta recargar a mano). router.refresh() solo
      // vuelve a pedir los datos de Supabase de esta ruta, no pierde el
      // chat ni el estado de la pantalla.
      if (data.huboAccion) {
        router.refresh();
        // router.refresh() solo re-renderiza Server Components — no le
        // llega a secciones que traen sus propios datos por su cuenta con
        // fetch() dentro de un useEffect que ya corrió (ej. CuentasManuales
        // en /dashboard/cuentas). Bug real (29 agosto 2026, reportado por
        // Joel): creó una cuenta manual (Coinbase) desde el chat estando
        // parado en Cuentas — no apareció ahí hasta que salió a Home y
        // volvió (eso remonta el componente, disparando su fetch de
        // nuevo). Este evento le avisa a esas secciones "algo cambió,
        // vuelve a pedir tus datos" sin que el usuario tenga que navegar
        // para forzar el remount — ver el listener en cuentas-manuales.tsx.
        window.dispatchEvent(new Event("victor:accion"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "VICTOR no pudo responder.");
    } finally {
      setLoading(false);
    }
  }

  // Mantiene sendRef apuntando siempre a la versión más reciente de send()
  // (ver el comentario junto a la declaración de sendRef más arriba) — sin
  // este efecto, sendRef.current se quedaba en el no-op inicial y el
  // dictado por voz nunca mandaba nada de verdad.
  useEffect(() => {
    sendRef.current = send;
  });

  return (
    <>
      {/* Botón flotante — visible siempre, por encima de la barra inferior.
          Alterna abrir/minimizar el panel (icono cambia a "−" cuando está abierto). */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Minimizar chat con VICTOR" : "Abrir chat con VICTOR"}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg"
        // bottom usa env(safe-area-inset-bottom) en vez de la clase
        // bottom-24 fija — así el botón no queda pegado a la barra de
        // gestos del celular (bug real reportado por Joel, 28 agosto 2026:
        // "la pantalla se desajusta").
        style={{ background: "#1D9E75", bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        {open ? (
          <i className="ti ti-minus" style={{ fontSize: 22, color: "#fff" }} />
        ) : (
          // Fondo blanco explícito — el ícono de VICTOR es un PNG con la
          // línea de la cara en el mismo verde del botón (#1D9E75). Sin un
          // fondo que contraste, la cara queda invisible sobre sí misma
          // (bug real reportado por Joel: se veía "verde sólido, casi sin
          // cara"). El header y los avatares del chat ya usaban fondo
          // blanco por esto mismo — aquí faltaba.
          <img
            src={VICTOR_AVATAR}
            alt="VICTOR"
            className="h-full w-full object-cover"
            style={{ background: "#fff" }}
          />
        )}
      </button>

      {open && (
        <div
          className="fixed right-4 z-50 flex max-h-[70dvh] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          // Mismo ajuste que el botón flotante (safe-area-inset-bottom), y
          // max-h-[70dvh] en vez de 70vh — dvh (dynamic viewport height) se
          // recalcula cuando el teclado del celular aparece/desaparece al
          // abrir el chat; 100vh clásico en Safari/PWA no lo hace, y eso
          // era parte del "desajuste" que reportó Joel al abrir/cerrar.
          style={{ bottom: "calc(168px + env(safe-area-inset-bottom))" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ background: "#1D9E75" }}>
            <img
              src={VICTOR_AVATAR}
              alt="VICTOR"
              className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              style={{ background: "#fff" }}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">VICTOR</p>
              <p className="text-xs text-white/75">
                {bloqueado ? "Desbloquéalo con Core" : "Tu CFO personal · siempre disponible"}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              title="Minimizar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white"
            >
              <i className="ti ti-minus" />
            </button>
          </div>

          {bloqueado ? (
            // Plan gratis: no llamamos /api/victor para nada — en vez de un
            // chat vacío o un error, se ofrece el upgrade directo, con el
            // precio correcto ($12.99 referido / $14.99 normal) ya resuelto
            // en layout.tsx desde users.referred_by.
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              <img
                src={VICTOR_AVATAR}
                alt="VICTOR"
                className="mx-auto h-14 w-14 rounded-full object-cover"
                style={{ background: "#fff" }}
              />
              <p className="text-center text-sm font-medium text-text">Hablar con VICTOR es parte de Core</p>
              <p className="text-center text-xs text-muted">
                Analiza tus gastos, arma tu plan y contesta lo que sea de tu plata, 24/7 — se activa con Core.
              </p>
              <div className="rounded-lg border border-teal bg-teal/[.06] p-3 text-center">
                <p className="text-2xl font-semibold text-teal">
                  ${precioUpgrade}
                  <span className="text-sm font-normal">/mes</span>
                </p>
                {esReferido && <p className="text-xs font-medium text-teal">Primer mes gratis</p>}
                <p className="text-xs text-muted">Cancela cuando quieras</p>
              </div>
              {upgradeError && <p className="text-center text-xs text-red">{upgradeError}</p>}
              <button onClick={activarCore} className="vc-btn-primary" disabled={upgradeLoading}>
                {upgradeLoading
                  ? "Conectando con Stripe..."
                  : esReferido
                    ? `Activar Core — primer mes gratis`
                    : `Activar Core — $${precioUpgrade}/mes`}
              </button>
              {/* Sin Core, este usuario no tiene a VICTOR para preguntarle
                  nada (30 agosto 2026, pedido de Joel) — que no se sienta
                  solo: le dejamos una salida directa a soporte humano justo
                  aquí, donde normalmente le hablaría a VICTOR. */}
              <a
                href="mailto:soporte@westcapitalventuresllc.com"
                className="text-center text-xs text-muted underline"
              >
                ¿Tienes una pregunta o un problema? Escríbenos directamente
              </a>
            </div>
          ) : (
            <>
          {/* Mensajes — componente aparte y memoizado, ver PanelMensajes arriba */}
          <PanelMensajes
            scrollRef={scrollRef}
            messages={messages}
            loading={loading}
            error={error}
            avatar={VICTOR_AVATAR}
            onSugerencia={sendStable}
          />

          {/* Input */}
          <div className="relative flex flex-col gap-2 border-t border-border bg-card p-3">
            {pendingImage && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-bg p-1.5">
                <img src={pendingImage.dataUrl} alt="Imagen lista para enviar" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />
                <span className="flex-1 text-xs text-muted">Imagen lista — escribe algo o envíala así</span>
                <button
                  onClick={() => setPendingImage(null)}
                  title="Quitar imagen"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted hover:bg-border"
                >
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              </div>
            )}
            <div className="relative flex items-end gap-2">
            {/* Fix (21 sept 2026, pedido de Joel comparando con el screenshot
                de Gemini: ahí los botones +/mic/enviar se quedan pegados
                ABAJO mientras el texto crece hacia arriba por encima de
                ellos — nunca se tapan). Sin items-end, el flex por defecto
                (align-items: stretch) deja los botones pegados ARRIBA de la
                fila apenas el <textarea> crece a dos o más líneas, mientras
                la caja de texto sigue estirándose hacia abajo por debajo de
                ellos — se veía roto. items-end alinea todos los hijos de
                esta fila (los botones Y el textarea) contra el borde
                inferior, así que crezca lo que crezca el texto, los botones
                siempre quedan a la misma altura abajo. */}
            {/* Selector de emojis quitado (21 sept 2026, pedido de Joel: "el
                teclado ya los tiene y queda muy poco espacio para
                escribir") — el teclado nativo del celular ya trae su
                propio selector de emojis, así que este era redundante y le
                comía ancho a la caja de texto en una pantalla chiquita. */}
            {/* Botón "+" con menú desplegable (21 sept 2026, pedido de Joel:
                "queria un boton asi como el de gemini una + y se desplegara
                lo que uno queria"). Dos inputs ocultos en vez de uno: antes
                un solo <input type="file"> sin `capture` dejaba que el
                picker nativo del celular decidiera si ofrecía cámara o
                galería (no siempre las dos) — ahora cada opción del menú
                apunta a su propio input, así "Tomar foto" SIEMPRE abre la
                cámara (capture="environment") y "Elegir foto" SIEMPRE abre
                la galería, sin depender de lo que el navegador decida. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelected}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              capture="environment"
              className="hidden"
              onChange={handleFileSelected}
            />
            {showAdjuntar && (
              <>
                {/* Capa invisible para cerrar el menú al tocar afuera,
                    igual que el resto de los menús de la app. */}
                <div className="fixed inset-0 z-[55]" onClick={() => setShowAdjuntar(false)} />
                <div className="absolute bottom-[52px] left-3 z-[60] w-[190px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                  <button
                    onClick={() => {
                      setShowAdjuntar(false);
                      cameraInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text hover:bg-bg"
                  >
                    <i className="ti ti-camera" style={{ fontSize: 16, color: "#1D9E75" }} />
                    Tomar foto
                  </button>
                  <button
                    onClick={() => {
                      setShowAdjuntar(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-sm text-text hover:bg-bg"
                  >
                    <i className="ti ti-photo" style={{ fontSize: 16, color: "#1D9E75" }} />
                    Elegir foto
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setShowAdjuntar((v) => !v)}
              title="Adjuntar"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
              style={
                showAdjuntar
                  ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
                  : { background: "rgba(29,158,117,.1)", borderColor: "#1D9E75", color: "#1D9E75" }
              }
            >
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
            </button>
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                title="Hablarle a VICTOR"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
                style={
                  listening
                    ? { background: "#cf222e", borderColor: "#cf222e", color: "#fff" }
                    : { background: "rgba(29,158,117,.1)", borderColor: "#1D9E75", color: "#1D9E75" }
                }
              >
                <i className={`ti ${listening ? "ti-player-stop-filled" : "ti-microphone"}`} style={{ fontSize: 16 }} />
              </button>
            )}
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  // Un screenshot pegado (Ctrl+V) nunca llega como texto —
                  // un <textarea> normal no acepta imágenes, así que sin
                  // esto no pasaba NADA (bug real reportado por Joel, 5
                  // sept 2026: "el chat no deja pegar", que resultó ser
                  // justo esto). Si el portapapeles trae una imagen, la
                  // interceptamos y la mandamos como adjunto en vez de
                  // dejar que el navegador intente (y falle en silencio)
                  // pegarla como texto. Si es texto normal, no se hace
                  // nada aquí y el pegado sigue su curso normal.
                  const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
                  if (!item) return;
                  if (!IMAGE_MEDIA_TYPES_ACEPTADOS.includes(item.type)) {
                    e.preventDefault();
                    setError("Ese tipo de imagen no es compatible — prueba con un PNG, JPG, WEBP o GIF.");
                    return;
                  }
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const resultado = reader.result as string;
                    const base64 = resultado.split(",")[1] || "";
                    setPendingImage({ dataUrl: resultado, base64, mediaType: file.type });
                  };
                  reader.readAsDataURL(file);
                }}
                placeholder={listening ? "Escuchando…" : "Pregúntale a VICTOR..."}
                className="vc-input w-full resize-none rounded-2xl leading-snug"
                style={{ maxHeight: 120, overflowY: "auto" }}
                disabled={loading}
              />
              {listening && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-bg">
                  <div className="vc-wave">
                    <span className="vc-wave-bar" />
                    <span className="vc-wave-bar" />
                    <span className="vc-wave-bar" />
                    <span className="vc-wave-bar" />
                    <span className="vc-wave-bar" />
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => send()}
              disabled={loading || (!input.trim() && !pendingImage)}
              title="Enviar mensaje"
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border ${
                listening ? "vc-send-listening" : ""
              }`}
              style={
                input.trim() || pendingImage
                  ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
                  : { background: "rgba(29,158,117,.1)", borderColor: "#1D9E75", color: "#1D9E75" }
              }
            >
              <i className="ti ti-send" style={{ fontSize: 16 }} />
            </button>
            </div>
          </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
