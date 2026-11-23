"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { marcarEmbudo } from "@/lib/embudo";
import { marcarCookieTradingCliente, PRECIO_CORE_TRADING } from "@/lib/trading-plan";

// Landing de VICTOR Core + Trading.
// 19 nov 2026 — primera versión (pedido de Joel): no vendemos un bot que gana,
// vendemos lo que evita que pierdas la cuenta.
// 21 nov 2026 — rediseño para que se vea igual que los anuncios de Meta
// (fondo oscuro, verde/rojo de trading, Space Grotesk + JetBrains Mono) y
// repita su mensaje: "Fondéate tú", "Haz la cuenta", "Empresario del
// trading", "Tu CFO y mentor de trading". Joel pidió que la gente se
// empodere y lo vea como algo serio, y que sea CORTA (4 bloques, poco
// texto). En vez de comparar precios de prop firms: "solo $179/año, lo que
// gastabas en evaluaciones ponlo a trabajar en tu cuenta". La parte de
// banco/presupuesto NO se vende aquí (distrae); se le muestra después por
// email y por VICTOR.
// El botón lleva a /registro con Core + Trading (cookie vc_trading, que lee
// el checkout) y conserva los UTM del anuncio.

// Fuentes servidas desde /public/fonts (no next/font/google: en el build de
// Vercel del 21 nov 2026 falló al descargarlas de Google y tumbó el deploy).
const sg = { className: "vt-sg" };
const jb = { className: "vt-jb" };
const FUENTES_CSS = [500, 700]
  .map(
    (w) =>
      `@font-face{font-family:"VT Space Grotesk";font-weight:${w};font-display:swap;src:url(/fonts/space-grotesk-latin-${w}-normal.woff2) format("woff2")}` +
      `@font-face{font-family:"VT JetBrains Mono";font-weight:${w};font-display:swap;src:url(/fonts/jetbrains-mono-latin-${w}-normal.woff2) format("woff2")}`,
  )
  .join("") +
  `.vt-sg{font-family:"VT Space Grotesk",ui-sans-serif,system-ui,sans-serif}.vt-jb{font-family:"VT JetBrains Mono",ui-monospace,monospace}`;


function Etiqueta({ children }: { children: ReactNode }) {
  return <p className={`${jb.className} mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#19E68C]`}>{children}</p>;
}


function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-[#0E131A] p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ${className}`}>{children}</div>;
}


