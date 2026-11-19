"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { marcarCookieTradingCliente, PRECIO_CORE_TRADING } from "@/lib/trading-plan";

// Landing de VICTOR Core + Trading (19 nov 2026, pedido de Joel). Se vende por
// redes, sin vendedor. Mensaje: no vendemos un bot que gana — vendemos lo que
// evita que pierdas la cuenta. El botón lleva a /registro con Core + Trading
// (cookie vc_trading, que lee el checkout) y conserva los UTM del anuncio.

function Punto({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-base">
      <span className="mt-0.5 text-teal" aria-hidden>
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function Seccion({ etiqueta, titulo, texto, puntos, mock, invertir }: { etiqueta: string; titulo: string; texto: string; puntos: string[]; mock: ReactNode; invertir?: boolean }) {
  return (
    <section className="mb-20 grid items-center gap-8 md:mb-28 md:grid-cols-2 md:gap-16">
      <div className={invertir ? "md:order-2" : ""}>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-teal">{etiqueta}</p>
        <h2 className="mb-2 text-xl font-semibold leading-tight">{titulo}</h2>
        <p className="mb-3 text-base text-muted">{texto}</p>
        <ul className="flex flex-col gap-1.5">
          {puntos.map((p) => (
            <Punto key={p}>{p}</Punto>
          ))}
        </ul>
      </div>
      <div className={invertir ? "md:order-1" : ""}>{mock}</div>
    </section>
  );
}

// Réplica del panel del guardián en MT5 (datos de ejemplo).
function MockPanel() {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-xl border border-border bg-white p-3 font-mono text-[12px] shadow-lg">
      <p className="mb-2 text-[11px] text-muted">XAUUSD, M15 · Gold</p>
      <div className="mb-2 flex gap-2">
        <span className="rounded bg-[#B22222] px-4 py-1.5 font-sans text-white">VENDER</span>
        <span className="rounded bg-[#2E8B57] px-4 py-1.5 font-sans text-white">COMPRAR</span>
      </div>
      <p className="text-[#d97706]">OK | perdedores hoy: 1/3 | P/L hoy: +18.40</p>
      <p className="text-[#228B22]">XAUUSD lote 0.06 | stop 1.15 | riesgo $6.90 / $7.00</p>
      <p className="mt-1 text-[#bbb]">Sync OK 10:42</p>
      <p className="mt-1 text-[15px] text-[#1E90FF]">P/L hoy: +$18.40</p>
    </div>
  );
}

function MockLimites() {
  const barras = [
    { k: "Pérdida del día", t: "$7.00 de $21.00", p: 33, c: "bg-teal" },
    { k: "Trades perdedores", t: "1 de 3", p: 33, c: "bg-teal" },
    { k: "Trades del día", t: "4 de 6", p: 66, c: "bg-[#d97706]" },
  ];
  return (
    <div className="vc-card mx-auto w-full max-w-[360px] shadow-lg">
      <p className="mb-2 text-sm font-medium">Tus límites de hoy</p>
      <div className="flex flex-col gap-2">
        {barras.map((b) => (
          <div key={b.k}>
            <div className="flex justify-between text-[13px]">
              <span>{b.k}</span>
              <span className="text-muted">{b.t}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div className={`h-full ${b.c}`} style={{ width: `${b.p}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockRendimiento() {
  const t = [
    { k: "Hoy", v: "+1.20%", d: "+$18.40" },
    { k: "Este mes", v: "+4.85%", d: "+$71.30" },
    { k: "Este año", v: "+11.2%", d: "+$152.00" },
    { k: "Total", v: "+13.6%", d: "+$181.20" },
  ];
  return (
    <div className="mx-auto grid w-full max-w-[360px] grid-cols-2 gap-2">
      {t.map((x) => (
        <div key={x.k} className="vc-card !p-3 shadow">
          <p className="text-[12px] uppercase tracking-wide text-muted">{x.k}</p>
          <p className="text-lg font-medium text-teal">{x.v}</p>
          <p className="text-[12px] text-muted">{x.d}</p>
        </div>
      ))}
    </div>
  );
}

export default function TradingLanding() {
  const [href, setHref] = useState("/registro?plan=core&ciclo=mensual&trading=1");
  useEffect(() => {
    marcarCookieTradingCliente();
    // Conserva los UTM del anuncio en el enlace de registro.
    const q = new URLSearchParams(window.location.search);
    const p = new URLSearchParams({ plan: "core", ciclo: "mensual", trading: "1" });
    q.forEach((v, k) => {
      if (k.startsWith("utm_")) p.set(k, v);
    });
    setHref(`/registro?${p.toString()}`);
  }, []);

  const boton = (texto: string) => (
    <Link href={href} className="vc-btn-primary inline-block px-6 py-3 text-base">
      {texto}
    </Link>
  );

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-5xl px-5 py-10 md:py-16">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/victor-avatar.png" width={28} height={28} alt="VICTOR" className="rounded-full" />
            VICTOR CFO
          </Link>
          <Link href="/login" className="text-sm text-muted underline">
            Entrar
          </Link>
        </header>

        <section className="mb-20 text-center md:mb-28">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-teal">Para traders de MT5 · forex, oro, índices, cripto</p>
          <h1 className="mx-auto mb-4 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">Tus reglas de trading, cumplidas sin excepciones.</h1>
          <p className="mx-auto mb-6 max-w-2xl text-lg text-muted">
            No es un bot que promete ganar. Es el guardián que te impide perder la cuenta: calcula tu lote, pone tu stop y te bloquea cuando llegas a tu límite del día.
          </p>
          {boton("Pruébalo 7 días gratis")}
          <p className="mt-3 text-sm text-muted">
            Luego ${PRECIO_CORE_TRADING.mensual}/mes o ${PRECIO_CORE_TRADING.anual}/año. Cancela cuando quieras.
          </p>
        </section>

        <Seccion
          etiqueta="El guardián"
          titulo="Pones cuánto puedes perder. Él hace la matemática."
          texto="Ej. $21 al día y 3 pérdidas = $7 por trade. En cualquier activo, el guardián calcula el lote para que si toca el stop pierdas exactamente eso."
          puntos={[
            "Lote automático en forex, oro, índices, acciones y cripto",
            "Stop según lo que se mueve cada activo (ATR)",
            "Luz verde cuando el trade cabe en tu riesgo; rojo cuando no",
            "Funciona con sus botones o con el Trading Panel de MT5",
          ]}
          mock={<MockPanel />}
        />

        <Seccion
          invertir
          etiqueta="Como una cuenta de fondeo"
          titulo="Llegas a tu límite y se acabó el día."
          texto="Las cuentas se queman en los días malos, por revancha y por operar de más. El guardián te bloquea antes de que eso pase y te explica por qué."
          puntos={[
            "Pérdida máxima del día y número de pérdidas",
            "Máximo de trades al día y espera tras una pérdida",
            "Activos prohibidos: los que te queman la cuenta",
            "Si abres algo fuera de tus reglas, lo cierra al instante",
          ]}
          mock={<MockLimites />}
        />

        <Seccion
          etiqueta="Bitácora y números"
          titulo="Sabes si de verdad estás ganando."
          texto="Tus trades llegan solos desde MT5. Ves tu % de hoy, del mes y del año, tu calendario y cuánto te costó romper tus reglas."
          puntos={["Bitácora automática, sin Excel", "% ganado o perdido sobre la cuenta", "Calendario de días verdes y rojos", "Cumplimiento de reglas trade por trade"]}
          mock={<MockRendimiento />}
        />

        <section className="mb-20 md:mb-28">
          <div className="vc-card mx-auto max-w-2xl text-center">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-teal">Incluido</p>
            <h2 className="mb-2 text-xl font-semibold">También organiza tu dinero</h2>
            <p className="text-base text-muted">
              Core + Trading trae todo VICTOR Core: presupuesto, deudas, metas y tu CFO con IA. Cuando tu trading crezca, VICTOR te dice cuándo conviene tratarlo como un
              negocio.
            </p>
          </div>
        </section>

        <section className="text-center">
          <h2 className="mb-2 text-2xl font-semibold">Cuesta menos que lo que pierdes en un mal trade.</h2>
          <p className="mb-5 text-base text-muted">
            ${PRECIO_CORE_TRADING.mensual}/mes · 7 días gratis · solo MetaTrader 5 por ahora
          </p>
          {boton("Empezar mis 7 días gratis")}
          <p className="mx-auto mt-6 max-w-2xl text-xs text-muted">
            VICTOR no da señales ni opera por ti, y no es asesoría financiera. Trading con apalancamiento conlleva alto riesgo; el guardián ayuda a cumplir tus reglas,
            pero no garantiza resultados. Deslizamientos y huecos de precio pueden hacer que una pérdida supere tu límite.
          </p>
        </section>
      </div>
    </main>
  );
}
