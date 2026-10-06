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

  // Logo de la firma (6 oct 2026, pedido de Joel): solo aparece para cuentas
  // Firma Accountant. Lo ven los clientes invitados en su topbar.
  const [firma, setFirma] = useState<{ userId: string; tieneLogo: boolean } | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [versionLogo, setVersionLogo] = useState(0);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/firma/logo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.esFirma) setFirma({ userId: d.userId, tieneLogo: !!d.tieneLogo });
      })
      .catch(() => {});
  }, []);

  async function subirLogo(file: File) {
    setSubiendoLogo(true);
    setErrorLogo(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/firma/logo", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    setSubiendoLogo(false);
    if (!res.ok) {
      setErrorLogo(json?.error || "No se pudo subir el logo.");
      return;
    }
    setFirma((f) => (f ? { ...f, tieneLogo: true } : f));
    setVersionLogo((v) => v + 1);
  }

  async function quitarLogo() {
    setSubiendoLogo(true);
    setErrorLogo(null);
    const res = await fetch("/api/firma/logo", { method: "DELETE" });
    setSubiendoLogo(false);
    if (!res.ok) {
      setErrorLogo("No se pudo quitar el logo.");
      return;
    }
    setFirma((f) => (f ? { ...f, tieneLogo: false } : f));
  }

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
        <div className="vc-negocio-menu" style={{ left: "auto", right: 0, width: firma ? 260 : 220 }}>
          {email && <p className="truncate px-2.5 pb-1 pt-0.5 text-[11px] text-muted">{email}</p>}
          {firma && (
            <div className="border-b border-border px-2.5 pb-2 pt-1">
              <p className="mb-1 text-[11px] font-medium">Logo de tu firma</p>
              <div className="flex items-center gap-2">
                {firma.tieneLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/firma/logo/${firma.userId}?v=${versionLogo}`}
                    alt="Logo de tu firma"
                    style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6 }}
                  />
                ) : (
                  <span
                    className="flex items-center justify-center rounded-md border border-dashed border-border text-muted"
                    style={{ width: 36, height: 36 }}
                  >
                    <i className="ti ti-photo" />
                  </span>
                )}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={subiendoLogo}
                    onClick={() => inputLogoRef.current?.click()}
                    className="text-left text-xs font-medium text-teal"
                  >
                    {subiendoLogo ? "Subiendo..." : firma.tieneLogo ? "Cambiar logo" : "Subir logo"}
                  </button>
                  {firma.tieneLogo && !subiendoLogo && (
                    <button type="button" onClick={quitarLogo} className="text-left text-xs text-muted">
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={inputLogoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subirLogo(f);
                  e.target.value = "";
                }}
              />
              <p className="mt-1 text-[10px] text-muted">Lo ven tus clientes invitados en su cuenta.</p>
              {errorLogo && <p className="mt-1 text-[10px] text-red">{errorLogo}</p>}
            </div>
          )}
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
