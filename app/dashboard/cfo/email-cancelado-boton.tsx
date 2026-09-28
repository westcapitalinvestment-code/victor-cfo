"use client";

import { useState } from "react";

// Reemplaza el link mailto del botón "Email" en Cancelados recientes
// (27 sept 2026, pedido de Joel: el mailto abría su correo personal en
// vez de mandar desde soporte@victorcfo.com — "no me gusta"). Abre un
// mini formulario inline (asunto + mensaje) y lo envía de verdad por
// /api/cfo/email-cancelado, que manda desde el servidor con Resend.

const ASUNTO_DEFAULT = "¿Qué te hizo cancelar VICTOR CFO?";

export default function EmailCanceladoBoton({ toEmail, toName }: { toEmail: string; toName: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [asunto, setAsunto] = useState(ASUNTO_DEFAULT);
  const [mensaje, setMensaje] = useState(
    `Hola${toName ? " " + toName : ""},\n\nVi que cancelaste tu cuenta de VICTOR CFO y quería preguntarte directamente qué pasó — ¿hay algo que pudiéramos haber hecho mejor?\n\nSi quieres darle otra oportunidad o tienes alguna duda, aquí estoy.\n\n— Joel`
  );
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | string>("idle");

  async function enviar() {
    if (!asunto.trim() || !mensaje.trim() || estado === "enviando") return;
    setEstado("enviando");
    const res = await fetch("/api/cfo/email-cancelado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toEmail, asunto, mensaje }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado(data?.error || "Error al enviar.");
      return;
    }
    setEstado("enviado");
    setTimeout(() => {
      setAbierto(false);
      setEstado("idle");
    }, 1500);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 rounded-pill border border-teal px-3 py-1.5 text-[11px] font-medium text-teal"
      >
        Email
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-border p-3 text-left">
      <p className="mb-2 text-[11px] text-muted">Para: {toEmail} — de: soporte@victorcfo.com</p>
      <input
        value={asunto}
        onChange={(e) => setAsunto(e.target.value)}
        placeholder="Asunto"
        className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
      />
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={6}
        className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm"
      />
      {typeof estado === "string" && estado !== "idle" && estado !== "enviando" && estado !== "enviado" && (
        <p className="mb-2 text-[11px] text-red">{estado}</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="rounded-pill px-3 py-1.5 text-[11px] text-muted">
          Cancelar
        </button>
        <button
          type="button"
          onClick={enviar}
          disabled={estado === "enviando" || estado === "enviado"}
          className="rounded-pill bg-teal px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
        >
          {estado === "enviando" ? "Enviando..." : estado === "enviado" ? "Enviado ✓" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
