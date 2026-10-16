"use client";

import { useEffect, useState } from "react";

type Config = {
  activo: boolean; tope_diario: number; dias_seguimiento: number; direccion_fisica: string;
  asunto_1: string; cuerpo_1: string; asunto_2: string; cuerpo_2: string;
};
type Prospecto = {
  id: string; email: string; nombre: string | null; empresa: string | null; nota: string | null;
  estado: string; error_detalle: string | null; enviado_1_at: string | null; enviado_2_at: string | null;
};

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente", enviado_1: "Enviado", enviado_2: "Seguimiento enviado",
  respondio: "Respondió", baja: "Baja", error: "Error",
};

export default function MercadeoPanel() {
  const [c, setC] = useState<Config | null>(null);
  const [remitenteOk, setRemitenteOk] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [lista, setLista] = useState<Prospecto[]>([]);
  const [texto, setTexto] = useState("");
  const [fuente, setFuente] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const [a, b] = await Promise.all([fetch("/api/mkt/config"), fetch("/api/mkt/prospectos")]);
    const ca = await a.json(); const pb = await b.json();
    setC(ca.config); setRemitenteOk(!!ca.remitenteConfigurado); setReplyTo(ca.replyTo ?? null);
    setLista(pb.prospectos ?? []);
  }
  useEffect(() => { cargar(); }, []);

  async function guardarConfig() {
    if (!c) return;
    setOcupado(true);
    const r = await fetch("/api/mkt/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    const d = await r.json();
    setMsg(r.ok ? "Guardado." : d.error ?? "Error.");
    setOcupado(false);
  }
  async function prueba() {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/mkt/prueba", { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `Prueba enviada a ${d.a}.` : d.error ?? "Error.");
    setOcupado(false);
  }
  async function agregar() {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/mkt/prospectos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, fuente }) });
    const d = await r.json();
    if (r.ok) {
      setMsg(`Agregados: ${d.agregados}. Omitidos (ya existían o ya son usuarios): ${d.omitidos}.${d.invalidos ? ` Inválidos: ${d.invalidos}.` : ""}`);
      setTexto(""); cargar();
    } else setMsg(d.error ?? "Error.");
    setOcupado(false);
  }
  async function marcar(id: string, estado: string) {
    await fetch("/api/mkt/prospectos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, estado }) });
    cargar();
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar este prospecto?")) return;
    await fetch(`/api/mkt/prospectos?id=${id}`, { method: "DELETE" });
    cargar();
  }

  if (!c) return <p className="text-sm text-muted">Cargando…</p>;
  const cuenta = (e: string) => lista.filter((p) => p.estado === e).length;
  const visibles = filtro === "todos" ? lista : lista.filter((p) => p.estado === filtro);
  const campo = "vc-input w-full";

  return (
    <div className="flex flex-col gap-3">
      {!remitenteOk && (
        <div className="vc-card text-sm" style={{ borderColor: "#c2410c" }}>
          Falta la variable <b>MKT_FROM_EMAIL</b> en Vercel (ej. <code>Joel de VICTOR CFO &lt;contacto@mercadeo.victorcfo.com&gt;</code>). Sin ella no se envía nada.
        </div>
      )}
      {remitenteOk && !replyTo && (
        <div className="vc-card text-sm">Tip: pon <b>MKT_REPLY_TO</b> en Vercel con el correo donde quieres recibir las respuestas.</div>
      )}

      <div className="vc-card grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-5">
        {["pendiente", "enviado_1", "enviado_2", "respondio", "baja"].map((e) => (
          <div key={e}><p className="text-xl font-medium">{cuenta(e)}</p><p className="text-[10px] uppercase text-muted">{ESTADOS[e]}</p></div>
        ))}
      </div>

      <div className="vc-card flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Agregar prospectos</p>
        <p className="text-[11px] text-muted">Una línea por prospecto: <code>email, nombre, empresa, nota</code>. Solo negocios que publican su correo para consultas.</p>
        <textarea className={campo} rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"info@ejemplocpa.com, Carlos, Ejemplo CPA, contable en Bayamón"} />
        <input className={campo} value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Fuente (opcional): Instagram, Facebook…" />
        <div><button className="vc-btn-primary" disabled={ocupado || !texto.trim()} onClick={agregar}>Agregar a la lista</button></div>
      </div>

      <div className="vc-card flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Envío automático</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.activo} onChange={(e) => setC({ ...c, activo: e.target.checked })} /> Activo
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-1">Máx. por día <input type="number" className="vc-input w-20" value={c.tope_diario} onChange={(e) => setC({ ...c, tope_diario: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-1">Seguimiento a los <input type="number" className="vc-input w-16" value={c.dias_seguimiento} onChange={(e) => setC({ ...c, dias_seguimiento: Number(e.target.value) })} /> días</label>
        </div>
        <p className="text-[11px] text-muted">Se envía de lunes a viernes, ~10:15 a.m. Empieza con pocos al día (10) y sube poco a poco. Un correo y un solo seguimiento.</p>
        <input className={campo} value={c.direccion_fisica} onChange={(e) => setC({ ...c, direccion_fisica: e.target.value })} placeholder="Dirección física (obligatoria por ley en el pie del correo)" />
        <p className="text-[11px] text-muted">Variables: {"{{nombre}} {{empresa}} {{nota}}"}. El pie con baja y dirección se agrega solo.</p>
        <input className={campo} value={c.asunto_1} onChange={(e) => setC({ ...c, asunto_1: e.target.value })} placeholder="Asunto 1" />
        <textarea className={campo} rows={9} value={c.cuerpo_1} onChange={(e) => setC({ ...c, cuerpo_1: e.target.value })} />
        <input className={campo} value={c.asunto_2} onChange={(e) => setC({ ...c, asunto_2: e.target.value })} placeholder="Asunto seguimiento" />
        <textarea className={campo} rows={6} value={c.cuerpo_2} onChange={(e) => setC({ ...c, cuerpo_2: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <button className="vc-btn-primary" disabled={ocupado} onClick={guardarConfig}>Guardar</button>
          <button className="vc-btn-back" disabled={ocupado} onClick={prueba}>Enviarme una prueba</button>
        </div>
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Prospectos ({lista.length})</p>
          <select className="vc-input w-40" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {visibles.length === 0 ? <p className="text-sm text-muted">Nada por aquí.</p> : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {visibles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate">{p.nombre || p.email}{p.empresa ? ` · ${p.empresa}` : ""}</p>
                  <p className="truncate text-[11px] text-muted">{p.email} · {ESTADOS[p.estado] ?? p.estado}{p.error_detalle ? ` (${p.error_detalle})` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.estado !== "respondio" && p.estado !== "baja" && <button className="vc-btn-back text-xs" onClick={() => marcar(p.id, "respondio")}>Respondió</button>}
                  {p.estado !== "baja" && <button className="vc-btn-back text-xs" onClick={() => borrar(p.id)}>Borrar</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
