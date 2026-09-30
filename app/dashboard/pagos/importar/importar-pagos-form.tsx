"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";

// Importar pagos históricos a contratistas desde CSV/Excel (30 sept 2026)
// — mismo flujo de 2 pasos que /facturacion/importar: 1) leer columnas del
// archivo, 2) confirmar el mapeo, 3) importar. El mapeo se pre-llena solo
// cuando el archivo trae encabezados conocidos — el usuario puede corregir
// cualquier dropdown antes de importar.
//
// Solo 3 columnas son requeridas: Contratista, Fecha y Bruto pagado. Todo
// lo demás (Tax ID, % Retención, Retenido, Es corporación) tiene un
// default razonable si no se mapea — y si el contratista no existe
// todavía, VICTOR lo crea solo al importar (igual que clientes en el
// importador de facturas).

type Entity = { id: string; name: string };

const ALIAS_CONTRATISTA = ["contractor", "contratista", "vendor", "vendor name", "nombre del contratista", "nombre", "payee"];
const ALIAS_TAX_ID = ["tax id", "taxid", "ssn", "ein", "tax id/ssn", "identificación", "identificacion"];
const ALIAS_FECHA = ["date", "fecha", "payment date", "fecha de pago", "fecha pago"];
const ALIAS_BRUTO = ["gross", "gross amount", "amount", "monto", "bruto", "bruto pagado", "total paid", "pago bruto"];
const ALIAS_RETENCION_PCT = ["retention %", "retencion %", "retención %", "% retención", "withholding %", "retention"];
const ALIAS_RETENIDO = ["retained", "retenido", "withheld", "withholding amount", "retención", "retencion"];
const ALIAS_ES_CORPORACION = ["corporation", "corporación", "corporacion", "is corporation", "es corporación", "es corporacion", "entity type", "tipo"];

function indiceDeAlias(columnas: string[], alias: string[]): number | "" {
  const normalizadas = columnas.map((c) => c.trim().toLowerCase());
  for (const a of alias) {
    const i = normalizadas.indexOf(a);
    if (i !== -1) return i;
  }
  return "";
}

type Paso = "elegir_archivo" | "mapear" | "resultado";

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

