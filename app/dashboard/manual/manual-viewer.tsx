"use client";

import { useEffect, useMemo, useState } from "react";
import { GRUPOS_MANUAL, MODULOS_MANUAL, type ModuloManual } from "@/lib/manual-usuario";

// Visor del Manual de Usuario. Índice por grupos, buscador, filtro
// Usuario/Vendedor y la guía paso a paso de cada módulo con su captura.
// Las capturas viven en /public/manual/<módulo>/<n>.png. Si falta una, a los
// usuarios no se les muestra nada; con ?capturas=1 en la URL se ve un recuadro
// "Captura pendiente" (sirve de checklist para quien toma las capturas).

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Foto({ src, alt, mostrarPendientes }: { src: string; alt: string; mostrarPendientes: boolean }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    if (!mostrarPendientes) return null;
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted">
        <i className="ti ti-photo" /> Captura pendiente: {alt}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFallo(true)}
      className="mt-2 w-full rounded-lg border border-border"
    />
  );
}

function Detalle({ m, mostrarPendientes, onVolver, fotos, pie }: { m: ModuloManual; mostrarPendientes: boolean; onVolver: () => void; fotos: boolean; pie?: string }) {
  return (
    <div>
      <button type="button" onClick={onVolver} className="mb-3 text-sm font-medium text-teal print:hidden">
        ← Todos los módulos
      </button>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
          <i className={`ti ${m.icono}`} style={{ fontSize: 24 }} />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-tight">{m.titulo}</h2>
          <p className="text-sm text-muted">{m.resumen}</p>
        </div>
      </div>

      <div className="vc-card mb-3 text-sm">
        <p>
          <span className="font-medium">Dónde está: </span>
          <span className="text-muted">{m.donde}</span>
        </p>
        <p className="mt-1">
          <span className="font-medium">Plan: </span>
          <span className="text-muted">{m.plan}</span>
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {m.pasos.map((p, i) => (
          <li key={i} className="vc-card">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">{p.titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{p.texto}</p>
                {fotos && p.foto && <Foto src={`/api/manual/foto/${m.id}/${i + 1}`} alt={p.foto} mostrarPendientes={mostrarPendientes} />}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {m.ejemplo && (
        <div className="mt-3 rounded-lg border border-teal/30 bg-teal/[.06] p-3 text-sm">
          <p className="mb-0.5 font-medium text-teal">Ejemplo</p>
          <p className="text-muted">{m.ejemplo.replace(/^Ejemplo:\s*/i, "")}</p>
        </div>
      )}

      {m.consejos && m.consejos.length > 0 && (
        <div className="vc-card mt-3 text-sm">
          <p className="mb-1 font-medium">Consejos</p>
          <ul className="flex flex-col gap-1.5 text-muted">
            {m.consejos.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-teal">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.preguntas && m.preguntas.length > 0 && (
        <div className="vc-card mt-3 text-sm">
          <p className="mb-1 font-medium">Preguntas frecuentes</p>
          <div className="flex flex-col gap-2">
            {m.preguntas.map((q, i) => (
              <div key={i}>
                <p className="font-medium">{q.p}</p>
                <p className="text-muted">{q.r}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-sm text-muted print:hidden">
        {pie ?? "¿Algo no te quedó claro? Pregúntale a VICTOR: el chat verde de abajo conoce esta guía."}
      </p>
    </div>
  );
}

export default function ManualViewer({
  modulos = MODULOS_MANUAL,
  grupos = GRUPOS_MANUAL as unknown as readonly string[],
  titulo = "Manual de Usuario",
  subtitulo = "Guías paso a paso de cada parte de VICTOR CFO.",
  fotos = true,
  pie,
}: {
  pie?: string;
  modulos?: ModuloManual[];
  grupos?: readonly string[];
  titulo?: string;
  subtitulo?: string;
  fotos?: boolean;
} = {}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mostrarPendientes, setMostrarPendientes] = useState(false);

  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h && modulos.some((m) => m.id === h)) setAbierto(h);
    setMostrarPendientes(new URLSearchParams(window.location.search).get("capturas") === "1");
  }, []);

  function abrir(id: string | null) {
    setAbierto(id);
    try {
      window.history.replaceState(null, "", id ? `#${id}` : window.location.pathname + window.location.search);
    } catch {}
    window.scrollTo({ top: 0 });
  }

  const visibles = useMemo(() => {
    const nq = normalizar(q.trim());
    return modulos.filter((m) => {
      if (!nq) return true;
      const texto = normalizar(
        [m.titulo, m.resumen, m.donde, ...m.pasos.map((p) => `${p.titulo} ${p.texto}`), ...(m.consejos ?? []), m.ejemplo ?? ""].join(" ")
      );
      return nq.split(/\s+/).every((w) => texto.includes(w));
    });
  }, [q, modulos]);

  const modulo = abierto ? modulos.find((m) => m.id === abierto) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted">{subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-shrink-0 rounded-pill border border-border px-3 py-1.5 text-sm font-medium print:hidden"
        >
          <i className="ti ti-printer" /> Imprimir / PDF
        </button>
      </div>

      {modulo ? (
        <Detalle m={modulo} mostrarPendientes={mostrarPendientes} onVolver={() => abrir(null)} fotos={fotos} pie={pie} />
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: factura, retención, técnico, PIN…"
            className="vc-input mb-3 w-full"
            aria-label="Buscar en el manual"
          />
          {visibles.length === 0 && (
            <div className="vc-card text-center text-sm text-muted">
              No encontré nada con “{q}”. Prueba con otra palabra o pregúntale a VICTOR.
            </div>
          )}

          {grupos.map((g) => {
            const items = visibles.filter((m) => m.grupo === g);
            if (items.length === 0) return null;
            return (
              <section key={g} className="mb-5">
                <p className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{g}</p>
                <div className="flex flex-col gap-2">
                  {items.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => abrir(m.id)}
                      className="vc-card flex items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
                        <i className={`ti ${m.icono}`} style={{ fontSize: 22 }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium">{m.titulo}</span>
                        <span className="block text-sm text-muted">{m.resumen}</span>
                      </span>
                      <i className="ti ti-chevron-right text-muted" />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
