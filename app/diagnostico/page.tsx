"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Area = "cobros" | "separacion" | "ganancia" | "retenciones" | "documentos" | "impuestos";

// Diagnóstico de 30 segundos (1 nov 2026): 7 preguntas, cada opción suma 0 (bien),
// 1 (regular) o 2 (hueco) al área que VICTOR resuelve. Gana el área con más puntos.
const PREGUNTAS: { q: string; area: Area; op: [string, number][] }[] = [
  { q: "¿Cómo les cobras a tus clientes?", area: "cobros", op: [["Con factura formal (PDF o link de pago)", 0], ["Por WhatsApp o texto, sin factura", 1], ["En efectivo o de palabra, sin registro", 2]] },
  { q: "¿Sabes ahora mismo cuánto te deben y quién está atrasado?", area: "cobros", op: [["Sí, lo veo al instante", 0], ["Más o menos, de memoria", 1], ["No, lo averiguo cuando lo necesito", 2]] },
  { q: "¿Tu dinero personal y el del negocio están separados?", area: "separacion", op: [["Sí, cuentas separadas", 0], ["A medias, a veces se mezclan", 1], ["Todo sale de la misma cuenta", 2]] },
  { q: "¿Cuándo sabes cuánto ganaste de verdad en el mes?", area: "ganancia", op: [["Cuando quiero, en minutos", 0], ["Cuando me lo dice mi contable", 1], ["No lo sé con certeza", 2]] },
  { q: "¿Pagas a contratistas o técnicos?", area: "retenciones", op: [["No pago a nadie", 0], ["Sí, y llevo retención y registro de cada pago", 0], ["Sí, pero llevo el registro a mano", 1], ["Sí, y no retengo ni registro nada", 2]] },
  { q: "¿Dónde guardas contratos, marbetes, certificados y recibos?", area: "documentos", op: [["Ordenados en un solo lugar digital", 0], ["Fotos en el celular, regados", 1], ["Papeles, o no sé dónde están", 2]] },
  { q: "¿Cómo apartas dinero para los impuestos?", area: "impuestos", op: [["Sé cuánto apartar y lo aparto", 0], ["Aparto algo, sin calcularlo", 1], ["Lo resuelvo cuando llega la fecha", 2]] },
];

const RESULTADOS: Record<Area, { titulo: string; texto: string; victor: string }> = {
  cobros: {
    titulo: "Tu freno: los cobros",
    texto: "Trabajas, pero el dinero llega tarde o se pierde en el camino. Sin factura y sin seguimiento, cobrar depende de acordarte.",
    victor: "VICTOR crea la factura en segundos, la envía con link de pago o QR, te muestra quién debe y te avisa cuando una factura se atrasa.",
  },
  separacion: {
    titulo: "Tu freno: dinero personal y del negocio mezclados",
    texto: "Cuando todo sale de la misma cuenta, es muy difícil saber qué es del negocio, qué es deducible y cuánto puedes sacar para ti.",
    victor: "VICTOR conecta tus cuentas, separa Personal y Negocio y categoriza cada movimiento para que cada dólar quede en su lugar.",
  },
  ganancia: {
    titulo: "Tu freno: no ves tu ganancia real",
    texto: "Sin números al día, las decisiones se toman a ciegas: cuánto cobrar, cuánto gastar, cuánto sobra de verdad.",
    victor: "VICTOR te dice tu ingreso, gasto y ganancia del mes cuando quieras, y puedes preguntarle por chat: “¿cuánto gané este mes?”.",
  },
  retenciones: {
    titulo: "Tu freno: pagos a contratistas sin control",
    texto: "Pagar a contratistas sin registro ni retención correcta puede traerte problemas con Hacienda y trabajo extra a fin de año.",
    victor: "VICTOR registra cada pago, calcula la retención, guarda los documentos de cada contratista y prepara el reporte del 480.6SP.",
  },
  documentos: {
    titulo: "Tu freno: documentos regados",
    texto: "Marbetes, certificados, contratos y recibos en el celular o en papel se pierden justo cuando los necesitas.",
    victor: "VICTOR guarda todo en una bóveda digital y te avisa antes de que algo venza.",
  },
  impuestos: {
    titulo: "Tu freno: los impuestos te llegan de sorpresa",
    texto: "Si no sabes cuánto apartar durante el año, la fecha límite se convierte en un susto.",
    victor: "VICTOR te muestra un estimado de lo que debes apartar según tus ingresos reales y deja tus números listos para tu contable.",
  },
};

