"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { direccionCategoriaValida } from "@/lib/direccion-categoria";

// Formulario para añadir / editar una transacción escrita a mano (efectivo,
// propinas, un gasto que no salió en el banco). Mismo componente para las dos
// cosas: sin `inicial` crea; con `inicial` edita (la cuenta no se cambia).
// Habla con /api/transacciones/manual.
export type CuentaManualOpcion = { id: string; nombre: string; tipo: string };
export type CategoriaOpcion = { id: number; nombre: string };

export type InicialTransaccion = {
  id: string;
  tipo: "gasto" | "ingreso";
  monto: number;
  fecha: string;
  descripcion: string;
  categoriaId: number | null;
};

export default function TransaccionForm({
  hoy,
  cuentas,
  categorias,
  inicial,
  onListo,
  onCancelar,
}: {
  hoy: string;
  cuentas: CuentaManualOpcion[];
  categorias: CategoriaOpcion[];
  inicial?: InicialTransaccion;
  onListo: (valores: Omit<InicialTransaccion, "id">) => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const editando = !!inicial;
  const [tipo, setTipo] = useState<"gasto" | "ingreso">(inicial?.tipo ?? "gasto");
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy);
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ? String(inicial.categoriaId) : "");
  const [cuentaId, setCuentaId] = useState("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Efectivo" siempre está disponible (se crea sola la primera vez). Si ya
  // existe como cuenta, no se repite en la lista.
  const yaHayEfectivo = cuentas.some((c) => c.nombre.trim().toLowerCase() === "efectivo");
  const opcionesCuenta: CuentaManualOpcion[] = [
    ...(yaHayEfectivo ? [] : [{ id: "efectivo", nombre: "Efectivo", tipo: "depository" }]),
    ...cuentas,
  ];
  const cuentaElegida = opcionesCuenta.find((c) => c.id === cuentaId) ?? opcionesCuenta[0];
  const ingresoNoPermitido = !editando && tipo === "ingreso" && cuentaElegida?.tipo !== "depository";

  const categoriasDelLado = categorias.filter((c) => direccionCategoriaValida(c.nombre, tipo));

  async function guardar() {
    setError(null);
    const m = Number(monto.replace(",", "."));
    if (!(m > 0)) return setError("Escribe un monto mayor que 0.");
    if (!descripcion.trim()) return setError("Escribe una descripción (ej. Almuerzo, Propina).");
    if (ingresoNoPermitido) return setError("Un ingreso va en una cuenta de dinero (Efectivo, cheques, ahorros), no en una tarjeta.");
    setGuardando(true);
    const res = await fetch("/api/transacciones/manual", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: inicial?.id,
        tipo,
        monto: m,
        fecha,
        descripcion: descripcion.trim(),
        categoriaId: categoriaId ? Number(categoriaId) : null,
        cuentaId: editando ? undefined : cuentaElegida?.id ?? "efectivo",
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      return setError(b?.error ?? "No se pudo guardar.");
    }
    router.refresh();
    onListo({ tipo, monto: m, fecha, descripcion: descripcion.trim(), categoriaId: categoriaId ? Number(categoriaId) : null });
  }

  return (
    <div className="vc-card mb-3 flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{editando ? "Editar transacción" : "Añadir transacción a mano"}</p>

      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg p-1">
        <button
          type="button"
          onClick={() => setTipo("gasto")}
          className={`rounded-md py-1.5 text-sm font-medium ${tipo === "gasto" ? "bg-red text-white" : "text-muted"}`}
        >
          Gasto
        </button>
        <button
          type="button"
          onClick={() => setTipo("ingreso")}
          className={`rounded-md py-1.5 text-sm font-medium ${tipo === "ingreso" ? "bg-grn text-white" : "text-muted"}`}
        >
          Ingreso
        </button>
      </div>

      <div className="flex gap-2">
        <input className="vc-input" inputMode="decimal" placeholder="Monto $" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <input className="vc-input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
      </div>

      <input
        className="vc-input"
        placeholder={tipo === "gasto" ? "Descripción (ej. Almuerzo, Gasolina)" : "Descripción (ej. Propina, Venta en efectivo)"}
        value={descripcion}
        maxLength={120}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <select className="vc-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
        <option value="">Sin categoría (la puedes elegir después)</option>
        {categoriasDelLado.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      {!editando && (
        <select className="vc-input" value={cuentaElegida?.id ?? "efectivo"} onChange={(e) => setCuentaId(e.target.value)}>
          {opcionesCuenta.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}

      {error && <p className="text-xs text-red">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="vc-btn-primary" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Añadir"}
        </button>
        <button type="button" className="rounded-lg border border-border px-4 text-sm text-muted" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
