"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

// Burbuja flotante de VICTOR en el landing (27 sept 2026, pedido de Joel:
// "podemos poner a Victor en la Landing para responder preguntas?").
// Estilo Intercom: botón fijo abajo a la derecha, abre un panel de chat.
// Llama a /api/victor-landing — endpoint público, sin login, sin acceso a
// datos de ningún usuario real (ver lib/victor/landing-system-prompt.ts).
// El historial vive solo en memoria del navegador (useState) mientras la
// pestaña está abierta — no se guarda en ningún lado.

type Msg = { role: "user" | "assistant"; content: string };

const SALUDO_INICIAL: Msg = {
  role: "assistant",
  content: "¡Hola! Soy VICTOR 👋 Pregúntame lo que quieras sobre cómo funciona la app, los planes o los precios.",
};

export default function LandingVictorBubble() {
  // Abierto por default (pedido de Joel, 27 sept 2026) — que el visitante
  // vea el chat ya desplegado al entrar en vez de tener que buscarlo.
  const [abierto, setAbierto] = useState(true);
  const [mensajes, setMensajes] = useState<Msg[]>([SALUDO_INICIAL]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [mensajes, cargando]);

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || cargando) return;
    setTexto("");
    setError(null);
    const historialPrevio = mensajes.filter((m) => m !== SALUDO_INICIAL);
    const nuevos: Msg[] = [...mensajes, { role: "user", content: mensaje }];
    setMensajes(nuevos);
    setCargando(true);

    try {
      const res = await fetch("/api/victor-landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: mensaje, history: historialPrevio }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "VICTOR no pudo responder. Intenta de nuevo.");
        setCargando(false);
        return;
      }
      setMensajes((cur) => [...cur, { role: "assistant", content: data.reply }]);
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <>
      {abierto && (
        <div className={styles.bubblePanel}>
          <div className={styles.bubblePanelHead}>
            <img src="/victor-avatar.png" alt="VICTOR" className={styles.bubbleAvatarImg} />
            <div style={{ flex: 1 }}>
              <div className={styles.bubblePanelTitle}>VICTOR</div>
              <div className={styles.bubblePanelSub}>Pregúntame sobre el producto</div>
            </div>
            <button
              type="button"
              className={styles.bubbleCloseBtn}
              onClick={() => setAbierto(false)}
              aria-label="Cerrar chat"
            >
              ✕
            </button>
          </div>

          <div className={styles.bubbleBody} ref={bodyRef}>
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? styles.bubbleMsgUser : styles.bubbleMsgVictor}
              >
                {m.content}
              </div>
            ))}
            {cargando && <div className={styles.bubbleMsgVictor}>Escribiendo…</div>}
            {error && <div className={styles.bubbleError}>{error}</div>}
          </div>

          <div className={styles.bubbleInputBar}>
            <input
              className={styles.bubbleInput}
              placeholder="Escribe tu pregunta..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={cargando}
            />
            <button
              type="button"
              className={styles.bubbleSendBtn}
              onClick={enviar}
              disabled={cargando || !texto.trim()}
              aria-label="Enviar"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.bubbleFab}
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? "Cerrar chat de VICTOR" : "Habla con VICTOR"}
      >
        {abierto ? "✕" : <img src="/victor-avatar.png" alt="" className={styles.bubbleFabImg} />}
      </button>
    </>
  );
}