function Diagnostico() {
  const sp = useSearchParams();
  const socio = (sp.get("socio") ?? "").toUpperCase();
  const [i, setI] = useState(0);
  const [resp, setResp] = useState<number[]>([]);
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  const terminado = i >= PREGUNTAS.length;

  const puntajes: Record<string, number> = {};
  if (terminado) PREGUNTAS.forEach((p, k) => { puntajes[p.area] = (puntajes[p.area] ?? 0) + (resp[k] ?? 0); });
  const orden = Object.entries(puntajes).sort((a, b) => b[1] - a[1]);
  const top = orden[0];
  const todoBien = terminado && top[1] === 0;
  const area = (top?.[0] ?? "cobros") as Area;
  const r = RESULTADOS[area];

  const registro = `/registro?${new URLSearchParams({ ...(socio ? { socio } : {}), plan: "core" }).toString()}`;

  function elegir(pts: number) {
    setResp([...resp, pts]);
    setI(i + 1);
  }

  async function guardar() {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Escribe un email válido."); return; }
    setEnCurso(true);
    const res = await fetch("/api/diagnostico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, area, puntajes, respuestas: resp, socio, origen: sp.get("utm_source") ?? "directo" }),
    }).catch(() => null);
    setEnCurso(false);
    if (res?.ok) setEnviado(true); else setErr("No pudimos guardarlo. Inténtalo de nuevo.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-teal">VICTOR CFO · Diagnóstico gratis</p>

      {!terminado && (
        <>
          <h1 className="mb-1 text-xl font-semibold leading-tight">Descubre qué está frenando tu negocio</h1>
          <p className="mb-5 text-sm text-muted">7 preguntas, 30 segundos. Sin registro.</p>
          <div className="mb-4 h-1.5 w-full rounded-full bg-border">
            <div className="h-1.5 rounded-full bg-teal transition-all" style={{ width: `${(i / PREGUNTAS.length) * 100}%` }} />
          </div>
          <p className="mb-3 text-xs text-muted">Pregunta {i + 1} de {PREGUNTAS.length}</p>
          <h2 className="mb-4 text-lg font-medium">{PREGUNTAS[i].q}</h2>
          <div className="flex flex-col gap-2">
            {PREGUNTAS[i].op.map(([t, pts]) => (
              <button key={t} onClick={() => elegir(pts)} className="vc-card text-left text-base active:scale-[0.99]">{t}</button>
            ))}
          </div>
        </>
      )}

      {terminado && (
        <>
          <h1 className="mb-2 text-xl font-semibold leading-tight">{todoBien ? "Vas muy bien" : r.titulo}</h1>
          <p className="mb-3 text-base text-muted">
            {todoBien
              ? "Tus respuestas muestran buenos hábitos. VICTOR te ayuda a mantenerlos sin esfuerzo y a ver todo en un solo lugar."
              : r.texto}
          </p>
          {!todoBien && (
            <div className="vc-card mb-4">
              <p className="mb-1 text-sm font-medium">Cómo lo resuelve VICTOR</p>
              <p className="text-sm text-muted">{r.victor}</p>
            </div>
          )}
          {!todoBien && orden.filter(([, v]) => v > 0).length > 1 && (
            <p className="mb-4 text-xs text-muted">
              También revisa: {orden.slice(1).filter(([, v]) => v > 0).map(([a]) => RESULTADOS[a as Area].titulo.replace("Tu freno: ", "")).join(", ")}.
            </p>
          )}

          {!enviado ? (
            <div className="vc-card mb-4">
              <p className="mb-2 text-sm font-medium">Guarda tu resultado y recibe tips para arreglarlo</p>
              <input
                type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com" className="mb-2 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-base"
              />
              {err && <p className="mb-2 text-sm text-red-500">{err}</p>}
              <button onClick={guardar} disabled={enCurso} className="w-full rounded-lg bg-teal px-4 py-2.5 text-base font-medium text-white disabled:opacity-60">
                {enCurso ? "Guardando…" : "Guardar mi resultado"}
              </button>
              <p className="mt-2 text-[11px] text-muted">Solo usaremos tu email para enviarte información de VICTOR CFO. Puedes darte de baja cuando quieras.</p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-teal">¡Listo! Guardamos tu resultado.</p>
          )}

          <Link href={registro} className="block w-full rounded-lg border border-teal px-4 py-2.5 text-center text-base font-medium text-teal">
            Probar VICTOR gratis
          </Link>
          <button onClick={() => { setI(0); setResp([]); setEnviado(false); }} className="mt-3 text-sm text-muted underline">Repetir el diagnóstico</button>
        </>
      )}
    </main>
  );
}

export default function DiagnosticoPage() {
  return (
    <Suspense fallback={null}>
      <Diagnostico />
    </Suspense>
  );
}
