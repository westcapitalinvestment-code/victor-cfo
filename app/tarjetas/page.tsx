"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { marcarEmbudo } from "@/lib/embudo";

// Embudo de tarjetas (24 nov 2026, pedido de Joel). Anuncios de intriga
// ("¿Cuándo sales de tus tarjetas?", "Cancelaste esa suscripción… ¿seguro?").
// Aquí se le enseña SOLO el golpe —en qué fecha sale pagando como paga y
// cuánto le regala al banco— sin explicar el método. El camino más corto y
// los cobros que se repiten los ve DENTRO de VICTOR al conectar su cuenta
// (prueba de 7 días sin tarjeta). Caso real: un dueño de negocio tenía un
// cobro de ~$38/mes que creía cancelado.

const DEUDAS = [1000, 3000, 5000, 10000, 20000];
const PAGOS: { v: number | "minimo"; t: string }[] = [
  { v: "minimo", t: "El mínimo" },
  { v: 100, t: "$100" },
  { v: 200, t: "$200" },
  { v: 400, t: "$400" },
];
const INTERESES: { v: number; t: string }[] = [
  { v: 24, t: "No sé" },
  { v: 18, t: "Menos de 20%" },
  { v: 24, t: "Entre 20% y 27%" },
  { v: 29, t: "Más de 27%" },
];
const SUSCRIPCIONES = ["0 a 2", "3 a 5", "6 o más", "Ni idea"];

// Anuncios que hablan de cobros/suscripciones olvidadas ("intriga" y
// "olvidados"): la página abre por ahí, sin fricción, en vez de por la deuda.
// ?v=cobros fuerza el modo para pruebas.
const ANUNCIOS_COBROS = ["52632311582245", "52632321552845"];
const SUMAS: { v: number; t: string }[] = [
  { v: 25, t: "Menos de $25" },
  { v: 50, t: "$25 a $75" },
  { v: 110, t: "$75 a $150" },
  { v: 200, t: "Más de $150" },
  { v: 0, t: "Ni idea" },
];

type Resultado = { meses: number | null; intereses: number };

// Proyección mes a mes. "El mínimo" = lo que suelen pedir los bancos: 1% del
// balance + los intereses del mes, nunca menos de $25.
function proyectar(deuda: number, pago: number | "minimo", apr: number): Resultado {
  const r = apr / 100 / 12;
  let bal = deuda;
  let intereses = 0;
  for (let m = 1; m <= 600; m++) {
    const i = bal * r;
    const cuota = pago === "minimo" ? Math.max(25, bal * 0.01 + i) : pago;
    if (pago !== "minimo" && cuota <= i) return { meses: null, intereses: 0 };
    intereses += i;
    bal = bal + i - cuota;
    if (bal <= 0.5) return { meses: m, intereses };
  }
  return { meses: null, intereses };
}

