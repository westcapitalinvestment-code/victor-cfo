"use client";

import { useState } from "react";
import Link from "next/link";

// Página pública de aplicación al Programa de Socios (CPAs/influencers,
// migración 0070, 5 sept 2026) — sin sesión, cualquiera en PR la puede
// llenar. Nace en estado='pendiente' vía POST /api/socios; Joel aprueba a
// mano desde el Dashboard de Operaciones, y solo AHÍ se genera el código
// corto que el socio va a compartir (ver app/api/socios/[id]/route.ts) —
// nadie puede compartir un link de una solicitud todavía sin revisar.
export default function SociosPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<"cpa" | "influencer" | "otro">("otro");
  const [comoPromociona, setComoPromociona] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      setError("Completa tu nombre y email para continuar.");
      return;
    }
    if (!aceptaTerminos) {
      setError("Tienes que aceptar los Términos del Programa de Socios para continuar.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/socios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        tipo,
        comoPromociona: comoPromociona.trim() || null,
        aceptaTerminos,
      }),
    });
    const json = await res.json().catch(() => null);
    setLoading(false);

    if (res.ok) {
      setEnviado(true);
    } else {
      setError(json?.error || "No se pudo enviar tu solicitud. Intenta de nuevo.");
    }
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">¡Solicitud enviada!</p>
            <p className="text-xs text-muted">
              Recibimos tu información. Te vamos a contactar por email en los próximos días para confirmar tu código
              de socio y explicarte cómo funciona el pago de comisiones.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={enviar} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Sé Embajador o Afiliado de VICTOR CFO</h1>
          <p className="mb-1 text-xs text-muted">
            Gana una comisión en efectivo real por cada cliente que traigas a VICTOR CFO — sin límite, mientras
            más traigas, más ganas. No hace falta ser CPA, contador, o influencer: si tienes una red de
            contactos en Puerto Rico y ganas de promocionarlo activamente, completa el formulario y te
            contactamos directamente para darte los detalles del programa.
          </p>

          <div className="mb-1 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setTipo("cpa")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "cpa" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              CPA / Contador
            </button>
            <button
              type="button"
              onClick={() => setTipo("influencer")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "influencer" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Influencer
            </button>
            <button
              type="button"
              onClick={() => setTipo("otro")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "otro" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Otro
            </button>
          </div>

          <input
            className="vc-input"
            type="text"
            placeholder="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          <input
            className="vc-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="vc-input"
            type="tel"
            placeholder="Teléfono (opcional)"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
          <textarea
            className="vc-input"
            placeholder="¿Cómo planeas promocionarlo? Sé específico: por qué canal (clientes de tu práctica, tus redes, tu círculo de negocios), a cuántas personas aproximadamente puedes alcanzar, y con qué frecuencia."
            rows={3}
            value={comoPromociona}
            onChange={(e) => setComoPromociona(e.target.value)}
            required
          />

          <label className="flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              Acepto los{" "}
              <Link href="/socios/terminos" target="_blank" className="font-medium text-teal">
                Términos del Programa de Socios
              </Link>
              .
            </span>
          </label>

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !aceptaTerminos}>
            {loading ? "Enviando..." : "Enviar solicitud"}
          </button>

          <p className="mt-1 text-center text-xs text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-teal">
              Entra aquí
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
