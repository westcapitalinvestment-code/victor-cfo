"use client";

import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { formatMoney } from "@/lib/format";

// Cliente del módulo de Ventas de POS (#786, 1 oct 2026). Mismo patrón de
// 2 pasos (preview genérico → mapeo → importar) que /pagos/importar, pero
// todo en una sola pantalla junto con el historial de lotes ya subidos —
// este módulo es chico (subir reporte ocasional), no amerita una ruta
// separada de "importaciones anteriores".
//
// No se asume el formato exacto de Clover/Verifone todavía (Joel no tiene
// aún un archivo de muestra real) — el mapeo de columnas es manual/ajustable,
// con alias comunes pre-llenados cuando coinciden.

type Entity = { id: string; name: string };

type Lote = {
  importBatchId: string;
  provider: string;
  nombreArchivo: string | null;
  createdAt: string;
  periodoInicio: string;
  periodoFin: string;
  filas: number;
  grossSales: number;
  ivuEstatalMonto: number;
  ivuMunicipalMonto: number;
  tipsMonto: number;
  netSales: number;
  ivuSplitEstimado: boolean;
};

const ALIAS_FECHA = ["date", "fecha", "day", "día", "business date", "fecha del reporte"];
const ALIAS_GROSS = ["gross sales", "gross", "total sales", "venta bruta", "ventas brutas", "bruto", "sales"];
const ALIAS_IVU_COMBINADO = ["taxes", "tax", "sales tax", "ivu", "taxes & fees", "impuestos"];
const ALIAS_PROPINAS = ["tips", "gratuity", "propinas", "service charge", "propina"];
const ALIAS_NETO = ["net sales", "net", "venta neta", "neto"];

function indiceDeAlias(columnas: string[], alias: string[]): number | "" {
  const normalizadas = columnas.map((c) => c.trim().toLowerCase());
  for (const a of alias) {
    const i = normalizadas.indexOf(a);
    if (i !== -1) return i;
  }
  return "";
}

function SelectorColumna({
  etiqueta,
  requerido = false,
  columnas,
  valor,
  onChange,
}: {
  etiqueta: string;
  requerido?: boolean;
  columnas: string[];
  valor: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted">
        {etiqueta} {requerido ? "(requerido)" : "(opcional)"}
      </label>
      <select className="vc-input !py-1.5 !text-xs" value={valor} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}>
        <option value="">{requerido ? "Elige…" : "(ninguna)"}</option>
        {columnas.map((c, i) => (
          <option key={i} value={i}>
            [{i}] {c}
          </option>
        ))}
      </select>
    </div>
  );
}

type Paso = "elegir_archivo" | "mapear" | "resultado";

