"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { ordenBolaDeNieve, simularBolaDeNieve, type Deuda, type Metodo } from "@/lib/bola-de-nieve";

// Bola de nieve (22 oct 2026) — herramienta del plan gratis: escribes tus
// deudas y te dice en qué orden pagarlas (la de menor saldo primero), en
// cuántos meses quedas libre y cuánto pagas en intereses. Cálculo en
// lib/bola-de-nieve.ts, cero IA. Los demás planes usan el chat de VICTOR.
type Fila = { id: string; nombre: string; saldo: number; apr: number; pago_minimo: number };

function mesesATexto(m: number): string {
  const a = Math.floor(m / 12);
  const r = m % 12;
  const partes = [];
  if (a > 0) partes.push(`${a} ${a === 1 ? "año" : "años"}`);
  if (r > 0 || a === 0) partes.push(`${r} ${r === 1 ? "mes" : "meses"}`);
  return partes.join(" y ");
}

function fechaLibre(m: number): string {
  const f = new Date();
  f.setMonth(f.getMonth() + m);
  const t = new Intl.DateTimeFormat("es-PR", { month: "long", year: "numeric" }).format(f);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function DeudasPage() {
  const router = useRouter();
  const supabase = createClient();
  const [plan, setPlan] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("nieve");

  const [nombre, setNombre] = useState("");
  const [saldo, setSaldo] = useState("");
  const [apr, setApr] = useState("");
  const [minimo, setMinimo] = useState("");
  // Editar una deuda (22 oct 2026, "que todo sea editable por si hay
  // errores"): reutiliza el mismo formulario de arriba.
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function editar(f: Fila) {
    setEditandoId(f.id);
    setNombre(f.nombre);
    setSaldo(String(f.saldo));
    setApr(String(f.apr));
    setMinimo(String(f.pago_minimo));
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setNombre("");
    setSaldo("");
    setApr("");
    setMinimo("");
    setError(null);
  }

  async function cargar() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return router.push("/login");
    const [{ data: perfil }, { data }] = await Promise.all([
      supabase.from("users").select("plan").eq("id", u.user.id).maybeSingle(),
      supabase.from("deudas_plan").select("id, nombre, saldo, apr, pago_minimo").order("saldo", { ascending: true }),
    ]);
    setPlan(perfil?.plan ?? null);
    setFilas(((data ?? []) as Fila[]).map((d) => ({ ...d, saldo: Number(d.saldo), apr: Number(d.apr), pago_minimo: Number(d.pago_minimo) })));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function agregar() {
    setError(null);
    const s = Number(saldo);
    const a = apr === "" ? 0 : Number(apr);
    const m = minimo === "" ? 0 : Number(minimo);
    if (!nombre.trim() || !(s > 0)) return setError("Escribe el nombre y el saldo de la deuda.");
    if (a < 0 || a > 100 || m < 0) return setError("Revisa la tasa (0–100) y el pago mínimo.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error: e } = editandoId
      ? await supabase.from("deudas_plan").update({ nombre: nombre.trim(), saldo: s, apr: a, pago_minimo: m }).eq("id", editandoId).eq("owner_id", u.user.id)
      : await supabase.from("deudas_plan").insert({ owner_id: u.user.id, nombre: nombre.trim(), saldo: s, apr: a, pago_minimo: m });
    if (e) return setError("No se pudo guardar la deuda.");
    setEditandoId(null);
    setNombre("");
    setSaldo("");
    setApr("");
    setMinimo("");
    await cargar();
  }

  async function borrar(id: string) {
    await supabase.from("deudas_plan").delete().eq("id", id);
    await cargar();
  }

  const deudas: Deuda[] = filas.map((f) => ({ id: f.id, nombre: f.nombre, saldo: f.saldo, apr: f.apr, minimo: f.pago_minimo }));
  const extraNum = Math.max(0, Number(extra) || 0);
  const resultado = useMemo(() => simularBolaDeNieve(deudas, extraNum, metodo), [filas, extraNum, metodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const orden = ordenBolaDeNieve(deudas, metodo);
  const alt = useMemo(() => simularBolaDeNieve(deudas, extraNum, metodo === "nieve" ? "avalancha" : "nieve"), [filas, extraNum, metodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalDeuda = filas.reduce((s, f) => s + f.saldo, 0);
  const totalMinimos = filas.reduce((s, f) => s + f.pago_minimo, 0);

  if (!cargando && plan && plan !== "gratis") {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-1 text-sm font-medium">Esto lo hace VICTOR por ti</p>
          <p className="mb-4 text-xs text-muted">
            En tu plan, pídele a VICTOR en el chat que arme tu plan para pagar deudas (bola de nieve) con tus tarjetas y préstamos.
          </p>
          <button className="vc-btn-primary" onClick={() => router.push("/dashboard")}>
            Volver a Inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Pagar mis deudas</h1>
        <button onClick={() => router.push("/dashboard")} className="vc-btn-back">
          Volver
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">¿Cómo prefieres pagar tus deudas?</p>
        <p className="mt-1 text-xs text-white/80">
          En los dos métodos pagas el mínimo en todas las deudas y mandas todo lo extra a una sola. Lo que cambia es a cuál:
        </p>
        <p className={`mt-2 text-xs ${metodo === "nieve" ? "text-white" : "text-white/60"}`}>
          <span className="font-semibold">Bola de nieve:</span> a la deuda más pequeña. Al saldarla, su pago pasa a la siguiente y la bola va creciendo. Ganas impulso rápido porque cierras deudas pronto.
        </p>
        <p className={`mt-1.5 text-xs ${metodo === "avalancha" ? "text-white" : "text-white/60"}`}>
          <span className="font-semibold">Avalancha:</span> a la deuda con la tasa de interés más alta. Normalmente pagas menos intereses en total, aunque la primera deuda tarde más en desaparecer.
        </p>
        <div className="mt-2.5 flex gap-2">
          {(["nieve", "avalancha"] as Metodo[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetodo(m)}
              className={`rounded-pill px-3 py-1 text-xs font-medium ${metodo === m ? "bg-white text-[#1B3A5C]" : "border border-white/40 text-white"}`}
            >
              {m === "nieve" ? "Bola de nieve" : "Avalancha"}
            </button>
          ))}
        </div>
      </div>

      <div className="vc-card mb-4 flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide text-muted">{editandoId ? "Editar deuda" : "Añadir una deuda"}</p>
        {error && <p className="text-xs text-red">{error}</p>}
        <input className="vc-input" placeholder="Nombre (ej. Tarjeta Visa)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
        <div className="flex gap-2">
          <input className="vc-input" inputMode="decimal" placeholder="Saldo $" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          <input className="vc-input" inputMode="decimal" placeholder="Tasa anual %" value={apr} onChange={(e) => setApr(e.target.value)} />
          <input className="vc-input" inputMode="decimal" placeholder="Pago mínimo $" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="vc-btn-primary" onClick={agregar}>
            {editandoId ? "Guardar cambios" : "Añadir deuda"}
          </button>
          {editandoId && (
            <button type="button" className="rounded-lg border border-border px-4 text-sm text-muted" onClick={cancelarEdicion}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <p className="text-xs text-muted">Cargando...</p>
      ) : filas.length === 0 ? (
        <div className="vc-card text-center text-xs text-muted">Todavía no has añadido deudas.</div>
      ) : (
        <>
          <div className="vc-card mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tus deudas · orden de pago</p>
            <div className="flex flex-col divide-y divide-border">
              {orden.map((d, i) => {
                const fin = resultado.orden.find((o) => o.id === d.id);
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i + 1}. {d.nombre}
                      </p>
                      <p className="text-[11px] text-muted">
                        {formatMoney(d.saldo)} · {d.apr}% anual · mínimo {formatMoney(d.minimo)}
                        {fin ? ` · libre en ${mesesATexto(fin.mesesHastaSaldar)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button className="text-[11px] font-medium text-teal" onClick={() => { const f = filas.find((x) => x.id === d.id); if (f) editar(f); }}>
                        Editar
                      </button>
                      <button className="text-[11px] font-medium text-red" onClick={() => borrar(d.id)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              Total: <span className="font-medium text-text">{formatMoney(totalDeuda)}</span> · mínimos por mes:{" "}
              <span className="font-medium text-text">{formatMoney(totalMinimos)}</span>
            </p>
          </div>

          <div className="vc-card mb-4 flex flex-col gap-3">
            <label className="text-xs uppercase tracking-wide text-muted">¿Cuánto extra puedes pagar al mes?</label>
            <input className="vc-input" inputMode="decimal" placeholder="$ extra (opcional)" value={extra} onChange={(e) => setExtra(e.target.value)} />
            {resultado.mensajeError ? (
              <p className="text-xs text-red">{resultado.mensajeError}</p>
            ) : (
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm">
                  Quedas libre de deudas en <span className="font-medium text-teal">{mesesATexto(resultado.mesesTotal ?? 0)}</span>
                  {resultado.mesesTotal ? ` (${fechaLibre(resultado.mesesTotal)})` : ""}.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Pagarías unos <span className="font-medium text-text">{formatMoney(resultado.interesTotal)}</span> en intereses.
                  Pago total por mes: <span className="font-medium text-text">{formatMoney(totalMinimos + extraNum)}</span>.
                </p>
                {!alt.mensajeError && filas.length > 1 && (
                  <p className="mt-1 text-[11px] text-muted">
                    Con {metodo === "nieve" ? "avalancha" : "bola de nieve"}: {mesesATexto(alt.mesesTotal ?? 0)} y {formatMoney(alt.interesTotal)} en intereses.
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="text-center text-[11px] text-muted">Estimado: asume que pagas igual cada mes y no añades deuda nueva.</p>
        </>
      )}
    </div>
  );
}
