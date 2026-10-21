"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/csv";
import {
  adivinarColumnas,
  calcularDesdeMarcas,
  emparejarEmpleado,
  filaEncabezados,
  leerTotales,
  type FormatoFecha,
  type ReglaExtra,
} from "@/lib/nomina-horas";

// Importa horas desde el reporte de un reloj de ponche (CSV o Excel) y las
// pone en la Corrida. No guarda nada: solo rellena los campos de horas.

interface EmpMin {
  id: string;
  nombre: string;
  tipo_pago: "salario" | "hora";
}

export default function ImportarHoras({
  empleados,
  inicio,
  fin,
  onAplicar,
}: {
  empleados: EmpMin[];
  inicio: string;
  fin: string;
  onAplicar: (horas: Record<string, { regulares: number; extra: number }>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<string[][]>([]);
  const [archivo, setArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filaEnc, setFilaEnc] = useState(1);
  const [modo, setModo] = useState<"marcas" | "totales">("marcas");
  const [formato, setFormato] = useState<FormatoFecha>("MDY");
  const [regla, setRegla] = useState<ReglaExtra>("dia8");
  const [filtrar, setFiltrar] = useState(true);
  const [col, setCol] = useState({ nombre: -1, fecha: -1, hora: -1, tipo: -1, regulares: -1, extra: -1 });
  const [asignados, setAsignados] = useState<Record<string, string>>({});

  const encabezados = filas[filaEnc - 1] ?? [];
  const datos = useMemo(() => filas.slice(filaEnc), [filas, filaEnc]);

  async function leerArchivo(f: File) {
    setError(null);
    try {
      let texto: string;
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const libro = XLSX.read(await f.arrayBuffer(), { type: "array" });
        texto = XLSX.utils.sheet_to_csv(libro.Sheets[libro.SheetNames[0]]);
      } else {
        texto = await f.text();
      }
      const parsed = parseCsv(texto);
      if (parsed.length < 2) {
        setError("El archivo está vacío o no se pudo leer.");
        return;
      }
      const enc = filaEncabezados(parsed);
      const g = adivinarColumnas(parsed[enc] ?? []);
      setFilas(parsed);
      setArchivo(f.name);
      setFilaEnc(enc + 1);
      setCol(g);
      setModo(g.fecha < 0 && g.regulares >= 0 ? "totales" : "marcas");
      setAsignados({});
    } catch {
      setError("No se pudo leer el archivo. Prueba exportándolo como CSV.");
    }
  }

  const lectura = useMemo(() => {
    if (filas.length === 0 || col.nombre < 0) return null;
    const desde = filtrar ? inicio : "";
    const hasta = filtrar ? fin : "";
    if (modo === "marcas") {
      if (col.fecha < 0) return null;
      return calcularDesdeMarcas(datos, {
        colNombre: col.nombre,
        colFecha: col.fecha,
        colHora: col.hora,
        colTipo: col.tipo,
        formatoFecha: formato,
        reglaExtra: regla,
        desde,
        hasta,
      });
    }
    if (col.regulares < 0) return null;
    return leerTotales(datos, {
      colNombre: col.nombre,
      colRegulares: col.regulares,
      colExtra: col.extra,
      colFecha: col.fecha,
      formatoFecha: formato,
      desde,
      hasta,
    });
  }, [filas, datos, col, modo, formato, regla, filtrar, inicio, fin]);

  const asignacion = (clave: string, nombre: string) =>
    clave in asignados ? asignados[clave] : emparejarEmpleado(nombre, empleados);

  function aplicar() {
    if (!lectura) return;
    const out: Record<string, { regulares: number; extra: number }> = {};
    for (const r of lectura.empleados) {
      const id = asignacion(r.clave, r.nombre);
      if (!id) continue;
      const prev = out[id] ?? { regulares: 0, extra: 0 };
      out[id] = { regulares: prev.regulares + r.regulares, extra: prev.extra + r.extra };
    }
    if (Object.keys(out).length === 0) {
      setError("Ningún empleado del reporte está asignado a un empleado de VICTOR.");
      return;
    }
    onAplicar(out);
    setAbierto(false);
  }

  const opcionesCol = (permiteNinguna: boolean) => (
    <>
      {permiteNinguna && <option value={-1}>— ninguna —</option>}
      {!permiteNinguna && <option value={-1}>Elegir…</option>}
      {encabezados.map((h, i) => (
        <option key={i} value={i}>
          {h || `Columna ${i + 1}`}
        </option>
      ))}
    </>
  );
  const sel = (label: string, k: keyof typeof col, ninguna?: boolean) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select className="vc-input" value={col[k]} onChange={(e) => setCol({ ...col, [k]: Number(e.target.value) })}>
        {opcionesCol(!!ninguna)}
      </select>
    </label>
  );

  return (
    <div className="vc-card">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={abierto}>
        <span className="text-sm font-semibold text-blue">Importar horas del reloj de ponche {abierto ? "−" : "+"}</span>
        <span className="text-xs text-muted">CSV o Excel</span>
      </button>

      {abierto && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted">
            Sube el reporte que genera tu reloj (huella, tarjeta o app). VICTOR suma las horas por empleado y las pone en la corrida; tú las revisas antes de calcular.
          </p>
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="vc-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leerArchivo(f);
            }}
          />
          {error && <p className="text-xs text-red">{error}</p>}

          {filas.length > 0 && (
            <>
              <p className="text-xs text-muted">
                {archivo} · {filas.length} filas
              </p>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">¿Qué trae el reporte?</span>
                  <select className="vc-input" value={modo} onChange={(e) => setModo(e.target.value as "marcas" | "totales")}>
                    <option value="marcas">Marcas (fecha y hora de cada ponche)</option>
                    <option value="totales">Horas ya sumadas</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Fila de encabezados</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(filas.length, 30)}
                    className="vc-input"
                    value={filaEnc}
                    onChange={(e) => setFilaEnc(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                {sel("Columna del empleado", "nombre")}
                {modo === "marcas" ? (
                  <>
                    {sel("Columna de fecha (o fecha y hora)", "fecha")}
                    {sel("Columna de hora (si es aparte)", "hora", true)}
                    {sel("Entrada/Salida (si existe)", "tipo", true)}
                  </>
                ) : (
                  <>
                    {sel("Horas regulares / total", "regulares")}
                    {sel("Horas extra (si existe)", "extra", true)}
                    {sel("Fecha (si el reporte es por día)", "fecha", true)}
                  </>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Formato de fecha</span>
                  <select className="vc-input" value={formato} onChange={(e) => setFormato(e.target.value as FormatoFecha)}>
                    <option value="MDY">Mes/Día/Año</option>
                    <option value="DMY">Día/Mes/Año</option>
                    <option value="YMD">Año-Mes-Día</option>
                  </select>
                </label>
                {modo === "marcas" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Horas extra</span>
                    <select className="vc-input" value={regla} onChange={(e) => setRegla(e.target.value as ReglaExtra)}>
                      <option value="dia8">Más de 8 horas por día</option>
                      <option value="semana40">Más de 40 horas por semana</option>
                      <option value="ninguna">No separar (todas regulares)</option>
                    </select>
                    <span className="mt-0.5 block text-[11px] text-muted">Confirma la regla con tu contable.</span>
                  </label>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={filtrar} onChange={(e) => setFiltrar(e.target.checked)} />
                Solo contar ponches dentro del periodo de la corrida ({inicio} a {fin})
              </label>

              {lectura && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">
                    {lectura.filasLeidas} filas leídas
                    {lectura.fueraDePeriodo > 0 && ` · ${lectura.fueraDePeriodo} fuera del periodo`}
                    {lectura.filasIgnoradas > 0 && ` · ${lectura.filasIgnoradas} no se pudieron leer`}
                  </p>
                  {lectura.empleados.length === 0 && (
                    <p className="text-xs text-red">No se encontraron horas. Revisa las columnas, el formato de fecha y el periodo.</p>
                  )}
                  {lectura.empleados.map((r) => {
                    const id = asignacion(r.clave, r.nombre);
                    return (
                      <div key={r.clave} className="rounded-lg border border-border p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{r.nombre}</span>
                          <span>
                            {r.regulares} h regulares{r.extra > 0 ? ` · ${r.extra} h extra` : ""}
                            {r.dias > 0 ? ` · ${r.dias} ${r.dias === 1 ? "día" : "días"}` : ""}
                          </span>
                        </div>
                        <select
                          className="vc-input mt-1"
                          value={id}
                          onChange={(e) => setAsignados({ ...asignados, [r.clave]: e.target.value })}
                        >
                          <option value="">No importar</option>
                          {empleados.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nombre}
                            </option>
                          ))}
                        </select>
                        {!id && <p className="mt-1 text-[11px] text-amb">Sin empleado asignado: no se importará.</p>}
                        {r.avisos.slice(0, 5).map((a, i) => (
                          <p key={i} className="mt-1 text-[11px] text-amb">
                            {a}
                          </p>
                        ))}
                        {r.avisos.length > 5 && <p className="mt-1 text-[11px] text-amb">…y {r.avisos.length - 5} avisos más</p>}
                      </div>
                    );
                  })}
                  {lectura.empleados.length > 0 && (
                    <button type="button" className="vc-btn-primary" onClick={aplicar}>
                      Aplicar horas a la corrida
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
