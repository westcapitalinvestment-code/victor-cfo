"use client";

import { useEffect, useState } from "react";
import type { PagoSocio } from "@/lib/pago-socios";

// "Pagos de esta quincena" (10 nov 2026): lo que se le debe a cada socio,
// con un PDF por socio para subirlo a Mercury → Pay → "Upload a bill".
// Mercury lee nombre, monto, fecha y datos ACH; Joel aprueba allá y aquí
// marca pagado (solo las comisiones que iban en ese PDF).

const fmt = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtFecha = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PR", { weekday: "short", day: "numeric", month: "short" });

export default function PagosQuincena({ onPagadas }: { onPagadas?: (ids: string[]) => void }) {
  const [pagos, setPagos] = useState<PagoSocio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    const res = await fetch("/api/socios/pagos-quincena", { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok) return setError(j?.error || "No se pudieron cargar los pagos.");
    setPagos(j.pagos ?? []);
  }
  useEffect(() => {
    cargar();
  }, []);

  function descargar(socioId: string) {
    const a = document.createElement("a");
    a.href = `/api/socios/${socioId}/factura-pago`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function descargarTodas() {
    for (const p of pagos ?? []) {
      descargar(p.socioId);
      await new Promise((r) => setTimeout(r, 700)); // el navegador bloquea descargas seguidas sin pausa
    }
  }

  async function marcarPagado(p: PagoSocio) {
    setTrabajando(p.socioId);
    const res = await fetch(`/api/socios/${p.socioId}/marcar-pagadas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: p.items.map((i) => i.id) }),
    });
    const j = await res.json().catch(() => null);
    setTrabajando(null);
    setConfirmar(null);
    if (!res.ok) return setError(j?.error || "No se pudo marcar como pagado.");
    onPagadas?.(j.ids ?? []);
    setPagos((prev) => (prev ?? []).filter((x) => x.socioId !== p.socioId));
  }

  const total = (pagos ?? []).reduce((a, p) => a + p.netoCentavos, 0);
  const fecha = pagos?.[0]?.fechaPago;

  return (
    <div className="rounded-lg border border-teal/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pagos de esta quincena</p>
          {pagos && pagos.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">{fmt(total)}</span> a {pagos.length} socio{pagos.length === 1 ? "" : "s"}
              {fecha && <span className="text-muted"> · pago el {fmtFecha(fecha)}</span>}
            </p>
          )}
        </div>
        {pagos && pagos.length > 1 && (
          <button onClick={descargarTodas} className="rounded-pill border border-teal bg-teal px-3 py-1 text-[11px] font-medium text-white">
            Descargar todos los PDF
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-red">{error}</p>}
      {!pagos ? (
        <p className="py-2 text-center text-sm text-muted">Calculando…</p>
      ) : pagos.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted">No hay nada pendiente de pago. ✅</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pagos.map((p) => (
            <div key={p.socioId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.nombre}</p>
                <p className="text-[11px] text-muted">
                  {p.items.length} concepto{p.items.length === 1 ? "" : "s"} · bruto {fmt(p.brutoCentavos)}
                  {p.retencionCentavos > 0 && <> · retención {fmt(p.retencionCentavos)}</>}
                  {p.datosPagoCompletados ? (
                    <> · 🏦 {p.bankName ?? "Banco"} ···{p.accountLast4}</>
                  ) : (
                    <span className="text-amb"> · ⚠️ sin datos de banco</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="mr-1 font-medium">{fmt(p.netoCentavos)}</span>
                <button onClick={() => descargar(p.socioId)} className="rounded-pill border border-teal px-2 py-0.5 text-[11px] font-medium text-teal">
                  PDF para Mercury
                </button>
                {confirmar === p.socioId ? (
                  <>
                    <button
                      onClick={() => marcarPagado(p)}
                      disabled={trabajando === p.socioId}
                      className="rounded-pill border border-teal bg-teal px-2 py-0.5 text-[11px] font-medium text-white"
                    >
                      {trabajando === p.socioId ? "..." : "Sí, ya lo pagué"}
                    </button>
                    <button onClick={() => setConfirmar(null)} className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-muted">
                      No
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmar(p.socioId)} className="rounded-pill border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
                    Marcar pagado
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted">
        Sube cada PDF en Mercury → Pay → <b>Upload a bill</b>, revisa y aprueba el ACH. Después marca pagado aquí: solo se marcan
        las comisiones que iban en ese PDF.
      </p>
    </div>
  );
}
