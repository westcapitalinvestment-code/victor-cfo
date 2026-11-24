"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { marcarEmbudo } from "@/lib/embudo";
import { marcarCookieTradingCliente } from "@/lib/trading-plan";
import { armarPlan, type Experiencia, type Estilo, type Problema } from "@/lib/trading-plan-sugerido";
import { lineasPlan } from "@/lib/trading-plan-texto";

// Plan de trading GRATIS sin registro (24 nov 2026, pedido de Joel: "necesito
// vender"). El tráfico de Meta llega casi todo del celular y desde stories:
// pedirle que se registre para instalar algo en MT5 era demasiado de entrada
// (504 visitas, 0 registros). Aquí contesta 4 preguntas, ve su plan al
// instante y, si quiere, deja su email/WhatsApp para recibirlo; a Joel le llega
// el contacto para escribirle. Luego: "Activar mi guardián 7 días gratis".

const FUENTES_CSS =
  [500, 700]
    .map(
      (w) =>
        `@font-face{font-family:"VT Space Grotesk";font-weight:${w};font-display:swap;src:url(/fonts/space-grotesk-latin-${w}-normal.woff2) format("woff2")}` +
        `@font-face{font-family:"VT JetBrains Mono";font-weight:${w};font-display:swap;src:url(/fonts/jetbrains-mono-latin-${w}-normal.woff2) format("woff2")}`,
    )
    .join("") +
  `.vt-sg{font-family:"VT Space Grotesk",ui-sans-serif,system-ui,sans-serif}.vt-jb{font-family:"VT JetBrains Mono",ui-monospace,monospace}`;

const CAPITALES = [500, 1000, 2500, 5000, 10000];
const EXPERIENCIAS: { v: Experiencia; t: string }[] = [
  { v: "nuevo", t: "Estoy empezando" },
  { v: "menos1", t: "Menos de 1 año" },
  { v: "mas1", t: "Más de 1 año" },
];
const ESTILOS: { v: Estilo; t: string; d: string }[] = [
  { v: "scalping", t: "Scalping", d: "trades de minutos" },
  { v: "intradia", t: "Intradía", d: "abro y cierro el mismo día" },
  { v: "swing", t: "Swing", d: "dejo trades varios días" },
];
const PROBLEMAS: { v: Problema; t: string }[] = [
  { v: "revancha", t: "Después de perder, entro a recuperar" },
  { v: "sobreoperar", t: "Opero de más" },
  { v: "sin_stop", t: "Entro sin stop" },
  { v: "mover_stop", t: "Muevo el stop en contra" },
];

function utmActual(): Record<string, string> {
  const u: Record<string, string> = {};
  try {
    new URLSearchParams(window.location.search).forEach((v, k) => {
      if (k.startsWith("utm_")) u[k] = v.slice(0, 100);
    });
  } catch {}
  return u;
}

