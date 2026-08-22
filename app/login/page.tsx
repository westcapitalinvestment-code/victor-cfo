"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
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

    // Un CPA invitado entra por el mismo /login (un solo login para todo
    // VICTOR — ver nota en account_members, migración 0001), así que hay
    // que revisar si este correo es un CPA para mandarlo a /cpa en vez de
    // /dashboard. Simplificación consciente: si alguien es dueño Y CPA de
    // otros a la vez (caso raro), esto lo manda al portal CPA primero.
    const { data: membresiaCpa } = await supabase
      .from("account_members")
      .select("id")
      .eq("member_email", email)
      .eq("role", "cpa")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    router.push(membresiaCpa ? "/cpa" : "/dashboard");
    router.refresh();
  }

  if (modo === "olvide") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={handleLogin} className="vc-card flex flex-col gap-3">
          <h1 className="mb-2 text-base font-medium">Entrar a tu cuenta</h1>

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