export default function ImportarPagosForm({
  entities,
  returnTo,
  entidadPreseleccionada,
}: {
  entities: Entity[];
  returnTo?: string;
  entidadPreseleccionada?: string;
}) {
  const destino = returnTo || "/dashboard/pagos";
  const router = useRouter();

  const entidadInicial = entities.find((e) => e.id === entidadPreseleccionada)?.id ?? entities[0]?.id ?? "";
  const [entityId, setEntityId] = useState(entidadInicial);
  const [paso, setPaso] = useState<Paso>("elegir_archivo");
  const [csvTexto, setCsvTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);

  const [columnaContratista, setColumnaContratista] = useState<number | "">("");
  const [columnaTaxId, setColumnaTaxId] = useState<number | "">("");
  const [columnaFecha, setColumnaFecha] = useState<number | "">("");
  const [columnaBruto, setColumnaBruto] = useState<number | "">("");
  const [columnaRetencionPct, setColumnaRetencionPct] = useState<number | "">("");
  const [columnaRetenido, setColumnaRetenido] = useState<number | "">("");
  const [columnaEsCorporacion, setColumnaEsCorporacion] = useState<number | "">("");

  const [formatoFecha, setFormatoFecha] = useState<"MDY" | "DMY" | "YMD">("MDY");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    importados: number;
    contratistasCreados: number;
    duplicados: number;
    errores: number;
    importBatchId: string | null;
  } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [deshecho, setDeshecho] = useState(false);

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

      setColumnaContratista(indiceDeAlias(data.columnas, ALIAS_CONTRATISTA));
      setColumnaTaxId(indiceDeAlias(data.columnas, ALIAS_TAX_ID));
      setColumnaFecha(indiceDeAlias(data.columnas, ALIAS_FECHA));
      setColumnaBruto(indiceDeAlias(data.columnas, ALIAS_BRUTO));
      setColumnaRetencionPct(indiceDeAlias(data.columnas, ALIAS_RETENCION_PCT));
      setColumnaRetenido(indiceDeAlias(data.columnas, ALIAS_RETENIDO));
      setColumnaEsCorporacion(indiceDeAlias(data.columnas, ALIAS_ES_CORPORACION));

      setPaso("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (columnaContratista === "" || columnaFecha === "" || columnaBruto === "") {
      setError("Faltan columnas requeridas: Contratista, Fecha y Bruto pagado.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/pagos/csv/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          csv: csvTexto,
          formatoFecha,
          columnaContratista: Number(columnaContratista),
          columnaFecha: Number(columnaFecha),
          columnaBruto: Number(columnaBruto),
          columnaTaxId: columnaTaxId === "" ? null : Number(columnaTaxId),
          columnaRetencionPct: columnaRetencionPct === "" ? null : Number(columnaRetencionPct),
          columnaRetenido: columnaRetenido === "" ? null : Number(columnaRetenido),
          columnaEsCorporacion: columnaEsCorporacion === "" ? null : Number(columnaEsCorporacion),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar el archivo.");
      setResultado({
        importados: data.importados,
        contratistasCreados: data.contratistasCreados,
        duplicados: data.duplicados,
        errores: data.errores,
        importBatchId: data.importBatchId ?? null,
      });
      setPaso("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function deshacerImportacion() {
    if (!resultado?.importBatchId) return;
    if (!confirm(`¿Borrar los ${resultado.importados} pago(s) que se acaban de importar? Esto no se puede deshacer.`)) return;
    setDeshaciendo(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos/csv/importaciones/${resultado.importBatchId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo deshacer la importación.");
      setDeshecho(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo deshacer la importación.");
    } finally {
      setDeshaciendo(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Importar pagos a contratistas (CSV)</h1>
        <button onClick={() => router.push(destino)} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      {paso === "elegir_archivo" && (
        <div className="mb-3 text-right">
          <Link
            href={`/dashboard/pagos/importaciones${entityId ? `?entidadId=${entityId}` : ""}`}
            className="text-xs font-medium text-muted hover:text-teal"
          >
            Ver importaciones anteriores →
          </Link>
        </div>
      )}

      <div className="vc-card flex flex-col gap-3">
        {entities.length > 1 && paso !== "resultado" && (
          <div>
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

        {paso === "elegir_archivo" && (
          <div>
            <p className="mb-3 text-xs text-muted">
              Sube una hoja (Excel o CSV) con lo que ya le has pagado este año a tus contratistas — de otro sistema, o armada a mano.
              Solo hacen falta 3 columnas: <strong>contratista</strong>, <strong>fecha</strong> y <strong>bruto pagado</strong> — el
              resto (Tax ID, % retención, retenido, si es corporación) es opcional. Si un contratista no existe todavía, VICTOR lo crea
              solo al importar, y esos pagos cuentan de inmediato hacia el acumulado de $500 del Modelo 480.6SP.
            </p>
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
              <SelectorColumna etiqueta="Contratista" requerido columnas={columnas} valor={columnaContratista} onChange={setColumnaContratista} />
              <SelectorColumna etiqueta="Fecha de pago" requerido columnas={columnas} valor={columnaFecha} onChange={setColumnaFecha} />
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
              <SelectorColumna etiqueta="Bruto pagado" requerido columnas={columnas} valor={columnaBruto} onChange={setColumnaBruto} />
              <SelectorColumna etiqueta="Tax ID (SSN/EIN)" columnas={columnas} valor={columnaTaxId} onChange={setColumnaTaxId} />
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <SelectorColumna etiqueta="% Retención" columnas={columnas} valor={columnaRetencionPct} onChange={setColumnaRetencionPct} />
              <SelectorColumna etiqueta="Retenido (monto, si ya lo tienes)" columnas={columnas} valor={columnaRetenido} onChange={setColumnaRetenido} />
            </div>

            <div className="mb-3">
              <SelectorColumna
                etiqueta="Es corporación/entidad (si/no)"
                columnas={columnas}
                valor={columnaEsCorporacion}
                onChange={setColumnaEsCorporacion}
              />
              <p className="mt-2 text-[11px] text-muted">
                Si no mapeas esta columna, todos los contratistas nuevos se crean como individuo (casilla 1 o 3 del 480.6SP) — puedes
                corregirlo luego en Contratistas.
              </p>
            </div>

            {error && <p className="mb-2 text-xs text-red">{error}</p>}

            <div className="flex gap-2">
              <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacion}>
                {cargando ? "Importando…" : `Importar ${totalFilas} pago(s)`}
              </button>
              <button className="text-xs text-muted underline" onClick={() => setPaso("elegir_archivo")}>
                Elegir otro archivo
              </button>
            </div>
          </div>
        )}

        {paso === "resultado" && resultado && (
          <div>
            <p className="mb-1 text-sm font-medium text-teal">Importación completa</p>
            <p className="text-xs text-muted">
              {resultado.importados} pago(s) importado(s).
              {resultado.contratistasCreados > 0 && ` ${resultado.contratistasCreados} contratista(s) nuevo(s) creado(s) sobre la marcha.`}
              {resultado.duplicados > 0 && ` ${resultado.duplicados} ya existían (mismo contratista + fecha + monto, omitidos).`}
              {resultado.errores > 0 && ` ${resultado.errores} fila(s) con datos incompletos, no se pudieron importar.`}
            </p>

            {deshecho ? (
              <p className="mt-3 text-xs text-teal">Importación deshecha — esos pagos ya no están.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="vc-btn-primary" onClick={() => router.push(destino)}>
                  {returnTo ? "Volver" : "Ver Pagos"}
                </button>
                {resultado.importados > 0 && resultado.importBatchId && (
                  <button
                    className="rounded border border-red px-3 py-1.5 text-xs text-red hover:bg-red/10"
                    disabled={deshaciendo}
                    onClick={deshacerImportacion}
                  >
                    {deshaciendo ? "Deshaciendo…" : "¿Archivo equivocado? Deshacer esta importación"}
                  </button>
                )}
              </div>
            )}
            {error && <p className="mt-2 text-xs text-red">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
