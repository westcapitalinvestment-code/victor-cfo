"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Menú de cuenta del Portal CPA (4 oct 2026, pedido de Joel: "el portal no
// tiene nada para configurar ni signout") — antes un contable logueado en
// /cpa no tenía ninguna forma de cerrar sesión ni cambiar su contraseña sin
// salirse de la app manualmente (borrar cookies). Mismo patrón de
// click-outside y las mismas clases (.vc-negocio-menu/.vc-negocio-item) que
// ya usa el selector de entidad en app/dashboard/topbar.tsx, solo que
// anclado a la derecha en vez de ocupar el ancho del padre.
//
// "Cambiar contraseña" reusa /restablecer-contrasena tal cual — esa
// pantalla ya funciona con CUALQUIER sesión activa (getSession()), no solo
// con el link de recuperación por correo, así que sirve igual para un
// dueño, un admin/secretaria o un CPA sin tocarla. "Olvidé mi contraseña"
// (sin sesión) sigue siendo un flujo aparte desde /login, no hace falta
// aquí porque este menú solo existe para quien YA está logueado.
export default function CpaAccountMenu({ email }: { email: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  async function cerrarSesion() {
    setSaliendo(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Configuración de cuenta"
        className="flex items-center justify-center rounded-full border border-border text-muted hover:text-text"
        style={{ width: 30, height: 30 }}
      >
        <i className="ti ti-settings" style={{ fontSize: 15 }} />
      </button>
      {abierto && (
        <div className="vc-negocio-menu" style={{ left: "auto", right: 0, width: 220 }}>
          {email && <p className="truncate px-2.5 pb-1 pt-0.5 text-[11px] text-muted">{email}</p>}
          <Link href="/restablecer-contrasena" className="vc-negocio-item" onClick={() => setAbierto(false)}>
            <i className="ti ti-key" /> Cambiar contraseña
          </Link>
          <button onClick={cerrarSesion} disabled={saliendo} className="vc-negocio-item text-red">
            <i className="ti ti-logout" /> {saliendo ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
