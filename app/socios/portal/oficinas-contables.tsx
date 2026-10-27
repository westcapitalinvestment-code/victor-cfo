"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESPECIALIDADES,
  ESTADOS_SEGUIMIENTO,
  ESTADO_SEGUIMIENTO_COLOR,
  ESTADO_SEGUIMIENTO_LABEL,
  MUNICIPIOS_PR,
  SECTORES,
  STATUS_OFICINA_LABEL,
  normalizarNombre,
  urlSocial,
  type EstadoSeguimiento,
  type StatusOficina,
} from "@/lib/oficinas-contables";

// Oficinas de contables del portal del vendedor (migración 0163). Un registro
// compartido para no repetir visitas: lo tuyo se ve completo; lo de los demás
// solo nombre, pueblo y status.

type Mia = {
  id: string;
  nombre: string;
  status: StatusOficina;
  estado: EstadoSeguimiento;
  contactoNombre: string | null;
  email: string | null;
  telefono: string | null;
  pueblo: string | null;
  web: string | null;
  instagram: string | null;
  facebook: string | null;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  descripcion: string | null;
  notas: string | null;
  diasRestantes: number | null;
};
type Otra = { id: string; nombre: string; pueblo: string | null; status: StatusOficina };

const STATUS_COLOR: Record<StatusOficina, string> = {
  tiene_portal: "text-teal",
  en_seguimiento: "text-amb",
  disponible: "text-muted",
};

type Form = {
  nombre: string;
  pueblo: string;
  contactoNombre: string;
  email: string;
  telefono: string;
  web: string;
  instagram: string;
  facebook: string;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  descripcion: string;
  notas: string;
  estado: EstadoSeguimiento;
};
const VACIO: Form = {
  nombre: "",
  pueblo: "",
  contactoNombre: "",
  email: "",
  telefono: "",
  web: "",
  instagram: "",
  facebook: "",
  sectores: [],
  especialidades: [],
  remoto: false,
  descripcion: "",
  notas: "",
  estado: "visitado",
};

function fmtTel(d: string) {
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
}

