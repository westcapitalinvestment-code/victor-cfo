"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Encuesta pública de cancelación (27 sept 2026, pedido de Joel: "opciones
// que pueda marcar y enviar y una caja de comentario" — reemplaza el
// primer intento de pedir "responde este correo", que confundía porque el
// correo SÍ suena a encuesta). Llega desde el link del correo de
// sendCancellationWinbackEmail (lib/email.ts) con un token de un solo uso
// (?t=...) — sin login, porque para cuando llega aquí la cuenta ya está
// cancelada y el usuario no tiene por qué volver a entrar solo para esto.
//
// Las razones (value) son EXACTAMENTE las mismas que usa el Cancellation
// Flow nativo de Stripe (subscription.cancellation_details.reason) y que
// ya traduce app/dashboard/cfo/page.tsx (RAZON_CANCELACION_LABEL) — así
// el Dashboard de Operaciones muestra esto sin necesitar ningún cambio
// aparte de partir la lista por coma (ver ese archivo).
const RAZONES: { value: string; label: string }[] = [
  { value: "too_expensive", label: "Era muy caro para lo que usaba" },
  { value: "unused", label: "No lo usé lo suficiente / se me olvidó" },
  { value: "missing_features", label: "Le faltaban funciones que necesitaba" },
  { value: "switched_service", label: "Me cambié a otra opción" },
  { value: "too_complex", label: "Se me hizo complicado de usar" },
  { value: "customer_service", label: "El servicio al cliente no fue bueno" },
  { value: "low_quality", label: "Algo no funcionó bien / tuve problemas técnicos" },
  { value: "other", label: "Otra razón" },
];

function EncuestaCancelacion() {
  const params = useSearchParams();
  const token = params.get("t") || "";

  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setMarcadas((cur) => {
      const nuevo = new Set(cur);
      if (nuevo.has(value)) nuevo.delete(value);
      else nuevo.add(value);
      return nuevo;
    });
  }

  async function enviar() {
    if (marcadas.size === 0 && !comentario.trim()) {
      setError("Marca al menos una opción o escribe un comentario.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/cancelacion/encuesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, razones: Array.from(marcadas), comentario }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "No se pudo enviar. Intenta de nuevo.");
        setEnviando(false);
        return;
      }
      setEnviado(true);
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <Envoltorio>
        <p style={{ color: "#555" }}>Este link no es válido. Si necesitas contarnos algo, escríbenos a soporte@victorcfo.com.</p>
      </Envoltorio>
    );
  }

  if (enviado) {
    return (
      <Envoltorio>
        <h1 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>Gracias por contarnos</h1>
        <p style={{ color: "#555" }}>
          Tu respuesta ya la vio el equipo de VICTOR CFO. Si quieres volver, revisa el correo que te mandamos — tiene tu código de
          reactivación.
        </p>
      </Envoltorio>
    );
  }

  return (
    <Envoltorio>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>¿Qué te hizo cancelar?</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
        Marca lo que aplique — nos ayuda a mejorar, y lo lee una persona real del equipo.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.25rem" }}>
        {RAZONES.map((r) => (
          <label
            key={r.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.7rem 0.9rem",
              border: `1px solid ${marcadas.has(r.value) ? "#1D9E75" : "#e5e5e5"}`,
              borderRadius: "8px",
              background: marcadas.has(r.value) ? "#eefaf4" : "#fff",
              cursor: "pointer",
              fontSize: "0.92rem",
            }}
          >
            <input type="checkbox" checked={marcadas.has(r.value)} onChange={() => toggle(r.value)} style={{ width: 16, height: 16 }} />
            {r.label}
          </label>
        ))}
      </div>

      <label style={{ display: "block", fontSize: "0.85rem", color: "#555", marginBottom: "0.4rem" }}>
        ¿Algo más que quieras contarnos? (opcional)
      </label>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={4}
        placeholder="Escribe aquí..."
        style={{
          width: "100%",
          padding: "0.7rem 0.9rem",
          border: "1px solid #e5e5e5",
          borderRadius: "8px",
          fontSize: "0.92rem",
          fontFamily: "inherit",
          resize: "vertical",
          marginBottom: "1rem",
        }}
      />

      {error && <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

      <button
        onClick={enviar}
        disabled={enviando}
        style={{
          width: "100%",
          background: "#1D9E75",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "0.8rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: enviando ? "default" : "pointer",
          opacity: enviando ? 0.7 : 1,
        }}
      >
        {enviando ? "Enviando..." : "Enviar"}
      </button>
    </Envoltorio>
  );
}

function Envoltorio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f9fb", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "#fff", borderRadius: 14, padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img src="/victor-avatar.png" width={32} height={32} style={{ borderRadius: "9999px", verticalAlign: "middle" }} alt="VICTOR" />
          <span style={{ fontSize: "1.1rem", fontWeight: 600, verticalAlign: "middle", marginLeft: 8 }}>VICTOR CFO</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EncuestaCancelacion />
    </Suspense>
  );
}
