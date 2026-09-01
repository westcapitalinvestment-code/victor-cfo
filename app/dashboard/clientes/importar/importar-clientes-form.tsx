"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

// Importar clientes desde CSV — mismo flujo de 2 pasos que "Subir estado
// de cuenta" (app/dashboard/cuentas/subir-csv.tsx): 1) leer columnas del
// archivo, 2) confirmar el mapeo, 3) importar. La diferencia es que aquí
// el mapeo se PRE-LLENA solo cuando el archivo trae encabezados conocidos
// de FreshBooks (Joel pidió esto explícitamente: "que ahorre trabajo al
// usuario") — si el auto-match falla o el archivo es de otro sistema, el
// usuario igual puede corregir cada dropdown a mano antes de importar.
//
// La dirección es distinta a todo lo demás: FreshBooks la reparte en
// varias columnas (Street, Street 2, City, Province/State, Postal Code,
// Country) en vez de una sola, así que en vez de un <select> es una lista
// de checkboxes — todas las marcadas se concatenan con ", " al importar.

type Entity = { id: string; name: string };

// Alias conocidos (minúsculas) por campo — el orden importa: el primero
// que aparezca en el archivo gana. "organization" antes que "display
// name" porque para un cliente de negocio el nombre de la empresa es más
// útil en el expediente que el nombre de la persona de contacto.
const ALIAS_NOMBRE = ["organization", "display name", "client name", "company", "name", "nombre"];
const ALIAS_EMAIL = ["email", "e-mail", "correo", "correo electrónico"];
const ALIAS_TELEFONO = ["phone number", "phone", "business phone", "mobile phone", "telefono", "teléfono"];
const ALIAS_TAX_ID = ["vat number", "tax number", "business number", "ein", "tax id"];
const ALIAS_DIRECCION = [
  "street",
  "street 1",
  "street 2",
  "address",
  "address line 1",
  "address line 2",
  "city",
  "province",
  "state",
  "province/state",
  "postal code",
  "zip",
  "zip code",
  "country",
  "direccion",
  "dirección",
];

function indiceDeAlias(columnas: string[], alias: string[]): number | "" {
  const normalizadas = columnas.map((c) => c.trim().toLowerCase());
  for (const a of alias) {
    const i = normalizadas.indexOf(a);
    if (i !== -1) return i;
  }
  return "";
}

function indicesDeDireccion(columnas: string[]): number[] {
  const normalizadas = columnas.map((c) => c.trim().toLowerCase());
  return normalizadas.reduce<number[]>((acc, c, i) => {
    if (ALIAS_DIRECCION.includes(c)) acc.push(i);
    return acc;
  }, []);
}

type Paso = "elegir_archivo" | "mapear" | "resultado";

