"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// useSearchParams() (para detectar ?motivo=inactividad, ver más abajo)
// obliga a Next.js a que el componente que lo usa esté envuelto en
// <Suspense> — si no, el build falla al pre-renderizar esta página. Por
// eso el export default de abajo es un wrapper con Suspense y el
// formulario real vive en este componente interno.
function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  // Cuando session-timeout-gate.tsx cierra la sesión por inactividad,
  // manda para acá con ?motivo=inactividad — así el usuario entiende por
  // qué lo sacó en vez de pensar que la app falló.
  const searchParams = useSearchParams();
  const cerradaPorInactividad = searchParams.get("motivo") === "inactividad";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "¿Olvidaste tu contraseña?" — modo aparte dentro de la misma pantalla
  // (no hace falta otra ruta solo para esto). Cambia el formulario a pedir
  // solo el correo y dispara resetPasswordForEmail(), que manda un link a
  // /restablecer-contrasena.
  const [modo, setModo] = useState<"entrar" | "olvide">("entrar");
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [oauthEnCurso, setOauthEnCurso] = useState<"google" | "apple" | null>(null);

  // Login con Google y Apple (10 sept 2026) — mismo callback que /registro
  // (app/auth/callback/route.ts), pero sin plan/ciclo/ref: un usuario que
  // vuelve a entrar ya tiene plan_status resuelto, así que el callback lo
  // manda directo a /dashboard sin pasar por completar-pago.
  async function entrarConOAuth(provider: "google" | "apple") {
    setError(null);
    setOauthEnCurso(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });

    if (error) {
      setError(error.message);
      setOauthEnCurso(null);
    }
  }

  async function handleOlvide(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoReset(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });

    setEnviandoReset(false);

    if (error) {
      setError(error.message);
      return;
    }

    setResetEnviado(true);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Un CPA o un Admin/Secretaria invitado entran por el mismo /login (un
    // solo login para todo VICTOR — ver nota en account_members, migración
    // 0001), así que hay que revisar el rol de este correo para mandarlo al
    // portal correcto en vez de /dashboard. Simplificación consciente: si
    // alguien es dueño Y invitado de otros a la vez (caso raro), esto lo
    // manda al portal de invitado primero — Admin/Secretaria antes que CPA
    // porque es el rol más común de los dos.
    const [{ data: membresiaAdmin }, { data: membresiaCpa }] = await Promise.all([
      supabase
        .from("account_members")
        .select("id")
        .eq("member_email", email)
        .eq("role", "admin")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("account_members")
        .select("id")
        .eq("member_email", email)
        .eq("role", "cpa")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    const destino = membresiaAdmin ? "/admin" : membresiaCpa ? "/cpa" : "/dashboard";

    // MFA (4 sept 2026, migración 0068): la contraseña correcta solo sube
    // la sesión a aal1 — si la cuenta tiene un factor TOTP verificado,
    // Supabase marca nextLevel como aal2 y hay que pasar por
    // /login/verificar antes de dejarlo entrar. middleware.ts hace el
    // mismo chequeo por si alguien intenta saltarse esto escribiendo la
    // URL del destino directo.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel !== aal.nextLevel) {
      router.push(`/login/verificar?next=${encodeURIComponent(destino)}`);
      return;
    }

    router.push(destino);
    router.refresh();
  }

  if (modo === "olvide") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>

          {resetEnviado ? (
            <div className="vc-card text-center">
              <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
              <p className="mb-4 text-xs text-muted">
                Si {email} tiene una cuenta con nosotros, te mandamos un link para crear una contraseña nueva.
              </p>
              <button
                type="button"
                className="vc-btn-primary"
                onClick={() => {
                  setModo("entrar");
                  setResetEnviado(false);
                }}
              >
                Volver a entrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleOlvide} className="vc-card flex flex-col gap-3">
              <h1 className="mb-1 text-base font-medium">¿Olvidaste tu contraseña?</h1>
              <p className="mb-2 text-xs text-muted">
                Escribe tu correo y te mandamos un link para crear una contraseña nueva.
              </p>

              <input
                className="vc-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && <p className="text-xs text-red">{error}</p>}

              <button type="submit" className="vc-btn-primary mt-2" disabled={enviandoReset}>
                {enviandoReset ? "Enviando..." : "Enviar link"}
              </button>

              <button
                type="button"
                className="mt-1 text-center text-xs text-muted hover:text-teal"
                onClick={() => {
                  setModo("entrar");
                  setError(null);
                }}
              >
                Volver a entrar
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={handleLogin} className="vc-card flex flex-col gap-3">
          <h1 className="mb-2 text-base font-medium">Entrar a tu cuenta</h1>

          {cerradaPorInactividad && (
            <p className="rounded bg-amb/10 px-3 py-2 text-xs text-amb">
              Cerramos tu sesión por inactividad. Entra de nuevo para seguir.
            </p>
          )}

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
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="my-1 flex items-center gap-2 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>o</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="vc-btn-secondary flex flex-1 items-center justify-center gap-2"
              disabled={loading || !!oauthEnCurso}
              onClick={() => entrarConOAuth("google")}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.6 0-14.1 4.3-17.7 10.7z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.8 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5c3.6 6.4 10.1 10.6 17.8 10.6z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.5 5.5C40.5 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
              </svg>
              {oauthEnCurso === "google" ? "..." : "Google"}
            </button>
            <button
              type="button"
              className="vc-btn-secondary flex flex-1 items-center justify-center gap-2"
              disabled={loading || !!oauthEnCurso}
              onClick={() => entrarConOAuth("apple")}
            >
              <svg width="15" height="15" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 184.8 0 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 37.5 59 129.3 107.2 127.6 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-84.1 102.6-121.7-65.2-30.7-57.7-90-57.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              {oauthEnCurso === "apple" ? "..." : "Apple"}
            </button>
          </div>

          <button
            type="button"
            className="text-center text-xs text-muted hover:text-teal"
            onClick={() => {
              setModo("olvide");
              setError(null);
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>

          <p className="mt-1 text-center text-xs text-muted">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-teal">
              Comienza ahora
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
