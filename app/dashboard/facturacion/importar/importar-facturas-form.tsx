"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";

// Importar facturas históricas desde CSV/Excel (7 sept 2026) — mismo
// flujo de 2 pasos que /clientes/importar: 1) leer columnas del archivo,
// 2) confirmar el mapeo, 3) importar. El mapeo se pre-llena solo cuando
// el archivo trae encabezados conocidos (FreshBooks, QuickBooks o una
// hoja hecha a mano con nombres obvios) — el usuario puede corregir
// cualquier dropdown antes de importar.
//
// A diferencia de clientes, aquí hay más columnas posibles porque una
// factura tiene más campos que un cliente — pero solo 3 son requeridas:
// Cliente, Fecha de emisión y Subtotal. Todo lo demás (número, retención,
// IVU, estado, fecha de pago) tiene un default razonable si no se mapea.

type Entity = { id: string; name: string };

const ALIAS_CLIENTE = ["client", "cliente", "customer", "client name", "customer name", "nombre del cliente"];
const ALIAS_NUMERO = ["invoice number", "invoice #", "invoice no", "number", "numero", "número", "no.", "#"];
const ALIAS_FECHA = ["invoice date", "date", "fecha", "fecha de emisión", "fecha emision", "issue date"];
const ALIAS_FECHA_VENC = ["due date", "fecha de vencimiento", "fecha vencimiento", "vencimiento"];
const ALIAS_SUBTOTAL = ["subtotal", "amount", "monto", "total facturado", "line total", "invoice amount"];
const ALIAS_TOTAL = ["total", "total paid", "grand total"];
const ALIAS_RETENCION = ["retention", "retencion", "retención", "withholding", "retention %", "% retención"];
const ALIAS_IVU = ["tax", "ivu", "sales tax", "tax %", "% ivu"];
const ALIAS_ESTADO = ["status", "estado"];
const ALIAS_FECHA_PAGO = ["paid date", "payment date", "fecha de pago", "fecha pago"];
const ALIAS_DESCRIPCION = ["description", "descripcion", "descripción", "memo", "notes"];

// Si el archivo trae estas columnas (típicas del reporte "Payments
// Collected" de FreshBooks), es muy probable que sea 1-2 filas POR PAGO
// de cada factura (no 1 fila = 1 factura) — se sugiere automáticamente
// el modo "Pagos recibidos".
const ALIAS_METODO = ["method", "metodo", "método"];
const ALIAS_PAYMENT_FOR = ["payment for"];

function indiceDeAlias(columnas: string[], alias: string[]): number | "" {
  const normalizadas = columnas.map((c) => c.trim().toLowerCase());
  for (const a of alias) {
    const i = normalizadas.indexOf(a);
    if (i !== -1) return i;
  }
  return "";
}

type Paso = "elegir_archivo" | "mapear" | "resultado";

// Selector reusable de columna — evita repetir el mismo <select> 9 veces.
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

