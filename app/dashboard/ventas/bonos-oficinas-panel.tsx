"use client";

import { useEffect, useMemo, useState } from "react";

// Bonos de oficinas de contables (migración 0164) — panel del founder en
// Ventas. Por trimestre: cada vendedor, sus oficinas, los clientes que trajo
// cada oficina y cuánto se le debe (bruto, retención 1062.03 y neto). El
// botón "Marcar pagado" se usa DESPUÉS de transferir el efectivo por fuera
// de la app; antes revisa que cada cliente siga activo.

type Fila = {
  id: string;
  trimestre: string;
  socioId: string;
  vendedor: string;
  oficinaId: string | null;
  oficina: string;
  pueblo: string | null;
  tipo: "bono_oficina" | "bono_cliente";
  cliente: string | null;
  clienteActivo: boolean | null;
  brutoCentavos: number;
  retenidoCentavos: number;
  estado: "pendiente" | "pagada" | "reversada";
  creadoEn: string;
  fechaPago: string | null;
};

function fmt(c: number) {
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function label(t: string) {
  const [y, q] = t.split("-Q");
  return `${["ene–mar", "abr–jun", "jul–sep", "oct–dic"][Number(q) - 1]} ${y}`;
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short" });
}

export default function BonosOficinasPanel() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [actual, setActual] = useState("");
  const [trimestre, setTrimestre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  async function cargar() {
    const res = await fetch("/api/socios/bonos-oficinas");
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error || "No se pudo cargar.");
      return;
    }
    setFilas(json.filas);
    setActual(json.trimestreActual);
    setTrimestre((t) => t || json.trimestreActual);
  }
  useEffect(() => {
    cargar();
  }, []);

  const trimestres = useMemo(() => {
    const s = new Set<string>((filas ?? []).map((f) => f.trimestre));
    if (actual) s.add(actual);
    return Array.from(s).sort().reverse();
  }, [filas, actual]);

  // Pendiente acumulado: todo lo pendiente creado hasta el fin del trimestre elegido.
  const delTrimestre = (filas ?? []).filter((f) => f.trimestre === trimestre);
  const pendienteHasta = (filas ?? []).filter((f) => f.estado === "pendiente" && f.trimestre <= trimestre);

  const porVendedor = useMemo(() => {
    const m = new Map<
      string,
      { socioId: string; vendedor: string; pendiente: Fila[]; trimestre: Fila[] }
    >();
    const asegurar = (f: Fila) => {
      if (!m.has(f.socioId)) m.set(f.socioId, { socioId: f.socioId, vendedor: f.vendedor, pendiente: [], trimestre: [] });
      return m.get(f.socioId)!;
    };
    for (const f of pendienteHasta) asegurar(f).pendiente.push(f);
    for (const f of delTrimestre) asegurar(f).trimestre.push(f);
    return Array.from(m.values()).sort((a, b) => a.vendedor.localeCompare(b.vendedor));
  }, [pendienteHasta, delTrimestre]);

  async function liquidar(socioId: string, nombre: string, totalNeto: number) {
    if (!window.confirm(`¿Ya le pagaste ${fmt(totalNeto)} (neto) a ${nombre}? Esto marca sus bonos hasta ${label(trimestre)} como pagados.`)) return;
    setLiquidando(socioId);
    const res = await fetch("/api/socios/bonos-oficinas/liquidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socioId, trimestre }),
    });
    const json = await res.json().catch(() => null);
    setLiquidando(null);
    if (!res.ok) return setError(json?.error || "No se pudo marcar.");
    if (json.reversados > 0) window.alert(`${json.reversados} bono(s) de clientes que ya cancelaron se reversaron y no se pagan.`);
    await cargar();
  }

  const totalPend = pendienteHasta.reduce((s, f) => s + f.brutoCentavos - f.retenidoCentavos, 0);

  return (
    <div className="vc-card mb-3">
      <button type="button" onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between text-left">
        <div>
          <p className="text-sm font-medium">Bonos de oficinas de contables</p>
          <p className="text-[11px] text-muted">$20 por oficina activa + $10 por cliente que traiga · pago cada 3 meses</p>
        </div>
        <span className="text-[12px] text-muted">{abierto ? "Ocultar" : `Ver · pendiente ${fmt(totalPend)}`}</span>
      </button>

      {abierto && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {error && <p className="text-xs text-red">{error}</p>}
          {!filas && !error && <p className="text-xs text-muted">Cargando...</p>}
          {filas && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">Trimestre:</span>
                <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} className="rounded-lg border border-border bg-transparent px-2 py-1 text-[12px]">
                  {trimestres.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                      {t === actual ? " (actual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {porVendedor.length === 0 && <p className="text-xs text-muted">Todavía no hay bonos. Aparecen cuando una oficina activada por un vendedor trae su primer cliente.</p>}

              {porVendedor.map((v) => {
                const bruto = v.pendiente.reduce((s, f) => s + f.brutoCentavos, 0);
                const ret = v.pendiente.reduce((s, f) => s + f.retenidoCentavos, 0);
                const neto = bruto - ret;
                const oficinas = new Map<string, Fila[]>();
                for (const f of Array.from(new Map([...v.pendiente, ...v.trimestre].map((x) => [x.id, x])).values())) {
                  const k = f.oficinaId ?? f.oficina;
                  oficinas.set(k, [...(oficinas.get(k) ?? []), f]);
                }
                const pagadoTrim = v.trimestre.filter((f) => f.estado === "pagada").reduce((s, f) => s + f.brutoCentavos - f.retenidoCentavos, 0);
                return (
                  <div key={v.socioId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{v.vendedor}</p>
                        <p className="text-[11px] text-muted">
                          Por pagar: {fmt(bruto)} bruto − {fmt(ret)} retención = <strong>{fmt(neto)}</strong> neto
                          {pagadoTrim > 0 ? ` · ya pagado este trimestre ${fmt(pagadoTrim)}` : ""}
                        </p>
                      </div>
                      {v.pendiente.length > 0 && (
                        <button
                          type="button"
                          disabled={liquidando === v.socioId}
                          onClick={() => liquidar(v.socioId, v.vendedor, neto)}
                          className="shrink-0 rounded-pill bg-teal px-3 py-1.5 text-[12px] font-medium text-white"
                        >
                          {liquidando === v.socioId ? "..." : "Marcar pagado"}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {Array.from(oficinas.entries()).map(([k, items]) => {
                        const act = items.find((i) => i.tipo === "bono_oficina");
                        const cls = items.filter((i) => i.tipo === "bono_cliente");
                        return (
                          <div key={k} className="rounded-md bg-black/5 p-2 text-[12px] dark:bg-white/5">
                            <p className="font-medium">
                              {items[0].oficina}
                              {items[0].pueblo ? <span className="font-normal text-muted"> · {items[0].pueblo}</span> : null}
                            </p>
                            {act && (
                              <p className="text-muted">
                                Activación {fmt(act.brutoCentavos)} · {act.estado}
                              </p>
                            )}
                            {cls.map((c) => (
                              <p key={c.id} className="text-muted">
                                {c.cliente} · {fmtFecha(c.creadoEn)} · {fmt(c.brutoCentavos)} · {c.estado}
                                {c.clienteActivo === false ? " (ya no está activo)" : ""}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted">
                La retención 1062.03 usa el mismo acumulado anual de sus demás comisiones. Se paga por transferencia fuera de la app y luego se marca aquí.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
