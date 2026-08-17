"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Registro real — esto es lo que faltaba para que el landing page
// (victorcfo.com) pueda mandar gente nueva a crear cuenta de verdad.
// supabase.auth.signUp() dispara el trigger 0002 (handle_new_user), que
// crea las filas en users/user_profiles automáticamente con
// plan='core' y plan_status='trialing' — el "30 días gratis" del landing
// ya es el comportamiento real por defecto, no hay que tocar nada más.
export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();

    if (!aceptaTerminos) {
      setError("Tienes que aceptar la Política de Privacidad y los Términos de Servicio para continuar.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Si el proyecto de Supabase tiene confirmación de email activada, no
    // hay sesión todavía — el usuario tiene que confirmar desde su correo
    // antes de poder entrar. Si está desactivada, ya queda logueado y
    // vamos directo al onboarding.
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else {
      setRevisaCorreo(true);
    }
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
              Te mandamos un link de confirmación a {email}. Entra ahí para activar tu cuenta y
              empezar.
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
        </div>

        <form onSubmit={handleRegistro} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Comienza ahora</h1>
          <p className="mb-1 text-xs text-muted">30 días gratis. Sin tarjeta de crédito. Cancela cuando quieras.</p>

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
            placeholder="Contraseña (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
              Acepto la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-teal">
                Política de Privacidad
              </Link>{" "}
              y los{" "}
              <Link href="/terminos" target="_blank" className="font-medium text-teal">
                Términos de Servicio
              </Link>
              , incluyendo el uso de Plaid para conectar mi banco.
            </span>
          </label>

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !aceptaTerminos}>
            {loading ? "Creando cuenta..." : "Crear mi cuenta"}
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
