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
