"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Página pública donde un admin/secretaria invitado (link del correo de
// /api/admin-invite) crea su contraseña o inicia sesión, y queda conectado
// como account_members (role='admin') al dueño que lo invitó. Calcado de
// /cpa/aceptar/[token]/page.tsx — mismo flujo de Supabase Auth, mismo
// patrón de onAuthStateChange → POST /api/admin-invite/accept.
//
// A diferencia del CPA (que aterriza en el portal /cpa ya construido), el
// admin/secretaria hoy aterriza en una pantalla de confirmación honesta —
// su portal de trabajo real (ver /facturacion con datos del dueño) es un
// proyecto aparte, todavía no construido (ver tarea "Fase 2" del roadmap).
export default function AceptarInvitacionAdminPage() {
  const router = useRouter();
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : Array.isArray(params.token) ? params.token[0] : "";
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [errorInvite, setErrorInvite] = useState<string | null>(null);
  const [invite, setInvite] = useState<{
    ownerName: string | null;
    entityName: string | null;
    adminName: string | null;
    adminEmail: string;
    status: string;
  } | null>(null);

  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [aceptado, setAceptado] = useState(false);

  const yaAceptando = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin-invite/accept?token=${encodeURIComponent(token)}`)
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
      const res = await fetch("/api/admin-invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo conectar la invitación.");
      setConectando(false);
      setAceptado(true);
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
      email: invite.adminEmail,
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
      return;
    }
    setRevisaCorreo(true);
  }

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email: invite.adminEmail, password });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }
  }

  async function handleOlvidoContrasena() {
    if (!invite) return;
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(invite.adminEmail, {
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

  if (aceptado || invite.status === "accepted") {
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
            <p className="mb-2 text-sm font-medium">
              <i className="ti ti-circle-check text-teal" style={{ marginRight: 4 }} />
              Tu acceso está activo
            </p>
            <p className="mb-1 text-xs text-muted">
              Ya puedes entrar con tu correo y contraseña — solo vas a ver facturación de{" "}
              {invite.entityName || "este negocio"}, nunca finanzas personales.
            </p>
            {/* La sesión que se creó al aceptar (signUp/signIn arriba) sigue
                activa aquí mismo — ya no hace falta mandarlo de vuelta a
                /login para entrar dos veces (2 sept 2026, ahora que el
                portal real de /admin existe). */}
            <button className="vc-btn-primary mt-3" onClick={() => router.push("/admin")}>
              Ir a tu portal
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
              Te mandamos un link de confirmación a {invite.adminEmail}. Entra ahí y vuelves directo a este mismo
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
            Admin/Secretaria
          </span>
        </div>

        <div className="vc-card flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">
              {invite.ownerName ? `${invite.ownerName} te dio acceso` : "Te dieron acceso"} a facturación de{" "}
              {invite.entityName || "su negocio"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Vas a poder crear facturas, registrar cobros y ver pendientes como {invite.adminEmail} — nunca
              finanzas personales ni el total del negocio, a menos que te autoricen permisos adicionales.
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
            <input className="vc-input" value={invite.adminEmail} disabled readOnly />
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
                ? "Activando tu acceso..."
                : enviando
                  ? "Un momento..."
                  : modo === "crear"
                    ? "Crear cuenta y activar acceso"
                    : "Entrar"}
            </button>
          </form>

          {modo === "entrar" &&
            (resetEnviado ? (
              <p className="text-center text-xs text-muted">
                Te mandamos un link a {invite.adminEmail} para crear una contraseña nueva.
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
