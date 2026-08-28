"use client";

import { useEffect, useRef, useState } from "react";

// "El alma de VICTOR" — botón flotante + panel de chat, disponible en
// cualquier pantalla del dashboard (se monta una sola vez desde el
// layout). Calcado del modal #m-victor-chat de VICTOR — Dashboard Core.html.
// Habla con /api/victor, que es donde vive la llave de Anthropic, el
// system prompt completo, y ahora también sus "manos" (tool use) —
// este componente nunca ve esas cosas, solo manda texto y pinta la respuesta.

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "victor_conversation_id";
const ONBOARDING_TRIGGER = "[INICIO_AUTOMATICO]";
const SALUDO_DIARIO_TRIGGER = "[SALUDO_DIARIO]";

const SUGERENCIAS = ["Analizar mis gastos", "Ver mis metas", "Ayúdame con una estrategia"];

// Selector de emojis simple para el input — igual que en WhatsApp, un
// botón de carita abre una cuadrícula chiquita y cada toque inserta el
// emoji donde esté el cursor. No usamos ninguna librería nueva (el
// usuario pega los archivos a mano en GitHub, sin npm install), así que
// es solo una lista fija de los más comunes en conversaciones de plata.
const EMOJIS = [
  "😀", "😂", "😊", "😍", "🤔", "😅", "😢", "😭",
  "😮", "🙏", "👍", "👎", "💪", "🙌", "👏", "🤝",
  "❤️", "🔥", "🎉", "✅", "❌", "⚠️", "💰", "💵",
  "💳", "📈", "📉", "🏦", "🏠", "🚗", "😴", "🤷",
];

// Logo/cara de VICTOR — el mismo PNG del mockup aprobado (VICTOR — Dashboard
// Core.html), para que el chat real se vea idéntico, no un ícono genérico.
const VICTOR_AVATAR =
  "data:image/png;base64,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";

