"use client";

import { ETIQUETA_CAMPO } from "@/lib/trading-bloqueos";

// Periodo de prueba del plan (22 nov 2026, pedido de Joel): "pruébalas X días y
// vamos ajustando con los resultados desde el chat". Mínimo 14 días.

export const DURACIONES_PRUEBA = [14, 21, 30];

const abrirVictor = (mensaje: string) => window.dispatchEvent(new CustomEvent("victor:abrir", { detail: { mensaje } }));

export function PruebaPlan({ inicio, dias, trades, hoy }: { inicio: string; dias: number; trades: number; hoy: string }) {
  const dia = Math.max(1, Math.floor((Date.parse(hoy + "T12:00:00Z") - Date.parse(inicio + "T12:00:00Z")) / 86400000) + 1);
  const terminada = dia > dias;
  const pct = Math.min(100, ((terminada ? dias : dia) / dias) * 100);
  const fin = new Date(Date.parse(inicio + "T12:00:00Z") + dias * 86400000).toISOString().slice(0, 10);

  return (
    <div className={`vc-card mb-4 border-2 ${terminada ? "border-teal" : "border-teal/30"}`}>
      <div className="flex items-start gap-3">
        <img src="/victor-avatar.png" width={40} height={40} alt="" className="shrink-0 rounded-full bg-white" />
        <div className="flex-1">
          <p className="text-sm uppercase tracking-wide text-teal">Periodo de prueba de tu plan</p>
          {terminada ? (
            <>
              <p className="mt-1 text-lg font-semibold">Terminó tu prueba de {dias} días. Revisemos tus resultados.</p>
              <p className="mt-1 text-[14px] text-muted">
                {trades} trades con tus reglas. VICTOR los analiza contigo (activos, horario, días, disciplina) y te propone ajustes. Tú decides cuáles aplicar.
              </p>
              <button
                className="vc-btn-primary mt-3"
                onClick={() => abrirVictor(`Terminó mi periodo de prueba de ${dias} días (desde el ${inicio}). Revisa mis resultados y propón ajustes a mis reglas.`)}
              >
                Revisar con VICTOR
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-semibold">
                Día {dia} de {dias} · {trades} trades registrados
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-[14px] text-muted">
                Opera con tus reglas sin cambiarlas hasta el {fin}. Con datos de {dias} días el análisis es confiable: VICTOR te dirá qué te funciona y qué ajustar.
                {trades < 20 ? " Trata de llegar a 20 trades o más." : ""}
              </p>
              <button className="mt-2 text-[14px] font-medium text-teal" onClick={() => abrirVictor("¿Cómo voy en mi periodo de prueba de trading?")}>
                Preguntarle a VICTOR cómo voy →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type Pend = { id: string; cambios: Record<string, { antes: unknown; despues: unknown }>; aplicar_desde: string };

const GRUPO: Record<string, string> = { zona_horaria: "horario", horario_ventanas: "horario", horario_sesiones: "horario", dias_bloqueados: "horario" };

export function CambiosPendientes({ lista, onCancelar }: { lista: Pend[]; onCancelar: (id: string) => void }) {
  if (!lista.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-[#d97706]/40 bg-[#d97706]/10 p-3 text-[14px]">
      <p className="font-medium">Cambios que aplican mañana</p>
      <p className="mb-2 text-[13px] text-muted">Aflojar una regla aplica desde la medianoche de mañana (tu hora), para no quitarte los frenos en caliente. Apretarla aplica al instante.</p>
      {lista.map((p) => {
        const nombres = [...new Set(Object.keys(p.cambios).map((k) => ETIQUETA_CAMPO[GRUPO[k] ?? k] ?? k))];
        const faltan = Date.parse(p.aplicar_desde) - Date.now();
        const cuando =
          faltan > 0 && faltan <= 30 * 3600000
            ? "mañana a medianoche"
            : new Date(p.aplicar_desde).toLocaleString("es", { weekday: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
        return (
          <div key={p.id} className="flex items-center justify-between gap-2 border-t border-[#d97706]/20 py-1.5 first:border-t-0">
            <span>
              {nombres.join(", ")} <span className="text-muted">· desde {cuando}</span>
            </span>
            <button className="shrink-0 text-[13px] text-muted underline" onClick={() => onCancelar(p.id)}>
              Cancelar
            </button>
          </div>
        );
      })}
    </div>
  );
}