function fechaEn(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toLocaleDateString("es", { month: "long", year: "numeric" });
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function Tarjetas() {
  const [paso, setPaso] = useState(0);
  const [deuda, setDeuda] = useState(0);
  const [otraDeuda, setOtraDeuda] = useState("");
  const [pago, setPago] = useState<number | "minimo" | null>(null);
  const [otroPago, setOtroPago] = useState("");
  const [apr, setApr] = useState(24);
  const [negocio, setNegocio] = useState(false);
  const [utm, setUtm] = useState("");
  const [cobros, setCobros] = useState(false);
  const [suma, setSuma] = useState(0);

  useEffect(() => {
    marcarEmbudo("vista_tarjetas");
    const q = new URLSearchParams(window.location.search);
    const p = new URLSearchParams();
    q.forEach((v, k) => {
      if (k.startsWith("utm_")) p.set(k, v);
    });
    setUtm(p.toString());
    if (q.get("v") === "cobros" || ANUNCIOS_COBROS.includes(q.get("utm_content") ?? "")) setCobros(true);
  }, []);

  const res = useMemo(() => (deuda > 0 && pago !== null ? proyectar(deuda, pago, apr) : null), [deuda, pago, apr]);
  const registro = `/registro?plan=${negocio ? "pro" : "core"}&ciclo=mensual${utm ? `&${utm}` : ""}`;

  function verResultado(esNegocio: boolean) {
    setNegocio(esNegocio);
    setPaso(cobros ? 13 : 5);
    marcarEmbudo("tarjetas_resultado");
    window.scrollTo({ top: 0 });
  }

  const opcion = (activo: boolean) =>
    `w-full rounded-xl border px-5 py-4 text-left text-lg font-semibold transition ${
      activo ? "border-[#19E68C] bg-[#19E68C]/15 text-[#19E68C]" : "border-white/15 bg-white/5 hover:border-[#19E68C]/50"
    }`;
  const verde =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19E68C] px-8 py-4 text-lg font-bold text-[#07090D] shadow-[0_0_40px_-5px_rgba(25,230,140,0.55)] transition hover:brightness-110 disabled:opacity-40";
  const campo =
    "rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-lg font-semibold outline-none placeholder:text-[#5B6874] focus:border-[#19E68C]";

  return (
    <main className="min-h-screen bg-[#07090D] text-[#F2F5F7]" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-xl px-5 py-6">
        <header className="mb-8 flex items-center justify-between">
          <span className="flex items-center gap-3">
            <img src="/victor-avatar.png" width={32} height={32} alt="VICTOR" className="rounded-full bg-white" />
            <span className="font-bold tracking-wide">VICTOR</span>
          </span>
          {!cobros && paso < 5 && <span className="text-xs text-[#7D8A96]">{paso + 1} de 5</span>}
          {cobros && paso < 13 && <span className="text-xs text-[#7D8A96]">{paso === 0 ? 1 : paso - 9} de 3</span>}
        </header>

        {cobros && paso === 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#19E68C]">20 segundos · sin registrarte</p>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Qué te están cobrando que ya olvidaste?</h1>
            <p className="mb-6 text-[#C9D2DA]">
              Streaming, apps, membresías, ese servicio que probaste una vez… ¿Cuántos crees que pagas cada mes?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SUSCRIPCIONES.map((t) => (
                <button key={t} className={opcion(false)} onClick={() => setPaso(11)}>
                  {t}
                </button>
              ))}
            </div>
          </section>
        )}

        {cobros && paso === 11 && (
          <section>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Cuánto crees que suman al mes?</h1>
            <p className="mb-6 text-[#C9D2DA]">A ojo. No hay respuesta mala.</p>
            <div className="flex flex-col gap-3">
              {SUMAS.map((o) => (
                <button
                  key={o.t}
                  className={opcion(false)}
                  onClick={() => {
                    setSuma(o.v);
                    setPaso(12);
                  }}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </section>
        )}

        {cobros && paso === 12 && (
          <section>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Salen de tu tarjeta personal o la de tu negocio?</h1>
            <div className="flex flex-col gap-3">
              <button className={opcion(false)} onClick={() => verResultado(false)}>
                Personal
              </button>
              <button className={opcion(false)} onClick={() => verResultado(true)}>
                De mi negocio
              </button>
              <button className={opcion(false)} onClick={() => verResultado(true)}>
                Las dos
              </button>
            </div>
          </section>
        )}

        {cobros && paso === 13 && (
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#FF3D5A]">Lo que sale de tu tarjeta</p>
            {suma > 0 ? (
              <h1 className="mb-3 text-4xl font-bold leading-tight">
                Son <span className="text-[#FF3D5A]">{usd(suma * 12)} al año</span>.
              </h1>
            ) : (
              <h1 className="mb-3 text-4xl font-bold leading-tight">No sabes cuánto te cobran.</h1>
            )}
            <p className="text-lg text-[#C9D2DA]">
              {suma > 0 ? "Y eso es lo que recuerdas. " : "Y eso es justo lo que les pasa a casi todos. "}
              Lo que se te olvidó no aparece en tu cuenta mental: aparece en el estado de cuenta.
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-[#0E131A] p-5">
              <p className="text-xl font-bold">Caso real</p>
              <p className="mt-2 text-[15px] text-[#C9D2DA]">
                Un dueño de negocio creía que había cancelado un servicio. Seguía saliendo:{" "}
                <b className="text-[#F2F5F7]">$38 al mes</b>, <b className="text-[#19E68C]">$456 al año</b> por nada.
              </p>
            </div>

            <div className="mt-8 text-center">
              <Link href={registro} onClick={() => marcarEmbudo("clic_tarjetas_registro")} className={verde}>
                Ver qué me están cobrando →
              </Link>
              <p className="mt-3 text-sm text-[#7D8A96]">7 días gratis · sin tarjeta · cancela cuando quieras</p>
            </div>

            <p className="mt-10 text-xs leading-relaxed text-[#5B6874]">
              Estimado con los datos que diste. VICTOR no es asesoría financiera.
            </p>
          </section>
        )}

        {!cobros && paso === 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#19E68C]">30 segundos · sin registrarte</p>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Cuándo sales de tus tarjetas?</h1>
            <p className="mb-6 text-[#C9D2DA]">Hay una fecha exacta. Primero, ¿cuánto debes más o menos?</p>
            <div className="grid grid-cols-2 gap-3">
              {DEUDAS.map((d) => (
                <button
                  key={d}
                  className={opcion(deuda === d && !otraDeuda)}
                  onClick={() => {
                    setDeuda(d);
                    setOtraDeuda("");
                    setPaso(1);
                  }}
                >
                  {d === 20000 ? "$20,000+" : usd(d)}
                </button>
              ))}
              <input
                className={campo}
                inputMode="numeric"
                placeholder="Otro $"
                value={otraDeuda}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setOtraDeuda(v);
                  setDeuda(Number(v) || 0);
                }}
              />
            </div>
            {otraDeuda && (
              <button className={`${verde} mt-5`} disabled={deuda <= 0} onClick={() => setPaso(1)}>
                Siguiente →
              </button>
            )}
          </section>
        )}

        {paso === 1 && (
          <section>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Cuánto le pagas al mes?</h1>
            <div className="grid grid-cols-2 gap-3">
              {PAGOS.map((o) => (
                <button
                  key={String(o.v)}
                  className={opcion(pago === o.v && !otroPago)}
                  onClick={() => {
                    setPago(o.v);
                    setOtroPago("");
                    setPaso(2);
                  }}
                >
                  {o.t}
                </button>
              ))}
              <input
                className={`${campo} col-span-2`}
                inputMode="numeric"
                placeholder="Otra cantidad $"
                value={otroPago}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setOtroPago(v);
                  setPago(Number(v) || null);
                }}
              />
            </div>
            {otroPago && (
              <button className={`${verde} mt-5`} disabled={!pago} onClick={() => setPaso(2)}>
                Siguiente →
              </button>
            )}
          </section>
        )}

        {paso === 2 && (
          <section>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Qué interés te cobran?</h1>
            <p className="mb-6 text-[#C9D2DA]">Si no sabes, no pasa nada: usamos el promedio.</p>
            <div className="flex flex-col gap-3">
              {INTERESES.map((o) => (
                <button
                  key={o.t}
                  className={opcion(false)}
                  onClick={() => {
                    setApr(o.v);
                    setPaso(3);
                  }}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </section>
        )}

        {paso === 3 && (
          <section>
            <h1 className="mb-2 text-3xl font-bold leading-tight">¿Cuántas suscripciones crees que pagas cada mes?</h1>
            <p className="mb-6 text-[#C9D2DA]">Streaming, apps, membresías, servicios…</p>
            <div className="grid grid-cols-2 gap-3">
              {SUSCRIPCIONES.map((t) => (
                <button key={t} className={opcion(false)} onClick={() => setPaso(4)}>
                  {t}
                </button>
              ))}
            </div>
          </section>
        )}

        {paso === 4 && (
          <section>
            <h1 className="mb-6 text-3xl font-bold leading-tight">¿Es tu tarjeta personal o la de tu negocio?</h1>
            <div className="flex flex-col gap-3">
              <button className={opcion(false)} onClick={() => verResultado(false)}>
                Personal
              </button>
              <button className={opcion(false)} onClick={() => verResultado(true)}>
                De mi negocio
              </button>
              <button className={opcion(false)} onClick={() => verResultado(true)}>
                Las dos
              </button>
            </div>
          </section>
        )}

        {paso === 5 && res && (
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#FF3D5A]">Pagando como pagas hoy</p>
            {res.meses === null ? (
              <>
                <h1 className="mb-3 text-4xl font-bold leading-tight">Así, no sales nunca.</h1>
                <p className="text-lg text-[#C9D2DA]">Lo que pagas al mes no alcanza ni para los intereses. La deuda crece sola.</p>
              </>
            ) : (
              <>
                <h1 className="mb-3 text-4xl font-bold leading-tight">
                  Sales en <span className="text-[#FF3D5A]">{fechaEn(res.meses)}</span>.
                </h1>
                <p className="text-lg text-[#C9D2DA]">
                  Y le regalas <b className="text-[#F2F5F7]">{usd(res.intereses)}</b> al banco en intereses
                  {res.meses >= 24 ? ` (${Math.round(res.meses / 12)} años pagando)` : ""}.
                </p>
              </>
            )}

            <div className="mt-8 rounded-2xl border border-white/10 bg-[#0E131A] p-5">
              <p className="text-xl font-bold">Hay un camino más corto.</p>
              <p className="mt-2 text-[#C9D2DA]">
                Y casi siempre aparece algo más: cobros que se repiten cada mes y que ya nadie revisa.
              </p>
              <p className="mt-4 rounded-xl bg-white/5 p-4 text-[15px] text-[#C9D2DA]">
                A un dueño de negocio le apareció un cobro de <b className="text-[#F2F5F7]">$38 al mes</b> que creía cancelado.{" "}
                <b className="text-[#19E68C]">$456 al año</b> por nada.
              </p>
            </div>

            <div className="mt-8 text-center">
              <Link href={registro} onClick={() => marcarEmbudo("clic_tarjetas_registro")} className={verde}>
                Ver mi camino más corto →
              </Link>
              <p className="mt-3 text-sm text-[#7D8A96]">7 días gratis · sin tarjeta · cancela cuando quieras</p>
            </div>

            <p className="mt-10 text-xs leading-relaxed text-[#5B6874]">
              Cálculo aproximado con los datos que diste; el resultado real depende de tu banco. VICTOR no es asesoría financiera.
            </p>
          </section>
        )}

        {((paso > 0 && paso < 5) || paso === 11 || paso === 12) && (
          <button className="mt-8 text-sm text-[#7D8A96] underline" onClick={() => setPaso(paso === 11 ? 0 : paso - 1)}>
            ← Atrás
          </button>
        )}
      </div>
    </main>
  );
}