export default function PlanGratis() {
  const [paso, setPaso] = useState(0);
  const [capital, setCapital] = useState<number>(0);
  const [otro, setOtro] = useState("");
  const [exp, setExp] = useState<Experiencia | null>(null);
  const [estilo, setEstilo] = useState<Estilo | null>(null);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registro, setRegistro] = useState("/registro?plan=core&ciclo=mensual&trading=1");

  useEffect(() => {
    marcarCookieTradingCliente();
    marcarEmbudo("vista_plan");
    const p = new URLSearchParams({ plan: "core", ciclo: "mensual", trading: "1" });
    Object.entries(utmActual()).forEach(([k, v]) => p.set(k, v));
    setRegistro(`/registro?${p.toString()}`);
  }, []);

  const plan = useMemo(
    () =>
      capital > 0 && exp && estilo
        ? armarPlan({ capital, experiencia: exp, estilo, problemas, objetivo: "crecer", edad: "30a45", sesiones: [] })
        : null,
    [capital, exp, estilo, problemas],
  );

  function verPlan() {
    setPaso(4);
    marcarEmbudo("plan_listo");
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    setError(null);
    setEnviando(true);
    const r = await fetch("/api/trading/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, telefono: tel, respuestas: { capital, experiencia: exp, estilo, problemas }, utm: utmActual() }),
    })
      .then(async (x) => ({ ok: x.ok, j: (await x.json().catch(() => ({}))) as { error?: string } }))
      .catch(() => ({ ok: false, j: { error: "Sin conexión. Intenta otra vez." } }));
    setEnviando(false);
    if (!r.ok) {
      setError(r.j.error ?? "No se pudo enviar.");
      return;
    }
    setEnviado(true);
    marcarEmbudo("lead_ok");
  }

  const opcion = (activo: boolean) =>
    `w-full rounded-xl border px-5 py-4 text-left text-lg font-bold transition ${
      activo ? "border-[#19E68C] bg-[#19E68C]/15 text-[#19E68C]" : "border-white/15 bg-white/5 hover:border-[#19E68C]/50"
    }`;
  const botonVerde =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19E68C] px-8 py-4 text-lg font-bold text-[#07090D] shadow-[0_0_40px_-5px_rgba(25,230,140,0.6)] transition hover:brightness-110 disabled:opacity-40";

  return (
    <main className="vt-sg min-h-screen bg-[#07090D] text-[#F2F5F7]">
      <style dangerouslySetInnerHTML={{ __html: FUENTES_CSS }} />
      <div className="mx-auto max-w-xl px-5 py-6">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/trading" className="flex items-center gap-3">
            <img src="/victor-avatar.png" width={32} height={32} alt="VICTOR" className="rounded-full bg-white" />
            <span className="font-bold tracking-wide">VICTOR</span>
          </Link>
          {paso < 4 && <span className="vt-jb text-xs text-[#7D8A96]">{paso + 1} de 4</span>}
        </header>

        {paso === 0 && (
          <section>
            <p className="vt-jb mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#19E68C]">Tu plan gratis en 1 minuto</p>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Con cuánto operas (o piensas operar)?</h1>
            <div className="grid grid-cols-2 gap-3">
              {CAPITALES.map((c) => (
                <button
                  key={c}
                  className={opcion(capital === c && !otro)}
                  onClick={() => {
                    setCapital(c);
                    setOtro("");
                    setPaso(1);
                  }}
                >
                  ${c.toLocaleString("en-US")}
                </button>
              ))}
              <input
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-lg font-bold outline-none placeholder:text-[#5B6874] focus:border-[#19E68C]"
                inputMode="numeric"
                placeholder="Otro $"
                value={otro}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setOtro(v);
                  setCapital(Number(v) || 0);
                }}
              />
            </div>
            {otro && (
              <button className={`${botonVerde} mt-5`} disabled={capital <= 0} onClick={() => setPaso(1)}>
                Siguiente →
              </button>
            )}
            <p className="mt-6 text-sm text-[#7D8A96]">Es para calcular tus límites en dólares. No te pedimos depositar nada.</p>
          </section>
        )}

        {paso === 1 && (
          <section>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Cuánto llevas haciendo trading?</h1>
            <div className="flex flex-col gap-3">
              {EXPERIENCIAS.map((o) => (
                <button
                  key={o.v}
                  className={opcion(exp === o.v)}
                  onClick={() => {
                    setExp(o.v);
                    setPaso(2);
                  }}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </section>
        )}

        {paso === 2 && (
          <section>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Cómo operas?</h1>
            <div className="flex flex-col gap-3">
              {ESTILOS.map((o) => (
                <button
                  key={o.v}
                  className={opcion(estilo === o.v)}
                  onClick={() => {
                    setEstilo(o.v);
                    setPaso(3);
                  }}
                >
                  {o.t} <span className="block text-sm font-medium text-[#7D8A96]">{o.d}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {paso === 3 && (
          <section>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Qué te cuesta más?</h1>
            <p className="mb-6 text-[#C9D2DA]">Marca todas las que apliquen.</p>
            <div className="flex flex-col gap-3">
              {PROBLEMAS.map((o) => {
                const on = problemas.includes(o.v);
                return (
                  <button key={o.v} className={opcion(on)} onClick={() => setProblemas(on ? problemas.filter((x) => x !== o.v) : [...problemas, o.v])}>
                    {on ? "✓ " : ""}
                    {o.t}
                  </button>
                );
              })}
            </div>
            <button className={`${botonVerde} mt-6`} onClick={verPlan}>
              Ver mi plan →
            </button>
          </section>
        )}

        {paso === 4 && plan && (
          <section>
            <p className="vt-jb mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#19E68C]">Tu plan para ${capital.toLocaleString("en-US")}</p>
            <h1 className="mb-5 text-3xl font-bold leading-tight">Así protegerías tu cuenta como una prop firm.</h1>
            <div className="rounded-2xl border border-white/10 bg-[#0E131A] p-5">
              {lineasPlan(plan).map((l) => (
                <div key={l.k} className="flex flex-col border-b border-white/5 py-3 last:border-0">
                  <span className="text-sm text-[#7D8A96]">{l.k}</span>
                  <span className="vt-jb text-lg font-bold text-[#19E68C]">{l.v}</span>
                </div>
              ))}
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-[15px] text-[#C9D2DA]">
              {plan.razones.slice(0, 3).map((x) => (
                <li key={x}>• {x}</li>
              ))}
            </ul>

            {!enviado ? (
              <div className="mt-8 rounded-2xl border border-[#19E68C]/30 bg-[#0B1511] p-5">
                <p className="text-xl font-bold">¿Te lo mando con tu checklist?</p>
                <p className="mb-4 text-[#C9D2DA]">Para que lo tengas a mano antes de cada trade.</p>
                <input
                  className="mb-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg outline-none placeholder:text-[#5B6874] focus:border-[#19E68C]"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Tu email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="mb-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg outline-none placeholder:text-[#5B6874] focus:border-[#19E68C]"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="WhatsApp (opcional)"
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                />
                <p className="mb-4 text-xs text-[#7D8A96]">Si dejas tu WhatsApp, te podemos escribir para ayudarte. Nada de spam.</p>
                <button className={botonVerde} disabled={enviando || !email.includes("@")} onClick={enviar}>
                  {enviando ? "Enviando…" : "Enviármelo"}
                </button>
                {error && <p className="mt-3 text-sm text-[#FF3D5A]">{error}</p>}
              </div>
            ) : (
              <p className="mt-8 rounded-2xl border border-[#19E68C]/30 bg-[#0B1511] p-5 text-lg font-bold text-[#19E68C]">✓ Listo, revisa tu email.</p>
            )}

            <div className="mt-8 text-center">
              <p className="mb-4 text-lg text-[#C9D2DA]">
                Escribir las reglas es fácil. <b className="text-[#F2F5F7]">Cumplirlas en un mal día, no.</b> El guardián de VICTOR las pone solas en tu MT5.
              </p>
              <Link href={registro} onClick={() => marcarEmbudo("clic_cta_trading")} className={botonVerde}>
                Activar mi guardián 7 días gratis →
              </Link>
              <p className="vt-jb mt-3 text-xs text-[#7D8A96]">Sin tarjeta · cancela cuando quieras</p>
            </div>

            <p className="mt-10 text-xs leading-relaxed text-[#5B6874]">
              Plan orientativo con la lógica de las prop firms, no asesoría financiera. Trading con apalancamiento conlleva alto riesgo.
            </p>
          </section>
        )}

        {paso > 0 && paso < 4 && (
          <button className="mt-8 text-sm text-[#7D8A96] underline" onClick={() => setPaso(paso - 1)}>
            ← Atrás
          </button>
        )}
      </div>
    </main>
  );
}
