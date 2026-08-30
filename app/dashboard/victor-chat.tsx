"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "victor_conversation_id";
const ONBOARDING_TRIGGER = "[INICIO_AUTOMATICO]";
const SALUDO_DIARIO_TRIGGER = "[SALUDO_DIARIO]";

const SUGERENCIAS = ["Analizar mis gastos", "Ver mis metas", "Ayúdame con una estrategia"];

const EMOJIS = [
  "😀", "😂", "😊", "😍", "🤔", "😅", "😢", "😭",
  "😮", "🙏", "👍", "👎", "💪", "🙌", "👏", "🤝",
  "❤️", "🔥", "🎉", "✅", "❌", "⚠️", "💰", "💵",
  "💳", "📈", "📉", "🏦", "🏠", "🚗", "😴", "🤷",
];

const VICTOR_AVATAR = "/victor-avatar.png";

export default function VictorChat({
  autoOpenOnboarding = false,
  autoOpenSaludoDiario = false,
  plan = null,
  esReferido = false,
}: {
  autoOpenOnboarding?: boolean;
  autoOpenSaludoDiario?: boolean;
  plan?: string | null;
  esReferido?: boolean;
}) {
  const bloqueado = plan === "gratis";
  const precioUpgrade = esReferido ? "12.99" : "14.99";
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (!loading && open) inputRef.current?.focus();
  }, [loading, open]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener("victor:abrir", handler);
    return () => window.removeEventListener("victor:abrir", handler);
  }, []);

  const triggeredRef = useRef(false);
  useEffect(() => {
    if (bloqueado) return;
    if (autoOpenOnboarding && !triggeredRef.current) {
      triggeredRef.current = true;
      setOpen(true);
      send(ONBOARDING_TRIGGER, { hidden: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenOnboarding, bloqueado]);

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
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
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
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function toggleVoice() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setOpen(true);
    setError(null);

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
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
      setListening(false);
      setError("No se pudo activar el micrófono. Inténtalo de nuevo.");
    }
  }

  async function send(text?: string, opts?: { hidden?: boolean }) {
    if (bloqueado) return;
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

      if (data.huboAccion) {
        router.refresh();
        window.dispatchEvent(new Event("victor:accion"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "VICTOR no pudo responder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
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
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              <img
                src={VICTOR_AVATAR}
                alt="VICTOR"
                className="mx-auto h-14 w-14 rounded-full object-cover"
                style={{ background: "#fff" }}
              />
              <p className="text-center text-sm font-medium text-text">Hablar con VICTOR es parte de Core</p>
              <p className="text-center text-xs text-muted">
                Analiza tus gastos, arma tu plan financiero y habla contigo de tu sutiación 24/7 — Actívalo ahora!
              </p>
              <div className="rounded-lg border border-teal bg-teal/[.06] p-3 text-center">
                <p className="text-2xl font-semibold text-teal">
                  ${precioUpgrade}
                  <span className="text-sm font-normal">/mes</span>
                </p>
                {esReferido && <p className="text-xs text-muted">Precio de referido</p>}
                <p className="text-xs text-muted">Cancela cuando quieras</p>
              </div>
              {upgradeError && <p className="text-center text-xs text-red">{upgradeError}</p>}
              <button onClick={activarCore} className="vc-btn-primary" disabled={upgradeLoading}>
                {upgradeLoading ? "Conectando con Stripe..." : `Activar Core — $${precioUpgrade}/mes`}
              </button>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </>
  );
}