export default function ImportarClientesForm({ entities, returnTo }: { entities: Entity[]; returnTo?: string }) {
  const destino = returnTo || "/dashboard/clientes";
  const router = useRouter();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [paso, setPaso] = useState<Paso>("elegir_archivo");
  const [csvTexto, setCsvTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filasPreview, setFilasPreview] = useState<string[][]>([]);
  const [totalFilas, setTotalFilas] = useState(0);

  const [columnaNombre, setColumnaNombre] = useState<number | "">("");
  const [columnaEmail, setColumnaEmail] = useState<number | "">("");
  const [columnaTelefono, setColumnaTelefono] = useState<number | "">("");
  const [columnaTaxId, setColumnaTaxId] = useState<number | "">("");
  const [columnasDireccion, setColumnasDireccion] = useState<number[]>([]);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ importados: number; duplicados: number; errores: number } | null>(null);

  // FreshBooks exporta la lista de clientes en Excel (.xlsx), no CSV — en
  // vez de duplicar todo el backend para leer Excel, se convierte el
  // archivo a texto CSV aquí mismo en el navegador (con la librería xlsx)
  // y de ahí en adelante el flujo es idéntico al de un CSV normal: mismo
  // endpoint de preview, mismo parser, mismo mapeo de columnas.
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

      // Auto-match contra encabezados conocidos de FreshBooks — el
      // usuario puede corregir cualquiera de estos antes de importar.
      setColumnaNombre(indiceDeAlias(data.columnas, ALIAS_NOMBRE));
      setColumnaEmail(indiceDeAlias(data.columnas, ALIAS_EMAIL));
      setColumnaTelefono(indiceDeAlias(data.columnas, ALIAS_TELEFONO));
      setColumnaTaxId(indiceDeAlias(data.columnas, ALIAS_TAX_ID));
      setColumnasDireccion(indicesDeDireccion(data.columnas));

      setPaso("mapear");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  function alternarColumnaDireccion(i: number) {
    setColumnasDireccion((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)));
  }

  async function confirmarImportacion() {
    if (columnaNombre === "") {
      setError("Falta indicar cuál columna es el nombre del cliente.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/clientes/csv/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          csv: csvTexto,
          columnaNombre: Number(columnaNombre),
          columnaEmail: columnaEmail === "" ? null : Number(columnaEmail),
          columnaTelefono: columnaTelefono === "" ? null : Number(columnaTelefono),
          columnaTaxId: columnaTaxId === "" ? null : Number(columnaTaxId),
          columnasDireccion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo importar el archivo.");
      setResultado({ importados: data.importados, duplicados: data.duplicados, errores: data.errores });
      setPaso("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  function previsualizarDireccion(fila: string[]): string {
    const texto = columnasDireccion
      .map((i) => (fila[i] ?? "").trim())
      .filter(Boolean)
      .join(", ");
    return texto || "—";
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Importar clientes (CSV)</h1>
        <button onClick={() => router.push(destino)} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

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
              Exporta tu lista de clientes de FreshBooks (Excel o CSV, ambos funcionan) y súbela aquí. Si el archivo trae los
              encabezados típicos de FreshBooks (Display Name, Organization, Email, Phone Number, Street, City...), VICTOR
              adivina el mapeo solo — igual puedes corregirlo en el siguiente paso.
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
            <p className="mb-3 text-xs text-muted">{totalFilas} fila(s) de clientes encontradas. Confirma el mapeo de columnas:</p>

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

            <div className="mb-2">
              <label className="mb-1 block text-[11px] text-muted">Columna de nombre (requerido)</label>
              <select
                className="vc-input !py-1.5 !text-xs"
                value={columnaNombre}
                onChange={(e) => setColumnaNombre(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Elige…</option>
                {columnas.map((c, i) => (
                  <option key={i} value={i}>
                    [{i}] {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Columna de email (opcional)</label>
                <select
                  className="vc-input !py-1.5 !text-xs"
                  value={columnaEmail}
                  onChange={(e) => setColumnaEmail(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">(ninguna)</option>
                  {columnas.map((c, i) => (
                    <option key={i} value={i}>
                      [{i}] {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Columna de teléfono (opcional)</label>
                <select
                  className="vc-input !py-1.5 !text-xs"
                  value={columnaTelefono}
                  onChange={(e) => setColumnaTelefono(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">(ninguna)</option>
                  {columnas.map((c, i) => (
                    <option key={i} value={i}>
                      [{i}] {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-2">
              <label className="mb-1 block text-[11px] text-muted">Columna de RUC / Seguro Social (opcional)</label>
              <select
                className="vc-input !py-1.5 !text-xs"
                value={columnaTaxId}
                onChange={(e) => setColumnaTaxId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">(ninguna)</option>
                {columnas.map((c, i) => (
                  <option key={i} value={i}>
                    [{i}] {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-muted">
                Columnas de dirección (opcional — marca todas las que apliquen, se juntan en una sola dirección)
              </label>
              <div className="flex flex-wrap gap-2">
                {columnas.map((c, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px]"
                  >
                    <input type="checkbox" checked={columnasDireccion.includes(i)} onChange={() => alternarColumnaDireccion(i)} />
                    [{i}] {c}
                  </label>
                ))}
              </div>
            </div>

            {columnaNombre !== "" && (
              <div className="mb-3 rounded border border-border bg-bg p-2 text-[11px]">
                <p className="mb-1 font-medium text-muted">Vista previa con el mapeo actual:</p>
                {filasPreview.slice(0, 3).map((fila, i) => (
                  <p key={i}>
                    {fila[Number(columnaNombre)] || "(sin nombre)"}
                    {columnaEmail !== "" && fila[Number(columnaEmail)] ? ` · ${fila[Number(columnaEmail)]}` : ""}
                    {columnaTelefono !== "" && fila[Number(columnaTelefono)] ? ` · ${fila[Number(columnaTelefono)]}` : ""}
                    {columnasDireccion.length > 0 ? ` · ${previsualizarDireccion(fila)}` : ""}
                  </p>
                ))}
              </div>
            )}

            {error && <p className="mb-2 text-xs text-red">{error}</p>}

            <div className="flex gap-2">
              <button className="vc-btn-primary" disabled={cargando} onClick={confirmarImportacion}>
                {cargando ? "Importando…" : `Importar ${totalFilas} cliente(s)`}
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
              {resultado.importados} cliente(s) nuevo(s) importado(s).
              {resultado.duplicados > 0 && ` ${resultado.duplicados} ya existían (omitidos).`}
              {resultado.errores > 0 && ` ${resultado.errores} fila(s) sin nombre, no se pudieron importar.`}
            </p>
            <button className="mt-3 vc-btn-primary" onClick={() => router.push(destino)}>
              {returnTo ? "Volver" : "Ver clientes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
