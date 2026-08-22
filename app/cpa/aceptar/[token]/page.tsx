"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Página pública donde un CPA invitado (link del correo de
// /api/cpa-invite) crea su contraseña o inicia sesión, y queda conectado
// como account_members (role='cpa') al dueño que lo invitó.
//
// Flujo:
//  1. Al cargar, pide los datos públicos de la invitación (GET, sin
//     sesión) a /api/cpa-invite/accept?token=... — para mostrar "Ana, te
//     invitó Joel Valentín" en vez de un formulario en blanco.
//  2. El CPA crea contraseña (o inicia sesión si ya tenía cuenta de
//     VICTOR por otra invitación — "un login, varios clientes").
//  3. En cuanto Supabase confirma la sesión (onAuthStateChange —
//     cubre tanto el caso normal como el caso "revisa tu correo, confirma,
//     y vuelve a este mismo link"), esta página llama POST
//     /api/cpa-invite/accept, que crea la fila en account_members con la
//     Service Role Key (un CPA no tiene permiso de escribir ahí él mismo).
//  4. Redirige a /cpa.
export default function AceptarInvitacionCpaPage() {
  const router = useRouter();
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : Array.isArray(params.token) ? params.token[0] : "";
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [errorInvite, setErrorInvite] = useState<string | null>(null);
  const [invite, setInvite] = useState<{
    ownerName: string | null;
    cpaName: string | null;
    cpaEmail: string;
    status: string;
  } | null>(null);

  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  // Evita llamar /accept dos veces si onAuthStateChange dispara más de una
  // vez (pasa normalmente: una vez al montar si ya hay sesión, y otra vez
  // justo después de signIn/signUp).
  const yaAceptando = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/cpa-invite/accept?token=${encodeURIComponent(token)}`)
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
      const res = await fetch("/api/cpa-invite/accept", {
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
      email: invite.cpaEmail,
      password,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
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
      // onAuthStateChange se encarga de llamar /accept y redirigir.
      return;
    }
    setRevisaCorreo(true);
  }

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email: invite.cpaEmail, password });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
    // onAuthStateChange se encarga de llamar /accept y redirigir.
  }

  async function handleOlvidoContrasena() {
    if (!invite) return;
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(invite.cpaEmail, {
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
            <p className="text-xs text-muted">
              Te mandamos un link de confirmación a {invite.cpaEmail}. Entra ahí y vuelves directo a este mismo
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Portal CPA
          </span>
        </div>

        <div className="vc-card flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">
              {invite.ownerName ? `${invite.ownerName} te invitó a VICTOR` : "Te invitaron a VICTOR"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Vas a poder ver las finanzas que comparta contigo, sin costo — como {invite.cpaEmail}.
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
            <input className="vc-input" value={invite.cpaEmail} disabled readOnly />
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
                Te mandamos un link a {invite.cpaEmail} para crear una contraseña nueva.
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