function Chips({
  opciones,
  valor,
  onChange,
}: {
  opciones: readonly string[];
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const on = valor.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? valor.filter((x) => x !== o) : [...valor, o])}
            className={`rounded-pill border px-2.5 py-1 text-xs ${
              on ? "border-teal bg-teal text-white" : "border-border text-muted"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function OficinasContables() {
  const [mias, setMias] = useState<Mia[] | null>(null);
  const [otras, setOtras] = useState<Otra[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Form>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fEstado, setFEstado] = useState<"todos" | EstadoSeguimiento>("todos");
  const [fPueblo, setFPueblo] = useState("");
  const [verOtras, setVerOtras] = useState(false);
  const [busca, setBusca] = useState("");
  const [porContacto, setPorContacto] = useState<{ id: string; nombre: string; pueblo: string | null; status: StatusOficina; mia: boolean }[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/socios/portal/oficinas");
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setMias(json.mias ?? []);
      setOtras(json.otras ?? []);
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  // Si lo que escribe parece un email o un teléfono, pregunta al servidor si
  // otro vendedor ya registró esa oficina (sin mostrar su contacto).
  useEffect(() => {
    const q = busca.trim();
    const pareceContacto = q.includes("@") || q.replace(/\D/g, "").length >= 10;
    if (!pareceContacto) {
      setPorContacto([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/socios/portal/oficinas?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => null);
      if (res.ok) setPorContacto(json.porContacto ?? []);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Aviso inmediato mientras escribe el nombre: ¿ya la visitó alguien?
  const coincidencias = useMemo(() => {
    if (editId) return [];
    const n = normalizarNombre(f.nombre);
    if (n.length < 3) return [];
    const todas = [
      ...(mias ?? []).map((m) => ({ id: m.id, nombre: m.nombre, pueblo: m.pueblo, status: m.status, mia: true })),
      ...otras.map((o) => ({ ...o, mia: false })),
    ];
    return todas.filter((o) => normalizarNombre(o.nombre).includes(n) || n.includes(normalizarNombre(o.nombre))).slice(0, 5);
  }, [f.nombre, mias, otras, editId]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function empezarEditar(m: Mia) {
    setEditId(m.id);
    setF({
      nombre: m.nombre,
      pueblo: m.pueblo ?? "",
      contactoNombre: m.contactoNombre ?? "",
      email: m.email ?? "",
      telefono: m.telefono ? fmtTel(m.telefono) : "",
      web: m.web ?? "",
      instagram: m.instagram ?? "",
      facebook: m.facebook ?? "",
      sectores: m.sectores,
      especialidades: m.especialidades,
      remoto: m.remoto,
      descripcion: m.descripcion ?? "",
      notas: m.notas ?? "",
      estado: m.estado,
    });
    setAbierto(true);
    setError(null);
  }

  function cerrarForm() {
    setAbierto(false);
    setEditId(null);
    setF(VACIO);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.nombre.trim().length < 2) return setError("Escribe el nombre de la oficina.");
    if (!f.pueblo) return setError("Escoge el pueblo.");
    setGuardando(true);
    const res = await fetch("/api/socios/portal/oficinas", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, ...f } : f),
    });
    const json = await res.json().catch(() => null);
    setGuardando(false);
    if (!res.ok) {
      setError(json?.error || "No se pudo guardar.");
      return;
    }
    cerrarForm();
    await cargar();
  }

  async function cambiarEstado(m: Mia, estado: EstadoSeguimiento) {
    setMias((prev) => (prev ? prev.map((x) => (x.id === m.id ? { ...x, estado } : x)) : prev));
    const res = await fetch("/api/socios/portal/oficinas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, estado }),
    });
    if (!res.ok) await cargar();
    else await cargar(); // refresca los días restantes (la edición renueva los 60)
  }

  async function quitar(m: Mia) {
    if (!window.confirm(`¿Quitar "${m.nombre}"? Otro vendedor podría registrarla.`)) return;
    const res = await fetch("/api/socios/portal/oficinas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    });
    if (res.ok) await cargar();
  }

  const qNorm = normalizarNombre(busca);
  const qTel = busca.replace(/\D/g, "");
  const coincide = (...campos: (string | null | undefined)[]) =>
    !qNorm || campos.some((c) => !!c && normalizarNombre(c).includes(qNorm)) || (qTel.length >= 4 && campos.some((c) => !!c && c.replace(/\D/g, "").includes(qTel)));
  const lista = (mias ?? [])
    .filter((m) => fEstado === "todos" || m.estado === fEstado)
    .filter((m) => !fPueblo || m.pueblo === fPueblo)
    .filter((m) => coincide(m.nombre, m.contactoNombre, m.email, m.telefono, m.pueblo, m.descripcion, m.notas));
  const otrasFiltradas = otras.filter((o) => coincide(o.nombre, o.pueblo));
  const pueblosMios = Array.from(new Set((mias ?? []).map((m) => m.pueblo).filter((x): x is string => !!x))).sort();

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Oficinas de contables {mias ? `(${mias.length} tuyas · ${mias.length + otras.length} en total)` : ""}
      </p>
      <div className="vc-card mb-3 flex flex-col gap-2">
        <p className="text-xs text-muted">
          Registra aquí cada oficina de contables que visites. Así nadie más la repite y tú le das seguimiento por 60 días
          (cada actualización renueva el plazo). Cuando el contable entra al portal, el status cambia solo a «Tiene el
          portal».
        </p>
        {!abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-pill bg-teal p-2 text-sm font-medium text-white"
          >
            + Registrar oficina
          </button>
        )}
        {abierto && (
          <form onSubmit={guardar} className="flex flex-col gap-2">
            {error && <p className="text-sm text-red">{error}</p>}
            <input
              value={f.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Nombre de la oficina"
              className="rounded-lg border border-border p-2 text-sm"
            />
            {coincidencias.length > 0 && (
              <div className="rounded-lg border border-border p-2 text-xs">
                <p className="mb-1 font-medium text-amb">Ojo: ya hay oficinas parecidas registradas</p>
                {coincidencias.map((c) => (
                  <p key={c.id} className="text-muted">
                    {c.nombre}
                    {c.pueblo ? ` · ${c.pueblo}` : ""} —{" "}
                    <span className={STATUS_COLOR[c.status]}>
                      {c.mia ? "es tuya" : STATUS_OFICINA_LABEL[c.status]}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <select
                value={f.pueblo}
                onChange={(e) => set("pueblo", e.target.value)}
                className="w-1/2 rounded-lg border border-border bg-transparent p-2 text-sm"
              >
                <option value="">Pueblo</option>
                {MUNICIPIOS_PR.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={f.estado}
                onChange={(e) => set("estado", e.target.value as EstadoSeguimiento)}
                className="w-1/2 rounded-lg border border-border bg-transparent p-2 text-sm"
              >
                {ESTADOS_SEGUIMIENTO.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_SEGUIMIENTO_LABEL[e]}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={f.contactoNombre}
              onChange={(e) => set("contactoNombre", e.target.value)}
              placeholder="Nombre del contacto (opcional)"
              className="rounded-lg border border-border p-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Email"
                type="email"
                inputMode="email"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
              <input
                value={f.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="Teléfono"
                type="tel"
                inputMode="tel"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
            </div>
            <input
              value={f.web}
              onChange={(e) => set("web", e.target.value)}
              placeholder="Página web (opcional)"
              className="rounded-lg border border-border p-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={f.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="Instagram (@usuario)"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
              <input
                value={f.facebook}
                onChange={(e) => set("facebook", e.target.value)}
                placeholder="Facebook (página)"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
            </div>
            <p className="text-xs font-medium text-muted">Sectores con los que trabaja</p>
            <Chips opciones={SECTORES} valor={f.sectores} onChange={(v) => set("sectores", v)} />
            <p className="text-xs font-medium text-muted">Se especializa en</p>
            <Chips opciones={ESPECIALIDADES} valor={f.especialidades} onChange={(v) => set("especialidades", v)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.remoto} onChange={(e) => set("remoto", e.target.checked)} />
              Atiende clientes a distancia
            </label>
            <textarea
              value={f.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              placeholder="Describe la oficina, comercio o práctica (lo que viste en la visita)"
              rows={2}
              maxLength={400}
              className="rounded-lg border border-border p-2 text-sm"
            />
            <input
              value={f.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Notas internas (solo tú las ves)"
              className="rounded-lg border border-border p-2 text-sm"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={guardando} className="flex-1 rounded-pill bg-teal p-2 text-sm font-medium text-white">
                {guardando ? "Guardando..." : editId ? "Guardar cambios" : "Registrar oficina"}
              </button>
              <button type="button" onClick={cerrarForm} className="rounded-pill border border-border px-4 text-sm">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nombre, oficina, email, teléfono o pueblo..."
        className="mb-2 w-full rounded-lg border border-border p-2 text-sm"
      />
      {porContacto.length > 0 && (
        <div className="vc-card mb-2 text-sm">
          <p className="mb-1 font-medium text-amb">Ya está registrada</p>
          {porContacto.map((c) => (
            <p key={c.id} className="text-muted">
              {c.nombre}
              {c.pueblo ? ` · ${c.pueblo}` : ""} —{" "}
              <span className={STATUS_COLOR[c.status]}>{c.mia ? "es tuya" : STATUS_OFICINA_LABEL[c.status]}</span>
            </p>
          ))}
        </div>
      )}

      {mias && mias.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(["todos", ...ESTADOS_SEGUIMIENTO] as const).map((e) => {
              const n = e === "todos" ? mias.length : mias.filter((m) => m.estado === e).length;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setFEstado(e)}
                  className={`rounded-pill border px-2.5 py-1 text-xs font-medium ${
                    fEstado === e ? "border-teal bg-teal text-white" : "border-border text-muted"
                  }`}
                >
                  {e === "todos" ? "Todas" : ESTADO_SEGUIMIENTO_LABEL[e]} · {n}
                </button>
              );
            })}
          </div>
          {pueblosMios.length > 1 && (
            <select
              value={fPueblo}
              onChange={(e) => setFPueblo(e.target.value)}
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            >
              <option value="">Todos los pueblos</option>
              {pueblosMios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {lista.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {lista.map((m) => (
            <div key={m.id} className="vc-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.nombre}</p>
                  <p className="truncate text-xs text-muted">
                    {[m.pueblo, m.contactoNombre, m.telefono ? fmtTel(m.telefono) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 text-right text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                  {STATUS_OFICINA_LABEL[m.status].split(" · ")[0].replace(" (seguimiento vencido)", "")}
                  {m.status === "en_seguimiento" && m.diasRestantes !== null ? ` · ${m.diasRestantes} d` : ""}
                  {m.status === "disponible" ? " · venció" : ""}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                {m.status === "tiene_portal" ? (
                  <span className="text-sm font-medium text-teal">Ya tiene el portal ✓</span>
                ) : (
                  <>
                    <span className="text-xs text-muted">Estado:</span>
                    <select
                      value={m.estado}
                      onChange={(e) => cambiarEstado(m, e.target.value as EstadoSeguimiento)}
                      className={`rounded-lg border border-border bg-transparent px-2 py-1 text-sm font-medium ${ESTADO_SEGUIMIENTO_COLOR[m.estado]}`}
                    >
                      {ESTADOS_SEGUIMIENTO.map((e) => (
                        <option key={e} value={e}>
                          {ESTADO_SEGUIMIENTO_LABEL[e]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setExpandida(expandida === m.id ? null : m.id)}
                  className="ml-auto text-sm text-muted"
                >
                  {expandida === m.id ? "Ocultar" : "Ver más"}
                </button>
              </div>
              {expandida === m.id && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                  {m.descripcion && <p>{m.descripcion}</p>}
                  {m.especialidades.length > 0 && <p className="text-muted">Especialidades: {m.especialidades.join(", ")}</p>}
                  {m.sectores.length > 0 && <p className="text-muted">Sectores: {m.sectores.join(", ")}</p>}
                  {m.notas && <p className="text-muted">Notas: {m.notas}</p>}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {m.telefono && (
                      <a href={`tel:+1${m.telefono}`} className="font-medium text-teal">
                        Llamar
                      </a>
                    )}
                    {m.telefono && (
                      <a href={`https://wa.me/1${m.telefono}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                        WhatsApp
                      </a>
                    )}
                    {m.email && (
                      <a href={`mailto:${m.email}`} className="font-medium text-teal">
                        Email
                      </a>
                    )}
                    {urlSocial("web", m.web) && (
                      <a href={urlSocial("web", m.web)!} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                        Web
                      </a>
                    )}
                    {urlSocial("instagram", m.instagram) && (
                      <a href={urlSocial("instagram", m.instagram)!} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                        Instagram
                      </a>
                    )}
                    {urlSocial("facebook", m.facebook) && (
                      <a href={urlSocial("facebook", m.facebook)!} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                        Facebook
                      </a>
                    )}
                    <button type="button" onClick={() => empezarEditar(m)} className="ml-auto font-medium text-teal">
                      {m.status === "tiene_portal" ? "Mis notas" : "Editar"}
                    </button>
                    {m.status !== "tiene_portal" && (
                      <button type="button" onClick={() => quitar(m)} className="text-muted">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {busca.trim() && lista.length === 0 && otrasFiltradas.length === 0 && porContacto.length === 0 && (
        <p className="mb-2 text-center text-sm text-muted">No hay oficinas que coincidan. Puedes registrarla.</p>
      )}

      {otras.length > 0 && (
        <div className="vc-card">
          <button
            type="button"
            onClick={() => setVerOtras(!verOtras)}
            className="flex w-full items-center justify-between text-sm font-medium"
          >
            <span>
              Oficinas de otros vendedores ({busca.trim() ? `${otrasFiltradas.length} de ${otras.length}` : otras.length})
            </span>
            <span className="text-muted">{verOtras || busca.trim() ? "Ocultar" : "Ver"}</span>
          </button>
          {(verOtras || busca.trim()) && (
            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
              {otrasFiltradas.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {o.nombre}
                    {o.pueblo ? <span className="text-muted"> · {o.pueblo}</span> : null}
                  </span>
                  <span className={`shrink-0 text-xs font-medium ${STATUS_COLOR[o.status]}`}>
                    {STATUS_OFICINA_LABEL[o.status].split(" · ")[0].replace(" (seguimiento vencido)", "")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
