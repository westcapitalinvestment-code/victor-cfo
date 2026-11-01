"use client";

import { useEffect, useState } from "react";
import { ESTADOS_SEGUIMIENTO, ESTADO_SEGUIMIENTO_LABEL } from "@/lib/oficinas-contables";
import type { EmbudoSocio } from "@/lib/embudo-socios";

// "Mi semana y mi embudo" (0197): lo que el vendedor hizo esta semana, en qué
// estado están sus contactos y cuántos ya forman parte de VICTOR. Desplegable
// para no tapar el QR ni los números de comisión.

function Num({ valor, titulo }: { valor: number; titulo: string }) {
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <p className="text-lg font-semibold leading-none">{valor}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted">{titulo}</p>
    </div>
  );
}

function etiquetaSemana(inicio: string) {
  const [y, m, d] = inicio.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PR", { day: "numeric", month: "short" });
}

export default function MiEmbudo() {
  const [abierto, setAbierto] = useState(false);
  const [e, setE] = useState<EmbudoSocio | null>(null);

  useEffect(() => {
    fetch("/api/socios/portal/embudo")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setE(j?.embudo ?? null))
      .catch(() => {});
  }, []);

  if (!e) return null;
  const maxEstado = Math.max(1, ...ESTADOS_SEGUIMIENTO.map((s) => e.porEstado[s]));
  const maxSemana = Math.max(1, ...e.semanas.map((w) => w.nuevos + w.avances));

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="vc-card flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block text-sm font-medium">Mi semana y mi embudo</span>
          <span className="block text-xs text-muted">
            {e.semana.nuevos} contactos nuevos · {e.semana.avances} avances esta semana
          </span>
        </span>
        <span className="text-muted">{abierto ? "−" : "+"}</span>
      </button>

      {abierto && (
        <div className="vc-card mt-2 flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Últimos 7 días</p>
            <div className="grid grid-cols-4 gap-2">
              <Num valor={e.semana.nuevos} titulo="Contactos nuevos" />
              <Num valor={e.semana.avances} titulo="Cambios de estado" />
              <Num valor={e.semana.interesados} titulo="Quedaron interesados" />
              <Num valor={e.semana.demos} titulo="Demos hechas" />
            </div>
            <p className="mt-1 text-xs text-muted">Últimos 30 días: {e.mes.nuevos} nuevos · {e.mes.avances} avances.</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              Dónde están tus {e.contactos.total} contactos
            </p>
            <div className="flex flex-col gap-1.5">
              {ESTADOS_SEGUIMIENTO.map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-muted">{ESTADO_SEGUIMIENTO_LABEL[s]}</span>
                  <div className="h-2 flex-1 rounded-full bg-border">
                    <div className="h-2 rounded-full bg-teal" style={{ width: `${(e.porEstado[s] / maxEstado) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right font-medium">{e.porEstado[s]}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              {e.contactos.oficinas} oficinas de contables · {e.contactos.negocios} negocios
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Tu ritmo (8 semanas)</p>
            <div className="flex items-end gap-1.5" style={{ height: 64 }}>
              {e.semanas.map((w) => {
                const total = w.nuevos + w.avances;
                return (
                  <div key={w.inicio} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${etiquetaSemana(w.inicio)}: ${w.nuevos} nuevos, ${w.avances} avances`}>
                    <div className="w-full rounded-sm bg-teal" style={{ height: `${Math.max(total ? 6 : 2, (total / maxSemana) * 52)}px`, opacity: total ? 1 : 0.25 }} />
                    <span className="text-[10px] text-muted">{etiquetaSemana(w.inicio)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Alcance</p>
            <div className="grid grid-cols-3 gap-2">
              <Num valor={e.contactos.total} titulo="Conocen VICTOR (visitados)" />
              <Num valor={e.registrados} titulo="Ya se registraron" />
              <Num valor={e.pagan} titulo="Pagan o están en prueba" />
            </div>
            {e.correo.permisos > 0 && (
              <p className="mt-1 text-xs text-muted">
                Correos automáticos: {e.correo.permisos} con permiso · {e.correo.enviados} ya recibieron al menos uno.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