export default function PosClient({ entities, entidadInicial }: { entities: Entity[]; entidadInicial: string }) {
  const [entityId, setEntityId] = useState(entidadInicial);
  const [paso, setPaso] = useState<Paso>("elegir_archivo");
  const [provider, setProvider] = useState<"clover" | "verifone" | "square" | "otro">("clover");
  const [csvTexto, setCsvTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);

  const [columnaFecha, setColumnaFecha] = useState<number | "">("");
  const [columnaGross, setColumnaGross] = useState<number | "">("");
  const [columnaIvuCombinado, setColumnaIvuCombinado] = useState<number | "">("");
  const [columnaPropinas, setColumnaPropinas] = useState<number | "">("");
  const [columnaNeto, setColumnaNeto] = useState<number | "">("");
  const [formatoFecha, setFormatoFecha] = useState<"MDY" | "DMY" | "YMD">("MDY");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ importados: number; errores: number; importBatchId: string | null } | null>(null);

  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargarLotes = useCallback(async () => {
    if (!entityId) return;
    const res = await fetch(`/api/negocio/pos?entidadId=${entityId}`);
    const data = await res.json();
    if (res.ok) setLotes(data.lotes);
  }, [entityId]);

  useEffect(() => {
    cargarLotes();
  }, [cargarLotes]);

  async function leerArchivoComoCsv(file: File): Promise<string> {
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (!esExcel) return file.text();
    const buffer = await file.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];
    if (!primeraHoja) throw new Error("El archivo de Excel no tiene ninguna hoja con datos.");
    return XLSX.utils.sheet_to_csv(primeraHoja);
  }

  async function manejarArchivo(file: File) {
    setError(null);
    setCargando(true);
    setNombreArchivo(file.name);
    try {
      const texto = await leerArchivoComoCsv(file);
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

      setColumnaFecha(indiceDeAlias(data.columnas, ALIAS_FECHA));
      setColumnaGross(indiceDeAlias(data.columnas, ALIAS_GROSS));
      setColumnaIvuCombinado(indiceDeAlias(data.columnas, ALIAS_IVU_COMBINADO));
      setColumnaPropinas(indiceDeAlias(data.columnas, ALIAS_PROPINAS));
      setColumnaNeto(indiceDeAlias(data.columnas, ALIAS_NETO));

      setPaso("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (columnaFecha === "" || columnaGross === "") {
      setError("Faltan columnas requeridas: Fecha y Venta Bruta.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/negocio/pos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          csv: csvTexto,
          provider,
          nombreArchivo,
          formatoFecha,
          columnaFecha: Number(columnaFecha),
          columnaGross: Number(columnaGross),
          columnaIvuCombinado: columnaIvuCombinado === "" ? null : Number(columnaIvuCombinado),
          columnaPropinas: columnaPropinas === "" ? null : Number(columnaPropinas),
          columnaNeto: columnaNeto === "" ? null : Number(columnaNeto),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar el archivo.");
      setResultado({ importados: data.importados, errores: data.errores, importBatchId: data.importBatchId ?? null });
      setPaso("resultado");
      cargarLotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function borrarLote(batchId: string) {
    if (!confirm("¿Borrar este lote de ventas de POS? Esto no se puede deshacer.")) return;
    setBorrando(batchId);
    try {
      const res = await fetch(`/api/negocio/pos/${batchId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo borrar.");
      cargarLotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setBorrando(null);
    }
  }

  function reiniciar() {
    setPaso("elegir_archivo");
    setCsvTexto("");
    setNombreArchivo("");
    setColumnas([]);
    setFilasPreview([]);
    setResultado(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium">Ventas de POS (restaurante)</h1>
        <p className="mt-1 text-xs text-muted">
          Sube el reporte de ventas que exportas desde Clover o Verifone (Reporting → Export CSV) para desglosar venta bruta, IVU
          estatal/municipal, propinas y neto. Esto NO crea un ingreso nuevo — tu depósito real ya llega por el banco conectado; esto
          solo desglosa ese depósito para tus reportes y Hacienda.
        </p>
      </div>

      {entities.length > 1 && (
        <div className="vc-card mb-4">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Entidad</label>
          <select className="vc-input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="vc-card mb-4 flex flex-col gap-3">
        {paso === "elegir_archivo" && (
          <div>
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-muted">Proveedor de POS</label>
              <select className="vc-input !py-1.5 !text-xs" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                <option value="clover">Clover</option>
                <option value="verifone">Verifone</option>
                <option value="square">Square</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={cargando}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) manejarArchivo(file);
              }}
              className="block w-full text-xs"
            />
            {cargando && <p className="mt-2 text-xs text-muted">Leyendo archivo…</p>}
            {error && <p className="mt-2 text-xs text-red">{error}</p>}
          </div>
        )}

        {paso === "mapear" && (
          <div>
            <p className="mb-1 text-sm font-medium">{nombreArchivo}</p>
            <p className="mb-3 text-xs text-muted">{totalFilas} fila(s) encontradas. Confirma el mapeo de columnas:</p>

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
                        <td key={ci} className="whitespace-nowrap px-2 py-1">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <SelectorColumna etiqueta="Fecha" requerido columnas={columnas} valor={columnaFecha} onChange={setColumnaFecha} />
              <SelectorColumna etiqueta="Venta Bruta (Gross Sales)" requerido columnas={columnas} valor={columnaGross} onChange={setColumnaGross} />
            </div>

            <div className="mb-2">
              <label className="mb-1 block text-[11px] text-muted">Formato de las fechas del archivo</label>
              <select className="vc-input !py-1.5 !text-xs" value={formatoFecha} onChange={(e) => setFormatoFecha(e.target.value as "MDY" | "DMY" | "YMD")}>
                <option value="MDY">MM/DD/AAAA (EEUU)</option>
                <option value="DMY">DD/MM/AAAA</option>
                <option value="YMD">AAAA-MM-DD</option>
              </select>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <SelectorColumna
                etiqueta="IVU/Taxes (combinado)"
                columnas={columnas}
                valor={columnaIvuCombinado}
                onChange={setColumnaIvuCombinado}
              />
              <SelectorColumna etiqueta="Propinas (Tips)" columnas={columnas} valor={columnaPropinas} onChange={setColumnaPropinas} />
            </div>

            <div className="mb-3">
              <SelectorColumna etiqueta="Venta Neta (si el reporte la trae)" columnas={columnas} valor={columnaNeto} onChange={setColumnaNeto} />
              <p className="mt-2 text-[11px] text-muted">
                Si mapeas "IVU/Taxes (combinado)", VICTOR lo separa estimado entre estatal y municipal usando las tasas configuradas en
                tu entidad. Si tu reporte ya trae el IVU separado por tasa, dímelo y ajustamos el importador.
              </p>
            </div>

            {error && <p className="mb-2 text-xs text-red">{error}</p>}

            <div className="flex gap-2">
              <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacion}>
                {cargando ? "Importando…" : `Importar ${totalFilas} fila(s)`}
              </button>
              <button className="text-xs text-muted underline" onClick={reiniciar}>
                Elegir otro archivo
              </button>
            </div>
          </div>
        )}

        {paso === "resultado" && resultado && (
          <div>
            <p className="mb-1 text-sm font-medium text-teal">Importación completa</p>
            <p className="text-xs text-muted">
              {resultado.importados} período(s) importado(s).
              {resultado.errores > 0 && ` ${resultado.errores} fila(s) con datos incompletos, no se pudieron importar.`}
            </p>
            <button className="vc-btn-primary mt-3" onClick={reiniciar}>
              Subir otro reporte
            </button>
          </div>
        )}
      </div>

      <div className="vc-card">
        <p className="mb-3 text-sm font-medium">Lotes subidos</p>
        {lotes === null && <p className="text-xs text-muted">Cargando…</p>}
        {lotes !== null && lotes.length === 0 && <p className="text-xs text-muted">Todavía no has subido ningún reporte de POS.</p>}
        {lotes !== null && lotes.length > 0 && (
          <div className="flex flex-col gap-3">
            {lotes.map((lote) => (
              <div key={lote.importBatchId} className="rounded border border-border p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium capitalize">
                    {lote.provider} — {lote.periodoInicio} a {lote.periodoFin}
                  </span>
                  <button
                    className="text-[11px] text-red underline disabled:opacity-50"
                    disabled={borrando === lote.importBatchId}
                    onClick={() => borrarLote(lote.importBatchId)}
                  >
                    {borrando === lote.importBatchId ? "Borrando…" : "Borrar"}
                  </button>
                </div>
                {lote.nombreArchivo && <p className="mb-2 text-muted">{lote.nombreArchivo}</p>}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-muted">Venta bruta</span>
                  <span className="text-right">{formatMoney(lote.grossSales)}</span>
                  <span className="text-muted">IVU estatal (10.5%){lote.ivuSplitEstimado ? " — estimado" : ""}</span>
                  <span className="text-right">{formatMoney(lote.ivuEstatalMonto)}</span>
                  <span className="text-muted">IVU municipal (1%){lote.ivuSplitEstimado ? " — estimado" : ""}</span>
                  <span className="text-right">{formatMoney(lote.ivuMunicipalMonto)}</span>
                  <span className="text-muted">Propinas</span>
                  <span className="text-right">{formatMoney(lote.tipsMonto)}</span>
                  <span className="font-medium">Venta neta</span>
                  <span className="text-right font-medium text-teal">{formatMoney(lote.netSales)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
