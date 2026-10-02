"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Página pública donde un colega invitado por su líder CPA (ej. Josué,
// invitado por Héctor) crea su contraseña o inicia sesión — mirror exacto
// de /cpa/aceptar/[token], pero contra /api/cpa-equipo/aceptar. En cuanto
// acepta, hereda automáticamente todos los clientes activos del líder
// (migración 0137, sync_equipo_cpa) y queda redirigido a /cpa igual que
// cualquier CPA.
export default function AceptarEquipoCpaPage() {
  const router = useRouter();
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : Array.isArray(params?.token) ? params.token[0] : "";
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [errorInvite, setErrorInvite] = useState<string | null>(null);
  const [invite, setInvite] = useState<{
    leadName: string | null;
    leadEmail: string;
    staffName: string | null;
    staffEmail: string;
    status: string;
  } | null>(null);

  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const yaAceptando = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/cpa-equipo/aceptar?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Invitación no encontrada.");
        setInvite(data);
      })
      .catch((err) => setErrorInvite(err instanceof Error ? err.message : "Algo salió mal."))
      .finally(() => setCargando(false));
  }, [token]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !yaAceptando.current) {
        yaAceptando.current = true;
        aceptarInvitacion();
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function aceptarInvitacion() {
    setConectando(true);
    setError(null);
    try {
      const res = await fetch("/api/cpa-equipo/aceptar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo conectar la invitación.");
      router.push("/cpa");
      router.refresh();
    } catch (err) {
      yaAceptando.current = false;
      setConectando(false);
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    }
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setEnviando(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email: invite.staffEmail,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined,
        data: invite.staffName ? { full_name: invite.staffName } : undefined,
      },
    });

    setEnviando(false);

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        setModo("entrar");
        setError("Ya tienes una cuenta de VICTOR con este correo — entra con tu contraseña.");
      } else {
        setError(error.message);
      }
      return;
    }

    if (data.session) {
      return;
    }
    setRevisaCorreo(true);
  }

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email: invite.staffEmail, password });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
  }

  async function handleOlvidoContrasena() {
    if (!invite) return;
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(invite.staffEmail, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setResetEnviado(true);
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted">Cargando invitación...</p>
      </div>
    );
  }

  if (errorInvite || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-1 text-sm font-medium">Este link ya no es válido</p>
            <p className="text-xs text-muted">{errorInvite || "Invitación no encontrada."}</p>
          </div>
        </div>
      </div>
    );
  }

  if (invite.status === "accepted") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Ya aceptaste esta invitación</p>
            <p className="mb-4 text-xs text-muted">Entra con tu correo y contraseña para ver el portal.</p>
            <button className="vc-btn-primary" onClick={() => router.push("/login")}>
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (revisaCorreo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
            <p className="text-xs text-muted">
              Te mandamos un link de confirmación a {invite.staffEmail}. Entra ahí y vuelves directo a este mismo
              link ya conectado — no hace falta hacer nada más.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Equipo CPA
          </span>
        </div>

        <div className="vc-card flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">
              {invite.leadName ? `${invite.leadName} te invitó a su equipo` : `${invite.leadEmail} te invitó a su equipo`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Vas a ver automáticamente los mismos clientes que {invite.leadName || invite.leadEmail} ya tiene en
              VICTOR — acceso de solo lectura, igual que el de {invite.leadName || "él"}.
            </p>
          </div>

          <div className="flex gap-1 rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setModo("crear")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium ${modo === "crear" ? "bg-teal text-white" : "text-muted"}`}
            >
              Crear contraseña
            </button>
            <button
              type="button"
              onClick={() => setModo("entrar")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium ${modo === "entrar" ? "bg-teal text-white" : "text-muted"}`}
            >
              Ya tengo cuenta
            </button>
          </div>

          <form onSubmit={modo === "crear" ? handleCrear : handleEntrar} className="flex flex-col gap-3">
            <input className="vc-input" value={invite.staffEmail} disabled readOnly />
            <input
              className="vc-input"
              type="password"
              placeholder={modo === "crear" ? "Crea una contraseña (mínimo 6 caracteres)" : "Tu contraseña"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <p className="text-xs text-red">{error}</p>}

            <button type="submit" className="vc-btn-primary mt-1" disabled={enviando || conectando}>
              {conectando
                ? "Conectando tu acceso..."
                : enviando
                  ? "Un momento..."
                  : modo === "crear"
                    ? "Crear cuenta y entrar"
                    : "Entrar"}
            </button>
          </form>

          {modo === "entrar" &&
            (resetEnviado ? (
              <p className="text-center text-xs text-muted">
                Te mandamos un link a {invite.staffEmail} para crear una contraseña nueva.
              </p>
            ) : (
              <button
                type="button"
                className="text-center text-xs text-muted hover:text-teal"
                onClick={handleOlvidoContrasena}
              >
                ¿Olvidaste tu contraseña?
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
