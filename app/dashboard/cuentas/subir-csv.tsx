"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

type Modo = "csv" | "pdf";
type PasoCsv = "elegir_archivo" | "mapear" | "resultado";
type PasoPdf = "elegir_archivo" | "revisar" | "resultado";

type TransaccionExtraida = { fecha: string; descripcion: string; monto: number };

export default function SubirEstado({
  origen,
  cuentaId,
  onCerrar,
  plan = null,
}: {
  origen: "plaid" | "manual";
  cuentaId: string;
  onCerrar: () => void;
  plan?: string | null;
}) {
  const bloqueadoPdf = plan === "gratis";
  const [modo, setModo] = useState<Modo>("csv");

  const [pasoCsv, setPasoCsv] = useState<PasoCsv>("elegir_archivo");
  const [csvTexto, setCsvTexto] = useState<string>("");
  const [nombreArchivoCsv, setNombreArchivoCsv] = useState<string>("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [columnaFecha, setColumnaFecha] = useState<number | "">("");
  const [columnaDescripcion, setColumnaDescripcion] = useState<number | "">("");
  const [modoMonto, setModoMonto] = useState<"unico" | "debito_credito">("unico");
  const [columnaMonto, setColumnaMonto] = useState<number | "">("");
  const [columnaDebito, setColumnaDebito] = useState<number | "">("");
  const [columnaCredito, setColumnaCredito] = useState<number | "">("");
  const [formatoFecha, setFormatoFecha] = useState<"MDY" | "DMY" | "YMD">("MDY");
  const [invertirSigno, setInvertirSigno] = useState(false);

  const [pasoPdf, setPasoPdf] = useState<PasoPdf>("elegir_archivo");
  const [nombreArchivoPdf, setNombreArchivoPdf] = useState<string>("");
  const [transaccionesPdf, setTransaccionesPdf] = useState<TransaccionExtraida[]>([]);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ importadas: number; duplicadas: number; errores: number } | null>(null);

  async function manejarArchivoCsv(file: File) {
    setError(null);
    setCargando(true);
    setNombreArchivoCsv(file.name);
    try {
      const texto = await file.text();
      setCsvTexto(texto);
      const res = await fetch("/api/cuentas-manuales/csv/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo leer el archivo.");
      setColumnas(data.columnas);
      setFilasPreview(data.filasPreview);
      setTotalFilas(data.totalFilas);
      setPasoCsv("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacionCsv() {
    if (columnaFecha === "" || columnaDescripcion === "") {
      setError("Falta indicar cuál columna es la fecha y cuál la descripción.");
      return;
    }
    if (modoMonto === "unico" && columnaMonto === "") {
      setError("Falta indicar cuál columna es el monto.");
      return;
    }
    if (modoMonto === "debito_credito" && columnaDebito === "" && columnaCredito === "") {
      setError("Falta indicar al menos la columna de débito o de crédito.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/cuentas/estado/csv/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origenCuenta: origen,
          cuentaId,
          csv: csvTexto,
          columnaFecha: Number(columnaFecha),
          columnaDescripcion: Number(columnaDescripcion),
          columnaMonto: modoMonto === "unico" ? Number(columnaMonto) : null,
          columnaDebito: modoMonto === "debito_credito" && columnaDebito !== "" ? Number(columnaDebito) : null,
          columnaCredito: modoMonto === "debito_credito" && columnaCredito !== "" ? Number(columnaCredito) : null,
          formatoFecha,
          invertirSigno,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar el archivo.");
      setResultado({ importadas: data.importadas, duplicadas: data.duplicadas, errores: data.errores });
      setPasoCsv("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  function previsualizarMonto(fila: string[]): string {
    try {
      const limpiar = (v: string) => {
        let s = v.trim().replace(/[$,\s]/g, "");
        let neg = false;
        if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
        if (s.startsWith("-")) { neg = true; s = s.slice(1); }
        const n = parseFloat(s);
        if (!Number.isFinite(n)) return null;
        return neg ? -n : n;
      };
      let monto: number | null = null;
      if (modoMonto === "unico" && columnaMonto !== "") {
        monto = limpiar(fila[Number(columnaMonto)] ?? "");
      } else if (modoMonto === "debito_credito") {
        const d = columnaDebito !== "" ? limpiar(fila[Number(columnaDebito)] ?? "") ?? 0 : 0;
        const c = columnaCredito !== "" ? limpiar(fila[Number(columnaCredito)] ?? "") ?? 0 : 0;
        monto = d - c;
      }
      if (monto === null) return "—";
      if (invertirSigno) monto = -monto;
      return `${monto > 0 ? "Gasto" : "Ingreso"} ${formatMoney(Math.abs(monto))}`;
    } catch {
      return "—";
    }
  }

  function leerArchivoComoBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultadoStr = reader.result as string;
        const base64 = resultadoStr.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  async function manejarArchivoPdf(file: File) {
    setError(null);
    setCargando(true);
    setNombreArchivoPdf(file.name);
    try {
      const base64 = await leerArchivoComoBase64(file);
      const res = await fetch("/api/cuentas/estado/pdf/extraer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, nombreArchivo: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo leer el PDF.");
      setTransaccionesPdf(data.transacciones);
      setPasoPdf("revisar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el PDF.");
    } finally {
      setCargando(false);
    }
  }

  function quitarFilaPdf(i: number) {
    setTransaccionesPdf((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function confirmarImportacionPdf() {
    if (transaccionesPdf.length === 0) {
      setError("No queda ninguna transacción para importar.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/cuentas/estado/pdf/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origenCuenta: origen, cuentaId, transacciones: transaccionesPdf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar.");
      setResultado({ importadas: data.importadas, duplicadas: data.duplicadas, errores: data.errores ?? 0 });
      setPasoPdf("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setCargando(false);
    }
  }

  const estaEnPasoInicial = modo === "csv" ? pasoCsv === "elegir_archivo" : pasoPdf === "elegir_archivo";

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      {estaEnPasoInicial && (
        <div className="mb-3 flex gap-1 rounded-pill bg-bg p-1 text-xs">
          <button
            className={`flex-1 rounded-pill py-1.5 font-medium ${modo === "csv" ? "bg-teal text-white" : "text-muted"}`}
            onClick={() => { setModo("csv"); setError(null); }}
          >
            CSV / QuickBooks
          </button>
          <button
            className={`flex-1 rounded-pill py-1.5 font-medium ${modo === "pdf" ? "bg-teal text-white" : "text-muted"}`}
            onClick={() => { setModo("pdf"); setError(null); }}
          >
            PDF{bloqueadoPdf ? " (Core)" : ""}
          </button>
        </div>
      )}

      {modo === "csv" && (
        <>
          {pasoCsv === "elegir_archivo" && (
            <div>
              <p className="mb-2 text-sm font-medium">Subir estado de cuenta (CSV)</p>
              <p className="mb-3 text-xs text-muted">
                Exporta el estado de cuenta de tu banco/tarjeta (o el registro de QuickBooks) como CSV y súbelo
                aquí — en el siguiente paso confirmas cuál columna es cuál, porque cada banco lo exporta distinto.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={cargando}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) manejarArchivoCsv(file);
                }}
                className="block w-full text-xs"
              />
              {cargando && <p className="mt-2 text-xs text-muted">Leyendo archivo…</p>}
              {error && <p className="mt-2 text-xs text-red">{error}</p>}
              <button className="mt-3 text-xs text-muted underline" onClick={onCerrar}>
                Cancelar
              </button>
            </div>
          )}

          {pasoCsv === "mapear" && (
            <div>
              <p className="mb-1 text-sm font-medium">{nombreArchivoCsv}</p>
              <p className="mb-3 text-xs text-muted">{totalFilas} fila(s) de transacciones encontradas. Confirma el mapeo de columnas:</p>

              <div className="mb-3 overflow-x-auto rounded border border-border">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-bg">
                      {columnas.map((c, i) => (
                        <th key={i} className="whitespace-nowrap px-2 py-1 font-medium text-muted">
                          [{i}] {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasPreview.map((fila, fi) => (
                      <tr key={fi} className="border-b border-border last:border-0">
                        {fila.map((v, ci) => (
                          <td key={ci} className="whitespace-nowrap px-2 py-1">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Columna de fecha</label>
                  <select className="vc-input !py-1.5 !text-xs" value={columnaFecha} onChange={(e) => setColumnaFecha(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">Elige…</option>
                    {columnas.map((c, i) => (
                      <option key={i} value={i}>[{i}] {c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Formato de fecha</label>
                  <select className="vc-input !py-1.5 !text-xs" value={formatoFecha} onChange={(e) => setFormatoFecha(e.target.value as "MDY" | "DMY" | "YMD")}>
                    <option value="MDY">MM/DD/AAAA (EEUU)</option>
                    <option value="DMY">DD/MM/AAAA</option>
                    <option value="YMD">AAAA-MM-DD</option>
                  </select>
                </div>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-[11px] text-muted">Columna de descripción/comercio</label>
                <select className="vc-input !py-1.5 !text-xs" value={columnaDescripcion} onChange={(e) => setColumnaDescripcion(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Elige…</option>
                  {columnas.map((c, i) => (
                    <option key={i} value={i}>[{i}] {c}</option>
                  ))}
                </select>
              </div>

              <div className="mb-2 flex gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={modoMonto === "unico"} onChange={() => setModoMonto("unico")} />
                  Una sola columna de monto
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={modoMonto === "debito_credito"} onChange={() => setModoMonto("debito_credito")} />
                  Columnas separadas de débito/crédito
                </label>
              </div>

              {modoMonto === "unico" ? (
                <div className="mb-2">
                  <label className="mb-1 block text-[11px] text-muted">Columna de monto</label>
                  <select className="vc-input !py-1.5 !text-xs" value={columnaMonto} onChange={(e) => setColumnaMonto(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">Elige…</option>
                    {columnas.map((c, i) => (
                      <option key={i} value={i}>[{i}] {c}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Columna de débito (gasto)</label>
                    <select className="vc-input !py-1.5 !text-xs" value={columnaDebito} onChange={(e) => setColumnaDebito(e.target.value === "" ? "" : Number(e.target.value))}>
                      <option value="">(ninguna)</option>
                      {columnas.map((c, i) => (
                        <option key={i} value={i}>[{i}] {c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Columna de crédito (ingreso)</label>
                    <select className="vc-input !py-1.5 !text-xs" value={columnaCredito} onChange={(e) => setColumnaCredito(e.target.value === "" ? "" : Number(e.target.value))}>
                      <option value="">(ninguna)</option>
                      {columnas.map((c, i) => (
                        <option key={i} value={i}>[{i}] {c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <label className="mb-3 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={invertirSigno} onChange={(e) => setInvertirSigno(e.target.checked)} />
                Invertir el signo (marca esto si en la vista previa de abajo los gastos salen como "Ingreso" y viceversa)
              </label>

              {columnaFecha !== "" && columnaDescripcion !== "" && (columnaMonto !== "" || columnaDebito !== "" || columnaCredito !== "") && (
                <div className="mb-3 rounded border border-border bg-bg p-2 text-[11px]">
                  <p className="mb-1 font-medium text-muted">Vista previa con el mapeo actual:</p>
                  {filasPreview.slice(0, 3).map((fila, i) => (
                    <p key={i}>
                      {fila[Number(columnaFecha)]} · {fila[Number(columnaDescripcion)]} · {previsualizarMonto(fila)}
                    </p>
                  ))}
                </div>
              )}

              {error && <p className="mb-2 text-xs text-red">{error}</p>}

              <div className="flex gap-2">
                <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacionCsv}>
                  {cargando ? "Importando…" : `Importar ${totalFilas} transacción(es)`}
                </button>
                <button className="text-xs text-muted underline" onClick={onCerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {pasoCsv === "resultado" && resultado && (
            <ResultadoImportacion resultado={resultado} onCerrar={onCerrar} />
          )}
        </>
      )}

      {modo === "pdf" && (
        <>
          {bloqueadoPdf ? (
            <div className="text-center">
              <p className="mb-2 text-sm font-medium">Leer PDF con IA es parte de Core</p>
              <p className="mb-3 text-xs text-muted">
                Extraer transacciones de un PDF usa inteligencia artificial — se activa junto con Core.
                Mientras tanto, usa la pestaña de CSV / QuickBooks de arriba, que es gratis.
              </p>
              <button className="text-xs text-muted underline" onClick={onCerrar}>
                Cancelar
              </button>
            </div>
          ) : (
          pasoPdf === "elegir_archivo" && (
            <div>
              <p className="mb-2 text-sm font-medium">Subir estado de cuenta (PDF)</p>
              <p className="mb-3 text-xs text-muted">
                Sube el PDF del estado tal como lo descargas del portal de tu banco o tarjeta. Claude lo lee y
                extrae las transacciones — en el siguiente paso las revisas antes de importar nada.
              </p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={cargando}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) manejarArchivoPdf(file);
                }}
                className="block w-full text-xs"
              />
              {cargando && <p className="mt-2 text-xs text-muted">Leyendo el PDF con VICTOR… puede tardar unos segundos.</p>}
              {error && <p className="mt-2 text-xs text-red">{error}</p>}
              <button className="mt-3 text-xs text-muted underline" onClick={onCerrar}>
                Cancelar
              </button>
            </div>
          )
          )}

          {pasoPdf === "revisar" && (
            <div>
              <p className="mb-1 text-sm font-medium">{nombreArchivoPdf}</p>
              <p className="mb-3 text-xs text-muted">
                {transaccionesPdf.length} transacción(es) encontrada(s). Revisa la lista — quita cualquiera que no
                aplique antes de importar.
              </p>

              <div className="mb-3 max-h-64 overflow-y-auto rounded border border-border">
                <table className="w-full text-left text-[11px]">
                  <tbody>
                    {transaccionesPdf.map((t, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-2 py-1 text-muted">{t.fecha}</td>
                        <td className="px-2 py-1">{t.descripcion}</td>
                        <td className={`whitespace-nowrap px-2 py-1 text-right ${t.monto > 0 ? "" : "text-teal"}`}>
                          {t.monto > 0 ? "" : "+"}{formatMoney(Math.abs(t.monto))}
                        </td>
                        <td className="px-1 py-1">
                          <button className="text-red" title="Quitar esta fila" onClick={() => quitarFilaPdf(i)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <p className="mb-2 text-xs text-red">{error}</p>}

              <div className="flex gap-2">
                <button className="vc-btn-primary" disabled={cargando || transaccionesPdf.length === 0} onClick={confirmarImportacionPdf}>
                  {cargando ? "Importando…" : `Importar ${transaccionesPdf.length} transacción(es)`}
                </button>
                <button className="text-xs text-muted underline" onClick={onCerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {pasoPdf === "resultado" && resultado && (
            <ResultadoImportacion resultado={resultado} onCerrar={onCerrar} />
          )}
        </>
      )}
    </div>
  );
}

function ResultadoImportacion({
  resultado,
  onCerrar,
}: {
  resultado: { importadas: number; duplicadas: number; errores: number };
  onCerrar: () => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-teal">Importación completa</p>
      <p className="text-xs text-muted">
        {resultado.importadas} transacción(es) nueva(s) importada(s).
        {resultado.duplicadas > 0 && ` ${resultado.duplicadas} ya existían (omitidas).`}
        {resultado.errores > 0 && ` ${resultado.errores} fila(s) con error, no se pudieron leer.`}
      </p>
      <p className="mt-2 text-xs text-muted">Ya se están categorizando solas — revísalas en la pantalla de Gastos.</p>
      <button className="mt-3 vc-btn-primary" onClick={onCerrar}>
        Listo
      </button>
    </div>
  );
}
