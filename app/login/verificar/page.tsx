"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Segundo paso del login cuando la cuenta tiene MFA activado (ver
// mfa-config.tsx) — app/login/page.tsx manda para acá después de validar
// la contraseña si supabase.auth.mfa.getAuthenticatorAssuranceLevel()
// dice que falta subir de aal1 a aal2. middleware.ts hace el mismo chequeo
// para que nadie se salte este paso escribiendo /dashboard directo en la
// URL (ver nota ahí).
//
// useSearchParams() obliga a envolver en <Suspense> — mismo patrón que
// app/login/page.tsx.
function VerificarForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [factorId, setFactorId] = useState<string | null>(null);
  const [modo, setModo] = useState<"totp" | "respaldo">("totp");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        router.replace("/login");
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal || aal.currentLevel === aal.nextLevel) {
        // No hay MFA pendiente (o no tiene factor activo) — nada que hacer
        // aquí, seguimos derecho.
        router.replace(next);
        return;
      }
      const { data: factores } = await supabase.auth.mfa.listFactors();
      const factor = factores?.totp?.find((f) => f.status === "verified");
      if (!factor) {
        router.replace(next);
        return;
      }
      setFactorId(factor.id);
      setListo(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verificarTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || codigo.length !== 6) return;
    setProcesando(true);
    setError(null);

    const { data: challenge, error: errChallenge } = await supabase.auth.mfa.challenge({ factorId });
    if (errChallenge || !challenge) {
      setProcesando(false);
      setError(errChallenge?.message || "No se pudo verificar el código.");
      return;
    }

    const { error: errVerify } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: codigo });
    if (errVerify) {
      setProcesando(false);
      setError("Ese código no es correcto. Revisa la hora de tu celular e intenta de nuevo.");
      setCodigo("");
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function usarCodigoRespaldo(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim()) return;
    setProcesando(true);
    setError(null);

    const res = await fetch("/api/mfa/backup-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    });
    const json = await res.json().catch(() => null);
    setProcesando(false);

    if (!res.ok) {
      setError(json?.error || "No se pudo verificar el código de respaldo.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  if (!listo) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        {modo === "totp" ? (
          <form onSubmit={verificarTotp} className="vc-card flex flex-col items-center gap-3">
            <h1 className="mb-1 text-base font-medium">Verificación en dos pasos</h1>
            <p className="mb-2 text-center text-xs text-muted">
              Escribe el código de 6 dígitos de tu app de autenticación.
            </p>

            <input
              className="vc-input w-40 text-center text-lg tracking-widest"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />

            {error && <p className="text-xs text-red">{error}</p>}

            <button type="submit" className="vc-btn-primary w-full" disabled={procesando || codigo.length !== 6}>
              {procesando ? "Verificando..." : "Entrar"}
            </button>

            <button
              type="button"
              className="text-center text-xs text-muted hover:text-teal"
              onClick={() => {
                setModo("respaldo");
                setCodigo("");
                setError(null);
              }}
            >
              Perdí el acceso — usar código de respaldo
            </button>
          </form>
        ) : (
          <form onSubmit={usarCodigoRespaldo} className="vc-card flex flex-col gap-3">
            <h1 className="mb-1 text-base font-medium">Código de respaldo</h1>
            <p className="mb-2 text-xs text-muted">
              Escribe uno de los 10 códigos que guardaste al activar la verificación en dos pasos. Usarlo la
              desactiva — puedes volver a activarla después desde Configuración.
            </p>

            <input
              className="vc-input text-center font-mono uppercase tracking-widest"
              placeholder="XXXXX-XXXXX"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoFocus
            />

            {error && <p className="text-xs text-red">{error}</p>}

            <button type="submit" className="vc-btn-primary mt-1" disabled={procesando || !codigo.trim()}>
              {procesando ? "Verificando..." : "Entrar"}
            </button>

            <button
              type="button"
              className="text-center text-xs text-muted hover:text-teal"
              onClick={() => {
                setModo("totp");
                setCodigo("");
                setError(null);
              }}
            >
              Volver a usar la app de autenticación
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function VerificarPage() {
  return (
    <Suspense fallback={null}>
      <VerificarForm />
    </Suspense>
  );
}
