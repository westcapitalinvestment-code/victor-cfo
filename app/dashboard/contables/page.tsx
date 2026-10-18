"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ESPECIALIDADES, urlSocial } from "@/lib/oficinas-contables";

// Directorio de contables para usuarios de VICTOR sin contable (migración
// 0163, 18 oct 2026). Se llena solo: cada contable que entra al portal y
// completa su perfil aparece aquí. El correo y teléfono del contable no se
// muestran; "Contactar" le envía tu nombre y correo (con tu autorización).

type Oficina = {
  id: string;
  nombre: string;
  pueblo: string;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  descripcion: string;
  web: string | null;
  instagram: string | null;
  facebook: string | null;
};

export default function DirectorioContablesPage() {
  const router = useRouter();
  const [oficinas, setOficinas] = useState<Oficina[] | null>(null);
  const [contactados, setContactados] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fPueblo, setFPueblo] = useState("");
  const [fEsp, setFEsp] = useState("");
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [telefono, setTelefono] = useState("");
  const [autorizo, setAutorizo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errForm, setErrForm] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contables")
      .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
      .then(({ ok, json }) => {
        if (ok) {
          setOficinas(json.oficinas ?? []);
          setContactados(json.contactados ?? []);
        } else setError(json?.error || "No se pudo cargar el directorio.");
      });
  }, []);

  const pueblos = useMemo(
    () => Array.from(new Set((oficinas ?? []).map((o) => o.pueblo))).sort((a, b) => a.localeCompare(b, "es")),
    [oficinas]
  );

  const lista = (oficinas ?? [])
    .filter((o) => !fPueblo || o.pueblo === fPueblo || o.remoto)
    .filter((o) => !fEsp || o.especialidades.includes(fEsp))
    .filter((o) => !busca.trim() || o.nombre.toLowerCase().includes(busca.trim().toLowerCase()));

  function abrir(id: string) {
    setAbierto(abierto === id ? null : id);
    setMensaje("");
    setAutorizo(false);
    setErrForm(null);
  }

  async function enviar(o: Oficina) {
    setErrForm(null);
    if (!autorizo) return setErrForm("Marca la casilla para autorizar compartir tus datos.");
    setEnviando(true);
    const res = await fetch("/api/contables/solicitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oficinaId: o.id, mensaje, telefono, autorizo: true }),
    });
    const json = await res.json().catch(() => null);
    setEnviando(false);
    if (!res.ok) return setErrForm(json?.error || "No se pudo enviar.");
    setContactados((prev) => [...prev, o.id]);
    setAbierto(null);
  }

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Encuentra un contable</h1>
        <button onClick={() => router.push("/dashboard")} className="vc-btn-back">
          Volver
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">Contables que ya trabajan con VICTOR</p>
        <p className="mt-1 text-xs text-white/80">
          Escoge por pueblo y especialidad. Si te quedas con uno, lo invitas a tu cuenta y ve lo que compartas, sin costo extra.
        </p>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}
      {!oficinas && !error && <p className="text-sm text-muted">Cargando...</p>}

      {oficinas && (
        <>
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <select value={fPueblo} onChange={(e) => setFPueblo(e.target.value)} className="w-1/2 rounded-lg border border-border bg-transparent p-2 text-[13px]">
                <option value="">Todos los pueblos</option>
                {pueblos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select value={fEsp} onChange={(e) => setFEsp(e.target.value)} className="w-1/2 rounded-lg border border-border bg-transparent p-2 text-[13px]">
                <option value="">Cualquier especialidad</option>
                {ESPECIALIDADES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre..." className="rounded-lg border border-border p-2 text-[13px]" />
            {fPueblo && <p className="text-[11px] text-muted">Incluye oficinas que atienden a distancia.</p>}
          </div>

          {lista.length === 0 ? (
            <div className="vc-card text-center text-sm text-muted">
              {oficinas.length === 0
                ? "Todavía no hay contables en el directorio. Estamos sumando oficinas cada semana."
                : "No hay contables con esos filtros."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lista.map((o) => {
                const yaContacto = contactados.includes(o.id);
                const links = [
                  { n: "Página web", u: urlSocial("web", o.web) },
                  { n: "Instagram", u: urlSocial("instagram", o.instagram) },
                  { n: "Facebook", u: urlSocial("facebook", o.facebook) },
                ].filter((l) => l.u);
                return (
                  <div key={o.id} className="vc-card flex flex-col gap-2">
                    <div>
                      <p className="text-sm font-medium">{o.nombre}</p>
                      <p className="text-[11px] text-muted">
                        {o.pueblo}
                        {o.remoto ? " · Atiende a distancia" : ""}
                      </p>
                    </div>
                    <p className="whitespace-pre-line text-[13px]">{o.descripcion}</p>
                    {o.especialidades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {o.especialidades.map((e) => (
                          <span key={e} className="rounded-pill border border-teal px-2 py-0.5 text-[10px] text-teal">
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                    {o.sectores.length > 0 && <p className="text-[11px] text-muted">Trabaja con: {o.sectores.join(", ")}</p>}
                    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
                      {links.map((l) => (
                        <a key={l.n} href={l.u!} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                          {l.n}
                        </a>
                      ))}
                      {yaContacto ? (
                        <span className="ml-auto font-medium text-teal">Solicitud enviada ✓</span>
                      ) : (
                        <button type="button" onClick={() => abrir(o.id)} className="ml-auto rounded-pill bg-teal px-3 py-1.5 font-medium text-white">
                          Contactar
                        </button>
                      )}
                    </div>
                    {abierto === o.id && !yaContacto && (
                      <div className="flex flex-col gap-2 border-t border-border pt-2">
                        {errForm && <p className="text-xs text-red">{errForm}</p>}
                        <textarea
                          value={mensaje}
                          onChange={(e) => setMensaje(e.target.value)}
                          rows={3}
                          maxLength={600}
                          placeholder="Cuéntale qué necesitas (opcional)"
                          className="rounded-lg border border-border p-2 text-sm"
                        />
                        <input
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          type="tel"
                          inputMode="tel"
                          placeholder="Tu teléfono (opcional)"
                          className="rounded-lg border border-border p-2 text-sm"
                        />
                        <label className="flex items-start gap-2 text-[12px]">
                          <input type="checkbox" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} className="mt-0.5" />
                          <span>Autorizo compartir mi nombre, correo y teléfono (si lo puse) con este contable para que me contacte.</span>
                        </label>
                        <button type="button" disabled={enviando} onClick={() => enviar(o)} className="rounded-pill bg-teal p-2 text-sm font-medium text-white">
                          {enviando ? "Enviando..." : "Enviar solicitud"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-muted">
            VICTOR CFO muestra a los contables que trabajan con la plataforma, pero no garantiza su servicio. Verifica la
            licencia y las condiciones directamente con el contable.
          </p>
          <p className="mt-2 text-center text-[12px]">
            ¿Ya tienes contable?{" "}
            <Link href="/dashboard/invitar-contable" className="font-medium text-teal">
              Invítalo a tu cuenta
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
