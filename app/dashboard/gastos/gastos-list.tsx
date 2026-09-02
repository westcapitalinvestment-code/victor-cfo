"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

type Transaccion = {
  id: string;
  description_raw: string;
  amount: number;
  fecha: string;
  hacienda_category_id: number | null;
  plaid_account_id: string | null;
  manual_account_id: string | null;
  tipo_flujo?: "gasto" | "ingreso" | "transferencia";
  pending?: boolean;
};

type Categoria = { id: number; nombre: string };

type CambioTransaccion = { descripcionAnterior: string | null; montoAnterior: number | null; fecha: string };

// Combobox con búsqueda (2 sept 2026, pedido de Joel: con muchas categorías
// el <select> nativo se vuelve incómodo — el usuario escribe y ve la lista
// filtrarse, calcado del mismo patrón que ya se usa para elegir cliente en
// Nueva Factura). Vive a nivel de módulo (no adentro de GastosList) para
// que React no lo desmonte/remonte en cada render del padre — si estuviera
// anidado, cada vez que cambia "guardando" o "errorPorFila" se perdería el
// texto que el usuario ya había escrito en la búsqueda.
function CategoriaComboBox({
  categorias,
  disabled,
  onSeleccionar,
  onCerrar,
}: {
  categorias: Categoria[];
  disabled?: boolean;
  onSeleccionar: (id: number) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCerrar();
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = busqueda.trim()
    ? categorias.filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : categorias;

  return (
    <div className="relative mt-1" ref={ref}>
      <input
        autoFocus
        className="vc-input !py-1 !text-xs"
        placeholder="Buscar categoría..."
        disabled={disabled}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
        {filtradas.length === 0 && <p className="p-2 text-xs text-muted">Sin resultados.</p>}
        {filtradas.map((c) => (
          <button
            key={c.id}
            type="button"
            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-bg"
            onClick={() => onSeleccionar(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GastosList({
  transaccionesIniciales,
  categorias,
  nombrePorCuenta,
  cambioPorTransaccion,
}: {
  transaccionesIniciales: Transaccion[];
  categorias: Categoria[];
  // Mapa "plaid:<id>" | "manual:<id>" → "BPPR Visa ···4821", para
  // identificar de qué banco/tarjeta vino cada transacción cuando el
  // usuario tiene más de una cuenta conectada (Plaid o manual). Vacío/
  // ausente = no mostrar nada.
  nombrePorCuenta?: Record<string, string>;
  // Mapa transaction_id → última corrección que Plaid mandó sobre ella
  // (transaction_sync_log, migración 0022) — típicamente porque pasó de
  // pendiente/estimada a liquidada/real. Se muestra como una notita con
  // "antes decía..." para que el cambio quede visible en vez de silencioso.
  cambioPorTransaccion?: Record<string, CambioTransaccion>;
}) {
  const router = useRouter();
  const [transacciones, setTransacciones] = useState(transaccionesIniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  // Antes, si /api/transacciones/categorizar fallaba (ej. el guardarraíl de
  // dirección rechazando una categoría que no cuadra con tipo_flujo), esto
  // no hacía NADA visible — el dropdown simplemente "no pegaba" y el
  // usuario no tenía forma de saber por qué, solo que "cambio la
  // categoría y no se guarda". Ahora se guarda el mensaje de error por
  // fila y se muestra debajo del selector hasta el próximo intento.
  const [errorPorFila, setErrorPorFila] = useState<Record<string, string>>({});

  const nombreCategoria = (id: number | null) =>
    categorias.find((c) => c.id === id)?.nombre ?? "Sin categorizar";

  async function guardarCategoria(transactionId: string, haciendaCategoryId: number) {
    setGuardando(transactionId);
    setErrorPorFila((prev) => ({ ...prev, [transactionId]: "" }));
    const res = await fetch("/api/transacciones/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, haciendaCategoryId }),
    });
    setGuardando(null);
    if (res.ok) {
      setEditando(null);
      setTransacciones((prev) =>
        prev.map((t) => (t.id === transactionId ? { ...t, hacienda_category_id: haciendaCategoryId } : t))
      );
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setErrorPorFila((prev) => ({ ...prev, [transactionId]: body?.error ?? "No se pudo guardar la categoría." }));
      // Se queda en modo edición (no se llama setEditando(null)) para que
      // el usuario vea el error justo debajo del selector y pueda elegir
      // otra categoría sin tener que volver a tocar la fila.
    }
  }

  return (
    <ul className="flex flex-col gap-1">
      {transacciones.map((t) => (
        <li key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <p className="truncate">{t.description_raw}</p>
            {editando === t.id ? (
              <>
                <CategoriaComboBox
                  categorias={categorias}
                  disabled={guardando === t.id}
                  onSeleccionar={(id) => guardarCategoria(t.id, id)}
                  onCerrar={() => setEditando(null)}
                />
                {errorPorFila[t.id] && <p className="mt-1 text-xs text-amb">⚠ {errorPorFila[t.id]}</p>}
              </>
            ) : errorPorFila[t.id] ? (
              // Fuera de modo edición pero con un error pendiente (ej. el
              // onBlur del selector cerró la edición antes de que llegara
              // la respuesta del servidor) — se sigue mostrando el aviso y
              // se deja reintentar con un toque, en vez de perder el error.
              <button
                className="mt-0.5 text-left text-xs text-amb underline decoration-dotted"
                onClick={() => setEditando(t.id)}
              >
                {t.fecha} · {nombreCategoria(t.hacienda_category_id)} · ⚠ {errorPorFila[t.id]}
              </button>
            ) : (
              <button
                className="mt-0.5 text-xs text-muted underline decoration-dotted hover:text-teal"
                onClick={() => setEditando(t.id)}
              >
                {t.fecha} · {nombreCategoria(t.hacienda_category_id)}
                {t.tipo_flujo === "transferencia" ? " · Transferencia (no cuenta como gasto)" : ""}
                {(() => {
                  const clave = t.manual_account_id
                    ? `manual:${t.manual_account_id}`
                    : t.plaid_account_id
                      ? `plaid:${t.plaid_account_id}`
                      : null;
                  const nombreCuenta = clave ? nombrePorCuenta?.[clave] : null;
                  return nombreCuenta ? ` · ${nombreCuenta}` : "";
                })()}
              </button>
            )}
            {/* Pendiente: el banco todavía no liquida esto — descripción y
                monto son un estimado que Plaid puede corregir más adelante
                (sin avisar de otra forma que reemplazando esta misma fila). */}
            {t.pending && (
              <p className="mt-0.5 text-[11px] text-amb">⏳ Pendiente — el banco puede corregir esto cuando liquide</p>
            )}
            {/* Corregida: ya pasó lo de arriba — esta fila decía otra cosa
                antes y Plaid la actualizó. Se deja visible qué decía, para
                que nunca se sienta como que "desapareció" una transacción. */}
            {cambioPorTransaccion?.[t.id] && (
              <p className="mt-0.5 text-[11px] text-muted">
                🔄 El banco corregió esto — antes decía &quot;{cambioPorTransaccion[t.id].descripcionAnterior}&quot;
                {cambioPorTransaccion[t.id].montoAnterior !== null
                  ? ` por $${Math.abs(Number(cambioPorTransaccion[t.id].montoAnterior)).toFixed(2)}`
                  : ""}
              </p>
            )}
          </div>
          <span
            className={`ml-3 flex-shrink-0 ${
              t.tipo_flujo === "transferencia"
                ? "text-muted"
                : t.tipo_flujo === "ingreso"
                  ? "text-grn"
                  : t.tipo_flujo === "gasto"
                    ? "text-red"
                    : Number(t.amount) > 0
                      ? "text-red"
                      : "text-grn"
            }`}
          >
            <Sensitive>{formatMoney(Math.abs(Number(t.amount)))}</Sensitive>
          </span>
        </li>
      ))}
    </ul>
  );
}
