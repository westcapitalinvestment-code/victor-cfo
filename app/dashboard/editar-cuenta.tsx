"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Editar nombre/teléfono/email desde Configuración — 8 sept 2026, pedido
// de Joel: "es la unica parte que no puedes cambiar si esribistes el
// nombre mal o cambia de email o telefono". Nombre y teléfono se guardan
// al instante (misma escritura directa a Supabase que ya usa
// onboarding-form.tsx, con el mismo guardarraíl .select("id") — .update()
// de Supabase no avisa si RLS bloqueó el cambio y afectó 0 filas). El
// email es distinto: supabase.auth.updateUser({email}) no cambia nada al
// instante, Supabase pide confirmar desde el correo viejo Y el nuevo
// primero — el trigger de la migración 0078 sincroniza public.users.email
// automáticamente cuando esa confirmación se completa de verdad.
export default function EditarCuenta({
  fullName,
  email,
  phone,
}: {
  fullName: string;
  email: string;
  phone: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(fullName);
  const [correo, setCorreo] = useState(email);
  const [telefono, setTelefono] = useState(phone);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoEmail, setAvisoEmail] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setAvisoEmail(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setGuardando(false);
      setError("No autenticado.");
      return;
    }

    if (nombre.trim() && nombre.trim() !== fullName) {
      const { data, error: err } = await supabase
        .from("users")
        .update({ full_name: nombre.trim() })
        .eq("id", user.id)
        .select("id");
      if (err) {
        setGuardando(false);
        setError(err.message);
        return;
      }
      if (!data || data.length === 0) {
        setGuardando(false);
        setError("No se pudo guardar el nombre. Intenta de nuevo.");
        return;
      }
    }

    if (telefono.trim() !== phone) {
      const { data, error: err } = await supabase
        .from("user_profiles")
        .update({ phone: telefono.trim() || null })
        .eq("id", user.id)
        .select("id");
      if (err) {
        setGuardando(false);
        setError(err.message);
        return;
      }
      if (!data || data.length === 0) {
        setGuardando(false);
        setError("No se pudo guardar el teléfono. Intenta de nuevo.");
        return;
      }
    }

    if (correo.trim() && correo.trim() !== email) {
      const { error: err } = await supabase.auth.updateUser({ email: correo.trim() });
      if (err) {
        setGuardando(false);
        setError(err.message);
        return;
      }
      setAvisoEmail(
        "Te enviamos un correo de confirmación. El cambio de email no se aplica hasta que lo confirmes (puede pedirte confirmar desde tu correo actual y el nuevo)."
      );
    }

    setGuardando(false);
    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <>
        {avisoEmail && (
          <p className="mb-2 rounded-lg border border-teal/30 p-2.5 text-xs text-teal" style={{ background: "rgba(29,158,117,.08)" }}>
            {avisoEmail}
          </p>
        )}
        <button
          onClick={() => setEditando(true)}
          className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
        >
          Editar
        </button>
      </>
    );
  }

  return (
    <div className="mt-3">
      <label className="mb-1 block text-xs font-medium text-muted">Nombre</label>
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full rounded-lg border border-border p-2.5 text-sm"
      />

      <label className="mb-1 mt-3 block text-xs font-medium text-muted">Email</label>
      <input
        type="email"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        className="w-full rounded-lg border border-border p-2.5 text-sm"
      />

      <label className="mb-1 mt-3 block text-xs font-medium text-muted">Teléfono</label>
      <input
        type="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="(787) 000-0000"
        className="w-full rounded-lg border border-border p-2.5 text-sm"
      />

      {error && <p className="mt-2 text-xs text-red">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            setEditando(false);
            setError(null);
            setNombre(fullName);
            setCorreo(email);
            setTelefono(phone);
          }}
          className="flex-1 rounded-lg border border-border p-2.5 text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex-1 rounded-lg border border-teal p-2.5 text-sm font-medium text-teal"
          style={{ background: "rgba(29,158,117,.1)" }}
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
