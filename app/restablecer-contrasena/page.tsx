"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Página donde cae el link de "olvidé mi contraseña" que manda Supabase
// (disparado desde /login o desde /cpa/aceptar/[token] con
// resetPasswordForEmail). El link ya trae una sesión temporal de
// recuperación — createBrowserClient la detecta sola al cargar esta
// página (detectSessionInUrl, default en @supabase/ssr). Aquí solo se pide
// la contraseña nueva y se guarda con updateUser().
export default function RestablecerContrasenaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [listo, setListo] = useState(false);
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setListo(!!data.session);
      setCargando(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setListo(true);
        setCargando(false);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });

    setEnviando(false);

    if (error) {
      setError(error.message);
      return;
    }

    setGuardado(true);
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted">Cargando...</p>
      </div>
    );
  }

  if (guardado) {
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
            <p className="mb-2 text-sm font-medium">Contraseña actualizada</p>
            <p className="mb-4 text-xs text-muted">Ya puedes entrar con tu contraseña nueva.</p>
            <button className="vc-btn-primary" onClick={() => router.push("/login")}>
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!listo) {
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
            <p className="mb-2 text-sm font-medium">Este link ya no es válido</p>
            <p className="mb-4 text-xs text-muted">
              Puede que ya haya expirado o que ya lo hayas usado. Pide uno nuevo desde la pantalla de entrar.
            </p>
            <button className="vc-btn-primary" onClick={() => router.push("/login")}>
              Ir a iniciar sesión
            </button>
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

        <form onSubmit={handleSubmit} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Crea tu nueva contraseña</h1>

          <input
            className="vc-input"
            type="password"
            placeholder="Contraseña nueva (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