export default function VictorChat({
  autoOpenOnboarding = false,
  autoOpenSaludoDiario = false,
}: {
  autoOpenOnboarding?: boolean;
  autoOpenSaludoDiario?: boolean;
}) {
  // Por defecto abierto — VICTOR debe sentirse presente e invitar a hablar,
  // no escondido detrás de un botón. Si el usuario lo cierra, se queda
  // cerrado mientras navega (el layout no se remonta entre páginas del
  // dashboard); vuelve a abrirse solo en la próxima carga completa.
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Continuidad real entre dispositivos: al montar, trae la conversación
  // más reciente del usuario desde el servidor (no solo lo que haya en
  // localStorage de ESTE navegador) — así si empezaste en el celular y
  // sigues en desktop, VICTOR se ve tal como quedó, no en blanco.
  useEffect(() => {
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
    ...
  // VICTOR toma la iniciativa: si el usuario acaba de crear su cuenta y
  // todavía no pasó por el onboarding conversacional (Capa 2), el panel se
  // abre solo y le manda a VICTOR una señal técnica invisible para que
  // arranque él mismo — el usuario nunca ve "[INICIO_AUTOMATICO]" en pantalla.
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (autoOpenOnboarding && !triggeredRef.current) {
      triggeredRef.current = true;
      setOpen(true);
      send(ONBOARDING_TRIGGER, { hidden: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenOnboarding]);

  // Mismo patrón, para el saludo proactivo diario (después de que el
  // onboarding ya pasó): VICTOR se abre solo la primera vez que el usuario
  // entra al dashboard cada día y le manda una señal técnica invisible
  // — el usuario nunca ve "[SALUDO_DIARIO]" en pantalla, solo la respuesta
  // cálida de VICTOR. Nunca se dispara junto con el onboarding (el server
  // ya los manda como mutuamente excluyentes), pero el chequeo de
  // !autoOpenOnboarding es una segunda capa de seguridad por si acaso.
  const saludoTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoOpenSaludoDiario && !autoOpenOnboarding && !saludoTriggeredRef.current) {
      saludoTriggeredRef.current = true;
      setOpen(true);
      send(SALUDO_DIARIO_TRIGGER, { hidden: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenSaludoDiario, autoOpenOnboarding]);

  // Dictado por voz — Web Speech API, nativo del navegador (Chrome/Edge).
  // Pensado para cuando el usuario está manejando o simplemente no quiere
  // escribir: toca el micrófono, habla, y en cuanto termina se manda solo.
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setVoiceSupported(true);

    const recognition = new SpeechRecognition();
    recognition.lang = "es-PR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (transcript.trim()) send(transcript.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inserta el emoji justo donde esté el cursor (no solo al final) — así
  // se puede escribir "gracias 🙏 por la ayuda" sin tener que mover el
  // texto a mano. El picker se queda abierto después de escoger uno,
  // igual que en WhatsApp, para poder poner varios seguidos.
  function insertarEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const nuevo = input.slice(0, start) + emoji + input.slice(end);
    setInput(nuevo);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function toggleVoice() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setOpen(true);
      recognitionRef.current.start();
      setListening(true);
    }
  }

  async function send(text?: string, opts?: { hidden?: boolean }) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setError(null);
    setInput("");
    if (!opts?.hidden) {
      setMessages((prev) => [...prev, { role: "user", content }]);
    }
    setLoading(true);

    try {
      const res = await fetch("/api/victor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId }),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "VICTOR no pudo responder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Botón flotante — visible siempre, por encima de la barra inferior.
          Alterna abrir/minimizar el panel (icono cambia a "−" cuando está abierto). */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Minimizar chat con VICTOR" : "Abrir chat con VICTOR"}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg"
        style={{ background: "#1D9E75" }}
      >
        {open ? (
          <i className="ti ti-minus" style={{ fontSize: 22, color: "#fff" }} />
        ) : (
          <img src={VICTOR_AVATAR} alt="VICTOR" className="h-full w-full object-cover" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-[168px] right-4 z-50 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
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
              <p className="text-xs text-white/75">Tu CFO personal · siempre disponible</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              title="Minimizar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white"
            >
              <i className="ti ti-minus" />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ minHeight: 240 }}>
            {messages.length === 0 && !loading && (
              <div className="mb-3 flex items-start gap-2">
                <img src={VICTOR_AVATAR} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
                <div className="rounded-r-[10px] rounded-bl-[10px] border border-border bg-bg p-2.5 text-sm text-text">
                  ¡Hola! Soy VICTOR. Cuéntame qué necesitas — tus gastos, tus metas, o si tienes una
                  idea que quieres evaluar juntos.
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`mb-3 flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <img src={VICTOR_AVATAR} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-[10px] p-2.5 text-sm ${
                    m.role === "user"
                      ? "rounded-br-none text-white"
                      : "rounded-bl-none border border-border bg-bg text-text"
                  }`}
                  style={m.role === "user" ? { background: "#1D9E75" } : undefined}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-3 flex justify-start gap-2">
                <img src={VICTOR_AVATAR} alt="VICTOR" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
                <div className="rounded-[10px] rounded-bl-none border border-border bg-bg p-2.5 text-sm text-muted">
                  VICTOR está escribiendo y analizando…
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red">{error}</p>}

            {messages.length === 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-pill border border-teal px-3 py-1.5 text-xs text-teal"
                    style={{ background: "rgba(29,158,117,.1)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="relative flex gap-2 border-t border-border bg-card p-3">
            {showEmojis && (
              <>
                {/* Capa invisible para cerrar el panel al tocar afuera,
                    igual que el resto de los menús de la app. */}
                <div className="fixed inset-0 z-[55]" onClick={() => setShowEmojis(false)} />
                <div
                  className="absolute bottom-[52px] left-3 z-[60] grid w-[248px] grid-cols-8 gap-1 rounded-xl border border-border bg-card p-2 shadow-2xl"
                >
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => insertarEmoji(e)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-base hover:bg-bg"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => setShowEmojis((v) => !v)}
              title="Insertar emoji"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
              style={
                showEmojis
                  ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
                  : { background: "rgba(29,158,117,.1)", borderColor: "#1D9E75", color: "#1D9E75" }
              }
            >
              <i className="ti ti-mood-smile" style={{ fontSize: 16 }} />
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
              disabled={loading || !input.trim()}
              title="Enviar mensaje"
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border ${
                listening ? "vc-send-listening" : ""
              }`}
              style={
                input.trim()
                  ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
                  : { background: "rgba(29,158,117,.1)", borderColor: "#1D9E75", color: "#1D9E75" }
              }
            >
              <i className="ti ti-send" style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