// Réplica del panel del guardián en MT5 (datos de ejemplo).
function MockPanel() {
  return (
    <div>
    <Tarjeta className={`${jb.className} mx-auto w-full max-w-[400px] text-[13px]`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] text-[#7D8A96]">XAUUSD, M15 · Gold</span>
        <span className="rounded-full bg-[#19E68C]/15 px-2 py-0.5 text-[11px] font-bold text-[#19E68C]">● GUARDIÁN ACTIVO</span>
      </div>
      <div className="mb-3 flex gap-2">
        <span className="flex-1 rounded-lg bg-[#FF3D5A] py-2 text-center font-bold text-white">VENDER</span>
        <span className="flex-1 rounded-lg bg-[#19E68C] py-2 text-center font-bold text-[#07090D]">COMPRAR</span>
      </div>
      <p className="text-[#F5B544]">OK | perdedores hoy: 1/3 | P/L hoy: +18.40</p>
      <p className="text-[#19E68C]">lote 0.06 | stop 1.15 | riesgo $6.90 / $7.00</p>
      <p className="mt-2 text-[#5B6874]">Sync OK 10:42</p>
    </Tarjeta>
    <p className={`${jb.className} mt-2 text-center text-[11px] text-[#5B6874]`}>Ejemplo ilustrativo</p>
    </div>
  );
}

export default function TradingLanding() {
  const [href, setHref] = useState("/registro?plan=core&ciclo=mensual&trading=1");
  useEffect(() => {
    marcarCookieTradingCliente();
    marcarEmbudo("vista_trading");
    // Conserva los UTM del anuncio en el enlace de registro.
    const q = new URLSearchParams(window.location.search);
    const p = new URLSearchParams({ plan: "core", ciclo: "mensual", trading: "1" });
    q.forEach((v, k) => {
      if (k.startsWith("utm_")) p.set(k, v);
    });
    setHref(`/registro?${p.toString()}`);
  }, []);

  const boton = (texto: string) => (
    <Link
      href={href}
      onClick={() => marcarEmbudo("clic_cta_trading")}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19E68C] px-9 py-4 text-lg font-bold text-[#07090D] shadow-[0_0_40px_-5px_rgba(25,230,140,0.6)] transition hover:brightness-110 sm:w-auto"
    >
      {texto} <span aria-hidden>→</span>
    </Link>
  );

  const anual = PRECIO_CORE_TRADING.anual;
  const mensual = PRECIO_CORE_TRADING.mensual;

  const pilares = [
    { k: "El guardián", t: "Te frena antes de romper tus reglas.", d: "Calcula tu lote, pone tu stop y te cierra el día cuando llegas a tu límite. Como una prop firm, pero en tu cuenta.", s: "riesgo $6.90 / $7.00 ✓" },
    { k: "Tu bitácora", t: "Tus libros, sin Excel.", d: "Cada trade llega solo desde MT5. Marcas si cumpliste tu plan y ves dónde ganas y dónde se te va el dinero.", s: "+4.9% este mes · plan 92%" },
    { k: "Tu CFO y mentor", t: "Te lleva paso a paso.", d: "VICTOR conoce tu cuenta y tus reglas. Revisa tus números contigo y te dice qué te funciona, qué te cuesta y qué ajustar.", s: "“Nada de índices después de las 11”" },
  ];

  return (
    <main
      className={`${sg.className} min-h-screen bg-[#07090D] text-[#F2F5F7]`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 85% 0%, rgba(25,230,140,0.16), rgba(25,230,140,0) 40%), radial-gradient(circle at 0% 55%, rgba(25,230,140,0.07), rgba(25,230,140,0) 35%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 100% 100%, 54px 54px, 54px 54px",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: FUENTES_CSS }} />
      <div className="mx-auto max-w-6xl px-5 py-8 md:py-10">
        <header className="mb-14 flex items-center justify-between md:mb-20">
          <Link href="/" className="flex items-center gap-3">
            <img src="/victor-avatar.png" width={36} height={36} alt="VICTOR" className="rounded-full bg-white" />
            <span className="flex flex-col leading-tight">
              <span className="font-bold tracking-wide">VICTOR</span>
              <span className={`${jb.className} text-[10px] tracking-[0.2em] text-[#19E68C]`}>TU CFO Y MENTOR DE TRADING</span>
            </span>
          </Link>
          <Link href="/login" className="text-sm text-[#C9D2DA] underline underline-offset-4">
            Entrar
          </Link>
        </header>

        {/* 1. GANCHO */}
        <section className="mb-24 grid items-center gap-12 md:mb-32 md:grid-cols-[1.15fr_1fr]">
          <div>
            <Etiqueta>Para traders de MT5</Etiqueta>
            <h1 className="mb-5 text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
              Deja de pagar cuentas de fondeo.
              <br />
              <span className="text-[#19E68C]">Fondéate tú.</span>
            </h1>
            <p className="mb-8 max-w-xl text-lg text-[#C9D2DA] md:text-xl">Opera tu propio capital con reglas de prop firm y un CFO que te lleva paso a paso hacia la rentabilidad.</p>
            {boton("Pruébalo 7 días gratis")}
          </div>
          <MockPanel />
        </section>

        {/* 2. EL DINERO */}
        <section className="mb-24 md:mb-32">
          <Tarjeta className="mx-auto max-w-4xl border-[#19E68C]/30 bg-[#0B1511] p-8 text-center md:p-14">
            <p className="text-4xl font-bold tracking-tight text-[#19E68C] md:text-5xl">
              ${mensual}
              <span className="text-xl font-medium text-[#7D8A96] md:text-2xl"> /mes</span>
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-bold leading-tight md:text-5xl">Se paga solo.</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-[#C9D2DA]">
              Un solo trade de revancha que VICTOR te frena puede cubrir el mes. Y lo que gastabas en evaluaciones,{" "}
              <b className="text-[#19E68C]">ponlo a trabajar en tu cuenta.</b>
            </p>
            <p className="mx-auto mt-3 max-w-xl text-lg text-[#C9D2DA]">Empieza con el mínimo que acepte tu broker y escálalo con VICTOR.</p>
            <div className={`${jb.className} mt-8 flex flex-wrap justify-center gap-3 text-sm font-bold`}>
              {["Tu capital", "Tus reglas", "Tus ganancias", "Retiras cuando quieras"].map((x) => (
                <span key={x} className="rounded-full border border-[#19E68C]/40 px-4 py-2 text-[#19E68C]">
                  ✓ {x}
                </span>
              ))}
            </div>
          </Tarjeta>
        </section>

        {/* 3. EMPRESARIO */}
        <section className="mb-24 md:mb-32">
          <div className="mb-10 text-center">
            <Etiqueta>Empresario del trading</Etiqueta>
            <h2 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              El trading es un negocio rentable <span className="text-[#19E68C]">cuando tienes reglas claras y disciplina.</span>
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {pilares.map((p) => (
              <Tarjeta key={p.k} className="flex flex-col">
                <p className={`${jb.className} mb-3 text-xs font-bold uppercase tracking-widest text-[#19E68C]`}>{p.k}</p>
                <p className="mb-2 text-2xl font-bold leading-tight">{p.t}</p>
                <p className="mb-5 text-[#C9D2DA]">{p.d}</p>
                <p className={`${jb.className} mt-auto rounded-lg bg-white/5 px-3 py-2 text-[13px] text-[#19E68C]`}>
                  {p.s} <span className="text-[10px] font-medium text-[#5B6874]">· ej. ilustrativo</span>
                </p>
              </Tarjeta>
            ))}
          </div>
          <p className="mt-8 text-center text-lg text-[#C9D2DA]">
            ¿No tienes reglas? <b className="text-[#19E68C]">VICTOR te arma tu plan en 1 minuto.</b>
          </p>
        </section>

        {/* BROKERS — mucha gente no conoce MT5 ni los brokers (pedido de Joel,
            21 nov 2026). Solo ejemplos verificados que ofrecen MT5; en EE.UU. y
            PR solo brokers registrados en CFTC/NFA pueden ofrecerlo. No es
            recomendación. */}
        <section className="mb-24 md:mb-32">
          <Tarjeta className="mx-auto max-w-4xl p-8 md:p-10">
            <div className="mb-6 text-center">
              <Etiqueta>¿No tienes broker?</Etiqueta>
              <h2 className="text-2xl font-bold leading-tight md:text-3xl">MetaTrader 5 es gratis.</h2>
              <p className="mt-2 text-[#C9D2DA]">Algunos brokers que lo ofrecen:</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {[
                // Axi primero: es el que usa Joel. Acepta PR, Latam y España,
                // pero NO residentes de EE.UU. continental (no es NFA).
                { r: "Puerto Rico, Latinoamérica y España", b: ["Axi", "IC Markets", "Pepperstone", "XM", "Exness"] },
                { r: "Estados Unidos", b: ["FOREX.com", "OANDA", "Trading.com"] },
              ].map((g) => (
                <div key={g.r}>
                  <p className={`${jb.className} mb-3 text-xs font-bold uppercase tracking-widest text-[#7D8A96]`}>{g.r}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.b.map((n, i) => (
                      <span
                        key={n}
                        className={`rounded-full border px-4 py-2 text-sm font-bold ${i === 0 && n === "Axi" ? "border-[#19E68C]/60 bg-[#19E68C]/10 text-[#19E68C]" : "border-white/15 bg-white/5"}`}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-[#5B6874]">
              Ejemplos, no recomendaciones. Antes de abrir cuenta, verifica que el broker acepte clientes de tu país y permita asesores expertos (EAs). VICTOR te ayuda a
              conectarlo.
            </p>
          </Tarjeta>
        </section>

        {/* 4. CIERRE */}
        <section className="pb-10 text-center">
          <h2 className="mx-auto mb-8 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Empieza tu negocio <span className="text-[#19E68C]">de trading.</span>
          </h2>
          {boton("Empezar mis 7 días gratis")}
          <p className="mt-6 text-base font-bold text-[#F2F5F7]">
            <span className="text-[#19E68C]">Garantía:</span> pruébalo 7 días gratis. Si no es para ti, cancelas y no pagas nada.
          </p>
          <p className={`${jb.className} mt-3 text-xs leading-relaxed text-[#7D8A96]`}>
            Luego ${mensual}/mes o ${anual}/año · Cancela cuando quieras
            <br />
            MetaTrader 5 · Windows y Mac · Incluye VICTOR Core
          </p>
          <p className="mx-auto mt-12 max-w-2xl text-xs leading-relaxed text-[#5B6874]">
            VICTOR no da señales ni opera por ti, y no es asesoría financiera. Trading con apalancamiento conlleva alto riesgo; el guardián ayuda a cumplir tus reglas, pero no
            garantiza resultados. Los números de esta página son ejemplos ilustrativos.
          </p>
        </section>
      </div>
    </main>
  );
}
