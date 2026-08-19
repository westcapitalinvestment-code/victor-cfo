"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Flujo de subir un CSV (estado de cuenta de banco, exporte de tarjeta, o
// registro de QuickBooks) a una cuenta manual, en dos pasos:
//   1. Leemos el archivo en el navegador (FileReader, nunca sale del
//      cliente hasta que el usuario confirma), lo mandamos a
//      /csv/preview para ver las columnas y las primeras filas.
//   2. El usuario dice cuál columna es cuál (fecha/descripción/monto, o
//      débito+crédito por separado), el formato de fecha, y si hace falta
//      invertir el signo — mandamos TODO a /csv/importar, que hace el
//      trabajo real (parseo completo + inserta en transactions, donde el
//      motor de categorización ya existente las toma solas).
// Cada banco/tarjeta (y QuickBooks) exporta distinto, por eso este paso de
// mapeo manual en vez de adivinar un formato fijo.

type Paso = "elegir_archivo" | "mapear" | "resultado";

export default function SubirCsv({ cuentaId, onCerrar }: { cuentaId: string; onCerrar: () => void }) {
  const [paso, setPaso] = useState<Paso>("elegir_archivo");
  const [csvTexto, setCsvTexto] = useState<string>("");
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapeo elegido por el usuario.
  const [columnaFecha, setColumnaFecha] = useState<number | "">("");
  const [columnaDescripcion, setColumnaDescripcion] = useState<number | "">("");
  const [modoMonto, setModoMonto] = useState<"unico" | "debito_credito">("unico");
  const [columnaMonto, setColumnaMonto] = useState<number | "">("");
  const [columnaDebito, setColumnaDebito] = useState<number | "">("");
  const [columnaCredito, setColumnaCredito] = useState<number | "">("");
  const [formatoFecha, setFormatoFecha] = useState<"MDY" | "DMY" | "YMD">("MDY");
  const [invertirSigno, setInvertirSigno] = useState(false);

  const [resultado, setResultado] = useState<{ importadas: number; duplicadas: number; errores: number } | null>(null);

  async function manejarArchivo(file: File) {
    setError(null);
    setCargando(true);
    setNombreArchivo(file.name);
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
      setPaso("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
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
      const res = await fetch("/api/cuentas-manuales/csv/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualAccountId: cuentaId,
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
      setPaso("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  // Vista previa de cómo se vería el monto con el mapeo actual — ayuda al
  // usuario a confirmar visualmente que el signo/columna están correctos
  // antes de importar todo el archivo.
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

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      {paso === "elegir_archivo" && (
        <div>
          <p className="mb-2 text-sm font-medium">Subir estado de cuenta (CSV)</p>
          <p className="mb-3 text-xs text-muted">
            Exporta el estado de cuenta de tu banco/tarjeta (o el registro de QuickBooks) como CSV y súbelo aquí —
            en el siguiente paso confirmas cuál columna es cuál, porque cada banco lo exporta distinto.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={cargando}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) manejarArchivo(file);
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

      {paso === "mapear" && (
        <div>
          <p className="mb-1 text-sm font-medium">{nombreArchivo}</p>
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
            <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacion}>
              {cargando ? "Importando…" : `Importar ${totalFilas} transacción(es)`}
            </button>
            <button className="text-xs text-muted underline" onClick={onCerrar}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {paso === "resultado" && resultado && (
        <div>
          <p className="mb-1 text-sm font-medium text-teal">Importación completa</p>
          <p className="text-xs text-muted">
            {resultado.importadas} transacción(es) nueva(s) importada(s).
            {resultado.duplicadas > 0 && ` ${resultado.duplicadas} ya existían (omitidas).`}
            {resultado.errores > 0 && ` ${resultado.errores} fila(s) con error, no se pudieron leer.`}
          </p>
          <p className="mt-2 text-xs text-muted">
            Ya se están categorizando solas — revísalas en la pantalla de Gastos.
          </p>
          <button className="mt-3 vc-btn-primary" onClick={onCerrar}>
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
