"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// Archivar/reactivar un cliente directo desde la lista, sin tener que
// entrar a Editar — mismo patrón que el resto de los formularios de
// clientes (llamada directa a Supabase desde el cliente, no hay API route
// dedicada para esto en el resto del módulo). Archivar NUNCA borra nada:
// solo pone active=false, así que es 100% reversible con "Reactivar".
export default function ArchivarBoton({ clienteId, activo }: { clienteId: string; activo: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    setCargando(true);
    const { error } = await supabase.from("clients").update({ active: !activo }).eq("id", clienteId);
    setCargando(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={cargando}
      className="flex-shrink-0 text-xs text-muted hover:text-teal disabled:opacity-50"
      title={activo ? "Archivar cliente" : "Reactivar cliente"}
    >
      {activo ? "Archivar" : "Reactivar"}
    </button>
  );
}
