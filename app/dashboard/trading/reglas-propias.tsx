"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Mi checklist para entrar" (19 nov 2026): reglas que escribe el propio
// trader. En la Bitácora cada trade se marca ✓/✗ por regla y Estadísticas
// compara cómo le va cumpliéndolas vs no.
export type ReglaPropia = { id: string; texto: string; orden: number };

export default function ReglasPropias({ reglas, onCambio }: { reglas: ReglaPropia[]; onCambio: (r: ReglaPropia[]) => void }) {
  const supabase = createClient();
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [err, setErr] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function agregar() {
    const t = nueva.trim().slice(0, 120);
    if (!t) return;
    setOcupado(true);
    setErr("");
    const { data: u } = await supabase.auth.getUser();
    const orden = reglas.length ? Math.max(...reglas.map((r) => r.orden)) + 1 : 0;
    const { data, error } = await supabase.from("trading_reglas_propias").insert({ owner_id: u.user?.id, texto: t, orden }).select("id, texto, orden").single();
    setOcupado(false);
    if (error || !data) return setErr(error?.message ?? "No se pudo guardar.");
    onCambio([...reglas, data as ReglaPropia]);
    setNueva("");
  }

  async function guardarEdicion(r: ReglaPropia) {
    const t = texto.trim().slice(0, 120);
    if (!t) return;
    const { error } = await supabase.from("trading_reglas_propias").update({ texto: t }).eq("id", r.id);
    if (error) return setErr(error.message);
    onCambio(reglas.map((x) => (x.id === r.id ? { ...x, texto: t } : x)));
    setEditando(null);
  }

  async function borrar(r: ReglaPropia) {
    if (!confirm(`¿Borrar "${r.texto}"? También se borran sus marcas en tus trades.`)) return;
    const { error } = await supabase.from("trading_reglas_propias").delete().eq("id", r.id);
    if (error) return setErr(error.message);
    onCambio(reglas.filter((x) => x.id !== r.id));
  }

  async function mover(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= reglas.length) return;
    const lista = [...reglas];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    const conOrden = lista.map((r, k) => ({ ...r, orden: k }));
    onCambio(conOrden);
    await Promise.all(
      [conOrden[i], conOrden[j]].map((r) => supabase.from("trading_reglas_propias").update({ orden: r.orden }).eq("id", r.id))
    );
  }

  return (
    <div className="vc-card mb-4 flex flex-col gap-3">
      <p className="text-sm uppercase tracking-wide text-muted">Mi checklist para entrar</p>
      <p className="text-[14px] text-muted">
        Escribe tus propias reglas. En la Bitácora marcas en cada trade si las cumpliste (✓) o no (✗), y en Estadísticas ves cuánto ganas cuando las cumples y cuando no.
      </p>
      {reglas.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {reglas.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-[15px]">
              <span className="w-5 text-muted">{i + 1}.</span>
              {editando === r.id ? (
                <>
                  <input
                    className="vc-input flex-1 !py-1"
                    value={texto}
                    maxLength={120}
                    autoFocus
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") guardarEdicion(r);
                      if (e.key === "Escape") setEditando(null);
                    }}
                  />
                  <button className="text-sm font-medium text-[#1d6fe0]" onClick={() => guardarEdicion(r)}>Guardar</button>
                  <button className="text-sm text-muted" onClick={() => setEditando(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <span className="flex-1">{r.texto}</span>
                  <button className="px-1 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                  <button className="px-1 text-muted disabled:opacity-30" disabled={i === reglas.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
                  <button className="text-sm text-[#1d6fe0]" onClick={() => { setEditando(r.id); setTexto(r.texto); }}>Editar</button>
                  <button className="text-sm text-red" onClick={() => borrar(r)}>Borrar</button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <input
          className="vc-input flex-1"
          placeholder='Ej. "Tendencia a favor en H1", "Esperé confirmación", "No operé en noticias"'
          value={nueva}
          maxLength={120}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
        />
        <button className="rounded-lg bg-[#1d6fe0] px-4 text-base font-medium text-white disabled:opacity-50" disabled={ocupado || !nueva.trim()} onClick={agregar}>
          Añadir
        </button>
      </div>
      {err && <p className="text-sm text-red">{err}</p>}
    </div>
  );
}
