"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESPECIALIDADES,
  MUNICIPIOS_PR,
  SECTORES,
} from "@/lib/oficinas-contables";

// "Mi oficina" dentro del Portal Contable (migración 0163, 18 oct 2026). Lo
// que se llena aquí es lo que ven los clientes de VICTOR sin contable en el
// directorio. Aparece solo cuando el perfil está completo y el interruptor
// "Aparecer en el directorio" está encendido.

type Oficina = {
  nombre: string;
  contactoNombre: string;
  email: string;
  telefono: string;
  pueblo: string;
  web: string;
  instagram: string;
  facebook: string;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  descripcion: string;
  publicar: boolean;
  completo: boolean;
  sugerencia: string;
};

function Chips({ opciones, valor, onChange }: { opciones: readonly string[]; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const on = valor.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? valor.filter((x) => x !== o) : [...valor, o])}
            className={`rounded-pill border px-2.5 py-1 text-[11px] ${on ? "border-teal bg-teal text-white" : "border-border text-muted"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function PerfilOficinaPage() {
  const router = useRouter();
  const [o, setO] = useState<Oficina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch("/api/cpa/oficina")
      .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
      .then(({ ok, json }) => {
        if (ok) setO(json.oficina);
        else setError(json?.error || "No se pudo cargar tu perfil.");
      });
  }, []);

  function set<K extends keyof Oficina>(k: K, v: Oficina[K]) {
    setO((prev) => (prev ? { ...prev, [k]: v } : prev));
    setGuardado(false);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!o) return;
    setError(null);
    setGuardando(true);
    const res = await fetch("/api/cpa/oficina", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(o),
    });
    const json = await res.json().catch(() => null);
    setGuardando(false);
    if (!res.ok) {
      setError(json?.error || "No se pudo guardar.");
      return;
    }
    if (json?.oficina) setO(json.oficina);
    setGuardado(true);
  }

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Mi oficina</h1>
        <button onClick={() => router.push("/cpa")} className="vc-btn-back">
          ← Volver
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">Apareces en el directorio de contables de VICTOR</p>
        <p className="mt-1 text-xs text-white/80">
          Los usuarios de VICTOR que buscan contable pueden encontrarte por pueblo y especialidad y contactarte directo. Tu
          teléfono, correo, web y redes se muestran a los usuarios de VICTOR. Completa tu perfil para aparecer.
        </p>
      </div>

      {!o && !error && <p className="text-sm text-muted">Cargando...</p>}
      {error && !o && <p className="text-sm text-red">{error}</p>}

      {o && (
        <form onSubmit={guardar} className="vc-card mb-4 flex flex-col gap-3">
          {error && <p className="text-xs text-red">{error}</p>}
          <span
            className={`self-start rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              o.completo && o.publicar ? "border-teal text-teal" : "border-border text-muted"
            }`}
          >
            {!o.publicar ? "Oculta del directorio" : o.completo ? "Visible en el directorio ✓" : "Perfil incompleto — aún no apareces"}
          </span>

          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Nombre de la oficina
            <input value={o.nombre} onChange={(e) => set("nombre", e.target.value)} className="rounded-lg border border-border p-2 text-sm font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Nombre de contacto
            <input
              value={o.contactoNombre}
              onChange={(e) => set("contactoNombre", e.target.value)}
              placeholder="Opcional"
              className="rounded-lg border border-border p-2 text-sm font-normal"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex w-1/2 flex-col gap-1 text-[12px] font-medium">
              Pueblo
              <select value={o.pueblo} onChange={(e) => set("pueblo", e.target.value)} className="rounded-lg border border-border bg-transparent p-2 text-sm font-normal">
                <option value="">Escoge...</option>
                {MUNICIPIOS_PR.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-1/2 flex-col gap-1 text-[12px] font-medium">
              Teléfono
              <input
                value={o.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                type="tel"
                inputMode="tel"
                placeholder="787-555-1234"
                className="rounded-lg border border-border p-2 text-sm font-normal"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted">Correo que se muestra: {o.email} (el de tu cuenta).</p>

          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Página web
            <input value={o.web} onChange={(e) => set("web", e.target.value)} placeholder="www.tuoficina.com" className="rounded-lg border border-border p-2 text-sm font-normal" />
          </label>
          <div className="flex gap-2">
            <label className="flex w-1/2 flex-col gap-1 text-[12px] font-medium">
              Instagram
              <input value={o.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@tuoficina" className="rounded-lg border border-border p-2 text-sm font-normal" />
            </label>
            <label className="flex w-1/2 flex-col gap-1 text-[12px] font-medium">
              Facebook
              <input value={o.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="Página de Facebook" className="rounded-lg border border-border p-2 text-sm font-normal" />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium">Sectores con los que trabajas</p>
            <Chips opciones={SECTORES} valor={o.sectores} onChange={(v) => set("sectores", v)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium">Te especializas en</p>
            <Chips opciones={ESPECIALIDADES} valor={o.especialidades} onChange={(v) => set("especialidades", v)} />
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={o.remoto} onChange={(e) => set("remoto", e.target.checked)} />
            Atiendo clientes a distancia
          </label>

          <label className="flex flex-col gap-1 text-[12px] font-medium">
            Describe tu oficina, comercio o práctica
            <textarea
              value={o.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={4}
              maxLength={400}
              placeholder="Cuéntales qué haces, a quién atiendes y cuánta experiencia tienes."
              className="rounded-lg border border-border p-2 text-sm font-normal"
            />
            <span className="text-[11px] font-normal text-muted">
              Esta descripción se muestra a los clientes de VICTOR CFO que buscan contable. {o.descripcion.length}/400
            </span>
            {!o.descripcion && o.sugerencia && (
              <button type="button" onClick={() => set("descripcion", o.sugerencia)} className="self-start text-[11px] font-medium text-teal">
                Usar la descripción que escribió tu representante de VICTOR
              </button>
            )}
          </label>

          <label className="flex items-center gap-2 text-[12px] font-medium">
            <input type="checkbox" checked={o.publicar} onChange={(e) => set("publicar", e.target.checked)} />
            Aparecer en el directorio de contables
          </label>

          <button type="submit" disabled={guardando} className="rounded-pill bg-teal p-2.5 text-sm font-medium text-white">
            {guardando ? "Guardando..." : guardado ? "Guardado ✓" : "Guardar perfil"}
          </button>
        </form>
      )}
    </div>
  );
}