export default function ImportarFacturasForm({
  entities,
  returnTo,
  entidadPreseleccionada,
}: {
  entities: Entity[];
  returnTo?: string;
  entidadPreseleccionada?: string;
}) {
  const destino = returnTo || "/dashboard/facturacion";
  const router = useRouter();

  const entidadInicial = entities.find((e) => e.id === entidadPreseleccionada)?.id ?? entities[0]?.id ?? "";
  const [entityId, setEntityId] = useState(entidadInicial);
  const [paso, setPaso] = useState<Paso>("elegir_archivo");
  const [csvTexto, setCsvTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);

  const [columnaCliente, setColumnaCliente] = useState<number | "">("");
  const [columnaNumero, setColumnaNumero] = useState<number | "">("");
  const [columnaFecha, setColumnaFecha] = useState<number | "">("");
  const [columnaFechaVencimiento, setColumnaFechaVencimiento] = useState<number | "">("");
  const [columnaSubtotal, setColumnaSubtotal] = useState<number | "">("");
  const [columnaTotal, setColumnaTotal] = useState<number | "">("");
  const [columnaRetencionPct, setColumnaRetencionPct] = useState<number | "">("");
  const [columnaIvuPct, setColumnaIvuPct] = useState<number | "">("");
  const [columnaEstado, setColumnaEstado] = useState<number | "">("");
  const [columnaFechaPago, setColumnaFechaPago] = useState<number | "">("");
  const [columnaDescripcion, setColumnaDescripcion] = useState<number | "">("");

  const [formatoFecha, setFormatoFecha] = useState<"MDY" | "DMY" | "YMD">("MDY");
  const [estadoDefault, setEstadoDefault] = useState<"pagada" | "enviada">("pagada");

  // "estandar": 1 fila = 1 factura. "pagos_recibidos": el reporte
  // "Payments Collected" de FreshBooks, donde una factura puede traer 2
  // filas (monto neto + retención) o varias (pagos parciales), todas con
  // el mismo número — se agrupan por Número antes de crear la factura.
  const [modo, setModo] = useState<"estandar" | "pagos_recibidos">("estandar");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    importados: number;
    clientesCreados: number;
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

      setColumnaCliente(indiceDeAlias(data.columnas, ALIAS_CLIENTE));
      setColumnaNumero(indiceDeAlias(data.columnas, ALIAS_NUMERO));
      setColumnaFecha(indiceDeAlias(data.columnas, ALIAS_FECHA));
      setColumnaFechaVencimiento(indiceDeAlias(data.columnas, ALIAS_FECHA_VENC));
      setColumnaSubtotal(indiceDeAlias(data.columnas, ALIAS_SUBTOTAL));
      setColumnaTotal(indiceDeAlias(data.columnas, ALIAS_TOTAL));
      setColumnaRetencionPct(indiceDeAlias(data.columnas, ALIAS_RETENCION));
      setColumnaIvuPct(indiceDeAlias(data.columnas, ALIAS_IVU));
      setColumnaEstado(indiceDeAlias(data.columnas, ALIAS_ESTADO));
      setColumnaFechaPago(indiceDeAlias(data.columnas, ALIAS_FECHA_PAGO));
      setColumnaDescripcion(indiceDeAlias(data.columnas, ALIAS_DESCRIPCION));

      // Auto-detectar el reporte "Payments Collected" de FreshBooks: trae
      // columnas de Método de pago y "Payment for" que un listado normal
      // de facturas no tiene. Si las encontramos, sugerimos el modo
      // correcto de una vez en lugar de dejar que Joel se coma la mitad
      // de sus facturas otra vez.
      const pareceReportePagos = indiceDeAlias(data.columnas, ALIAS_METODO) !== "" && indiceDeAlias(data.columnas, ALIAS_PAYMENT_FOR) !== "";
      setModo(pareceReportePagos ? "pagos_recibidos" : "estandar");

      setPaso("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (columnaCliente === "" || columnaFecha === "" || columnaSubtotal === "") {
      setError(modo === "pagos_recibidos" ? "Faltan columnas requeridas: Cliente, Fecha y Monto." : "Faltan columnas requeridas: Cliente, Fecha de emisión y Subtotal.");
      return;
    }
    if (modo === "pagos_recibidos" && columnaNumero === "") {
      setError("En modo 'Pagos recibidos' la columna Número de factura es requerida — se usa para agrupar las filas del mismo pago.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/facturas/csv/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          csv: csvTexto,
          formatoFecha,
          estadoDefault,
          modo,
          columnaCliente: Number(columnaCliente),
          columnaFecha: Number(columnaFecha),
          columnaSubtotal: Number(columnaSubtotal),
          columnaNumero: columnaNumero === "" ? null : Number(columnaNumero),
          columnaFechaVencimiento: columnaFechaVencimiento === "" ? null : Number(columnaFechaVencimiento),
          columnaTotal: columnaTotal === "" ? null : Number(columnaTotal),
          columnaRetencionPct: columnaRetencionPct === "" ? null : Number(columnaRetencionPct),
          columnaIvuPct: columnaIvuPct === "" ? null : Number(columnaIvuPct),
          columnaEstado: columnaEstado === "" ? null : Number(columnaEstado),
          columnaFechaPago: columnaFechaPago === "" ? null : Number(columnaFechaPago),
          columnaDescripcion: columnaDescripcion === "" ? null : Number(columnaDescripcion),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar el archivo.");
      setResultado({
        importados: data.importados,
        clientesCreados: data.clientesCreados,
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

  // Deshacer esta importación de una vez, sin tener que ir a otra pantalla
  // — para el caso de "subí el archivo equivocado" que reportó Joel: ver
  // el resultado y de inmediato poder devolverlo.
  async function deshacerImportacion() {
    if (!resultado?.importBatchId) return;
    if (!confirm(`¿Borrar las ${resultado.importados} factura(s) que se acaban de importar? Esto no se puede deshacer.`)) return;
    setDeshaciendo(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/csv/importaciones/${resultado.importBatchId}`, { method: "DELETE" });
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
        <h1 className="text-lg font-medium">Importar facturas (CSV)</h1>
        <button onClick={() => router.push(destino)} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      {paso === "elegir_archivo" && (
        <div className="mb-3 text-right">
          <Link
            href={`/dashboard/facturacion/importaciones${entityId ? `?entidadId=${entityId}` : ""}`}
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
              Sube una hoja (Excel o CSV) con lo que ya has facturado — de FreshBooks, QuickBooks, o armada a mano. Solo hacen falta 3
              columnas: <strong>cliente</strong>, <strong>fecha</strong> y <strong>monto</strong> — el resto (número, retención, IVU,
              estado, fecha de pago) es opcional. Si un cliente no existe todavía, VICTOR lo crea solo al importar.
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

            <div className="mb-3 rounded border border-border p-2">
              <label className="mb-1 flex items-center gap-2 text-[11px] font-medium">
                <input type="checkbox" checked={modo === "pagos_recibidos"} onChange={(e) => setModo(e.target.checked ? "pagos_recibidos" : "estandar")} />
                Este archivo es un reporte de &quot;Pagos recibidos&quot; (FreshBooks)
              </label>
              <p className="text-[11px] text-muted">
                Úsalo si el archivo trae 1-2 filas <strong>por pago</strong> en vez de 1 fila por factura — por ejemplo, una fila con el
                monto cobrado y otra aparte con la retención (columna Descripción dice &quot;Retención 6%&quot;). VICTOR agrupa las filas
                que compartan el mismo Número de factura y marca todo como Pagada.
              </p>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <SelectorColumna etiqueta="Cliente" requerido columnas={columnas} valor={columnaCliente} onChange={setColumnaCliente} />
              <SelectorColumna
                etiqueta={modo === "pagos_recibidos" ? "Fecha del pago" : "Fecha de emisión"}
                requerido
                columnas={columnas}
                valor={columnaFecha}
                onChange={setColumnaFecha}
              />
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
                etiqueta={modo === "pagos_recibidos" ? "Monto de esta fila (Amount)" : "Subtotal (bruto)"}
                requerido
                columnas={columnas}
                valor={columnaSubtotal}
                onChange={setColumnaSubtotal}
              />
              <SelectorColumna
                etiqueta={modo === "pagos_recibidos" ? "Número de factura" : "Número de factura (opcional)"}
                requerido={modo === "pagos_recibidos"}
                columnas={columnas}
                valor={columnaNumero}
                onChange={setColumnaNumero}
              />
            </div>

            {modo === "pagos_recibidos" ? (
              <div className="mb-3">
                <SelectorColumna
                  etiqueta="Descripción (para detectar la fila de retención, ej. 'Retención 6%')"
                  columnas={columnas}
                  valor={columnaDescripcion}
                  onChange={setColumnaDescripcion}
                />
                <p className="mt-2 text-[11px] text-muted">
                  Todas las facturas de este archivo se marcarán como <strong>Pagadas</strong>, con la fecha de pago tomada de la fila más
                  reciente de cada factura.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <SelectorColumna
                    etiqueta="Total (si ya viene con IVU/retención aplicados)"
                    columnas={columnas}
                    valor={columnaTotal}
                    onChange={setColumnaTotal}
                  />
                  <SelectorColumna etiqueta="Fecha de vencimiento" columnas={columnas} valor={columnaFechaVencimiento} onChange={setColumnaFechaVencimiento} />
                </div>

                <div className="mb-2 grid grid-cols-2 gap-2">
                  <SelectorColumna etiqueta="% Retención" columnas={columnas} valor={columnaRetencionPct} onChange={setColumnaRetencionPct} />
                  <SelectorColumna etiqueta="% IVU" columnas={columnas} valor={columnaIvuPct} onChange={setColumnaIvuPct} />
                </div>

                <div className="mb-2 grid grid-cols-2 gap-2">
                  <SelectorColumna etiqueta="Estado (pagada/enviada)" columnas={columnas} valor={columnaEstado} onChange={setColumnaEstado} />
                  <SelectorColumna etiqueta="Fecha de pago" columnas={columnas} valor={columnaFechaPago} onChange={setColumnaFechaPago} />
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-[11px] text-muted">
                    Estado por defecto (para filas sin columna de Estado, o con un texto que no se reconozca)
                  </label>
                  <select className="vc-input !py-1.5 !text-xs" value={estadoDefault} onChange={(e) => setEstadoDefault(e.target.value as "pagada" | "enviada")}>
                    <option value="pagada">Pagada</option>
                    <option value="enviada">Enviada (pendiente de cobro)</option>
                  </select>
                </div>
              </>
            )}

            {error && <p className="mb-2 text-xs text-red">{error}</p>}

            <div className="flex gap-2">
              <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacion}>
                {cargando ? "Importando…" : `Importar ${totalFilas} factura(s)`}
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
              {resultado.importados} factura(s) importada(s).
              {resultado.clientesCreados > 0 && ` ${resultado.clientesCreados} cliente(s) nuevo(s) creado(s) sobre la marcha.`}
              {resultado.duplicados > 0 && ` ${resultado.duplicados} ya existían (mismo cliente + número + monto, omitidas).`}
              {resultado.errores > 0 && ` ${resultado.errores} fila(s) con datos incompletos, no se pudieron importar.`}
            </p>

            {deshecho ? (
              <p className="mt-3 text-xs text-teal">Importación deshecha — esas facturas ya no están.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="vc-btn-primary" onClick={() => router.push(destino)}>
                  {returnTo ? "Volver" : "Ver facturas"}
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
