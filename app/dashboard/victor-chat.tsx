"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
  // Guarda el stream de getUserMedia mientras dura el dictado — ver nota
  // larga en toggleVoice() sobre por qué NO se cierra de inmediato.
  const micStreamRef = useRef<MediaStream | null>(null);

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
    // Antes esto solo apagaba "listening" sin decir nada — para el usuario
    // se sentía como "el micrófono no sirve" sin ninguna pista de por qué
    // (28 agosto 2026, reportado por Joel). La causa más común en un PWA
    // instalado es que el permiso de micrófono nunca se concedió para esa
    // instalación específica (es un permiso aparte del navegador normal) —
    // ahora se lo decimos explícitamente en vez de fallar en silencio.
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      detenerStreamMic();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("VICTOR no tiene permiso para usar el micrófono. Revisa los permisos de la app en Ajustes del celular y vuelve a intentar.");
      } else if (event.error === "no-speech") {
        setError("No se escuchó nada — inténtalo de nuevo, más cerca del micrófono.");
      } else if (event.error === "network") {
        setError("El dictado por voz necesita conexión a internet — revisa tu señal e inténtalo de nuevo.");
      } else if (event.error !== "aborted") {
        setError(`No se pudo usar el micrófono ahora mismo (error: ${event.error}). Inténtalo de nuevo.`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      detenerStreamMic();
    };

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

  // Suelta el micrófono físico que pedimos con getUserMedia — se llama al
  // terminar de escuchar por cualquier vía (usuario para, reconocimiento
  // termina solo, o error) para no dejar el micrófono "prendido" de fondo.
  function detenerStreamMic() {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }

  async function toggleVoice() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      detenerStreamMic();
      return;
    }

    setOpen(true);
    setError(null);

    // Pide el permiso de micrófono nosotros mismos con getUserMedia ANTES
    // de arrancar el reconocimiento — bug real reportado por Joel (28
    // agosto 2026, PWA instalada): dejar que SpeechRecognition pida el
    // permiso por su cuenta terminaba en "audio-capture" sin que el
    // sistema operativo mostrara nunca el diálogo real de "Permitir
    // micrófono".
    //
    // Segunda vuelta del mismo bug (28 agosto 2026): pedir el permiso y
    // CERRAR el stream de inmediato (stream.getTracks().forEach(t =>
    // t.stop())) seguía dando "audio-capture" — Joel confirmó que el error
    // no cambió. Causa real: en Android/Chrome, detener el stream de
    // getUserMedia no libera el hardware de audio al instante; si
    // recognition.start() intenta abrir SU PROPIA captura mientras el
    // sistema todavía está soltando la anterior, choca con "audio-capture".
    // Fix real: NO cerrar el stream — se deja vivo en micStreamRef mientras
    // dura el dictado (así nunca hay una segunda apertura de hardware que
    // compita) y se suelta recién cuando termina de escuchar, en
    // detenerStreamMic() (ver onend/onerror de recognition y el branch de
    // "ya estaba escuchando" arriba).
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
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

    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // .start() puede lanzar de una vez (no async) si ya había una
      // sesión de reconocimiento activa (ej. doble toque rápido) — el
      // onerror de arriba no se dispara en ese caso porque nunca llegó
      // a arrancar, así que hay que atraparlo aquí también.
      setListening(false);
      detenerStreamMic();
      setError("No se pudo activar el micrófono. Inténtalo de nuevo.");
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
       if (data.huboAccion) router.refresh();
      
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
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg"
        style={{ background: "#1D9E75", bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        {open ? (
          <i className="ti ti-minus" style={{ fontSize: 22, color: "#fff" }} />
        ) : (
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
