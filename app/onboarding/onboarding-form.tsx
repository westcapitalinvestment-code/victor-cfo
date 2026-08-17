"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingForm({ initialFullName }: { initialFullName: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setLoading(false);
      return;
    }

    // Dos tablas: users (cuenta/plan) y user_profiles (datos personales) —
    // así se diseñó en 0001 a propósito, para no mezclar billing con
    // preferencias. Ambas filas ya existen (las crea el trigger 0002),
    // así que aquí siempre es UPDATE, nunca INSERT.
    const { error: usersError } = await supabase
      .from("users")
      .update({ full_name: fullName, onboarding_completed: true })
      .eq("id", user.id);

    if (usersError) {
      setError(usersError.message);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({ phone })
      .eq("id", user.id);

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="vc-card flex flex-col gap-3">
      <h1 className="mb-1 text-base font-medium">Antes de empezar, ¿cómo te llamas?</h1>
      <p className="mb-2 text-xs text-muted">
        Esto es lo primero — antes de negocios, bancos o facturas, VICTOR necesita saber quién eres.
      </p>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre completo</label>
        <input
          className="vc-input"
          placeholder="Joel A. Valentín De Jesús"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Teléfono</label>
        <input
          className="vc-input"
          placeholder="(787) 000-0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-red">{error}</p>}

      <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !fullName}>
        {loading ? "Guardando..." : "Continuar"}
      </button>
    </form>
  );
}
