"use client";

import { useCallback, useEffect, useState } from "react";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import SubirEstado from "./subir-csv";

type CuentaManual = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  current_balance: number;
  es_negocio: boolean;
  balance_actualizado_en: string | null;
};

function esPasivo(type: string): boolean {
  return type === "credit" || type === "loan";
}

const TIPOS = [
  { value: "depository", label: "Cuenta de banco (checking/savings)" },
  { value: "credit", label: "Tarjeta de crédito" },
  { value: "loan", label: "Préstamo" },
  { value: "investment", label: "Inversión" },
];

// Cuentas manuales — bancos/tarjetas que Plaid no soporta (ej. Apple Card,
// que no tiene integración con Plaid porque Goldman Sachs no la expone) o
// que el usuario prefiere llevar a mano. Vive como su propia sección,
// separada de las cuentas de Plaid, porque el balance no se sincroniza
// solo — el usuario lo actualiza, y las transacciones (si las hay) se
// suben por CSV en vez de llegar automáticas.
export default function CuentasManuales() {
  const [cuentas, setCuentas] = useState<CuentaManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("depository");
  const [balanceInicial, setBalanceInicial] = useState("");

  const [editandoBalanceId, setEditandoBalanceId] = useState<string | null>(null);
  const [nuevoBalance, setNuevoBalance] = useState("");
  const [subiendoCsvId, setSubiendoCsvId] = useState<string | null>(null);

  // Editar cuenta completa (nombre + tipo + balance) — separado del click
  // rápido sobre el balance de arriba, que sigue existiendo para el caso
  // más común (solo actualizar el número cada mes). Este botón es para
  // cuando también hace falta corregir el nombre o el tipo.
  const [editandoCuentaId, setEditandoCuentaId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [tipoEditado, setTipoEditado] = useState("depository");
  const [balanceEditado, setBalanceEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cuentas-manuales");
      const data = await res.json();
      if (res.ok) setCuentas(data.cuentas ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearCuenta() {
    if (!nombre.trim()) {
      setError("Falta el nombre de la cuenta.");
      return;
    }
    const balance = Number(balanceInicial || 0);
    if (!Number.isFinite(balance)) {
      setError("El balance inicial no es válido.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/cuentas-manuales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, tipo, balanceInicial: balance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo crear la cuenta.");
      setNombre("");
      setBalanceInicial("");
      setTipo("depository");
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarBalance(id: string) {
    const balance = Number(nuevoBalance);
    if (!Number.isFinite(balance)) {
      setError("El balance no es válido.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-manuales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo actualizar el balance.");
      setEditandoBalanceId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el balance.");
    }
  }

  function abrirEdicion(c: CuentaManual) {
    setEditandoCuentaId(c.id);
    setNombreEditado(c.name);
    setTipoEditado(c.type);
    setBalanceEditado(String(c.current_balance));
    setError(null);
  }

  async function guardarEdicion(id: string) {
    if (!nombreEditado.trim()) {
      setError("Falta el nombre de la cuenta.");
      return;
    }
    const balance = Number(balanceEditado);
    if (!Number.isFinite(balance)) {
      setError("El balance no es válido.");
      return;
    }
    setGuardandoEdicion(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-manuales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreEditado.trim(), tipo: tipoEditado, balance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo actualizar la cuenta.");
      setEditandoCuentaId(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la cuenta.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function eliminarCuenta(id: string, nombreCuenta: string) {
    const ok = window.confirm(
      `¿Eliminar "${nombreCuenta}"? También se borran las transacciones que hayas importado a esta cuenta. Esto no se puede deshacer.`
    );
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/cuentas-manuales/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar la cuenta.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la cuenta.");
    }
  }

  if (loading) return null;

  return (
    <div className="vc-card mb-3 !p-0">
      <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted">
        Cuentas manuales (sin Plaid — ej. Apple Card)
      </p>

      {error && <p className="px-4 pt-2 text-xs text-red">{error}</p>}

      {cuentas.map((c) => (
        <div key={c.id} className="border-b border-border px-4 py-3 last:border-b-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text">{c.name}</p>
              <p className="text-xs capitalize text-muted">
                {c.subtype || TIPOS.find((t) => t.value === c.type)?.label}
                {c.mask && ` ••${c.mask}`}
              </p>
            </div>
            {editandoBalanceId === c.id ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  className="vc-input !w-24 !py-1 !text-xs"
                  defaultValue={c.current_balance}
                  onChange={(e) => setNuevoBalance(e.target.value)}
                />
                <button className="text-xs text-teal" onClick={() => guardarBalance(c.id)}>
                  ✓
                </button>
                <button className="text-xs text-muted" onClick={() => setEditandoBalanceId(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <button
                className={`text-sm font-medium underline decoration-dotted ${esPasivo(c.type) ? "!text-red" : ""}`}
                onClick={() => {
                  setEditandoBalanceId(c.id);
                  setNuevoBalance(String(c.current_balance));
                }}
              >
                <Sensitive>
                  {esPasivo(c.type) ? "-" : ""}
                  {formatMoney(Number(c.current_balance || 0))}
                </Sensitive>
              </button>
            )}
          </div>

          <button
            className="mt-1 text-[11px] text-teal hover:opacity-80"
            onClick={() => setSubiendoCsvId(subiendoCsvId === c.id ? null : c.id)}
          >
            {subiendoCsvId === c.id ? "Ocultar" : "Subir estado de cuenta"}
          </button>
          <button
            className="ml-3 mt-1 text-[11px] text-muted hover:opacity-80"
            onClick={() => (editandoCuentaId === c.id ? setEditandoCuentaId(null) : abrirEdicion(c))}
          >
            {editandoCuentaId === c.id ? "Cancelar" : "Editar"}
          </button>
          <button
            className="ml-3 mt-1 text-[11px] text-red hover:opacity-80"
            onClick={() => eliminarCuenta(c.id, c.name)}
          >
            Eliminar
          </button>

          {editandoCuentaId === c.id && (
            <div className="mt-2 rounded-lg border border-border p-3">
              <div className="mb-2">
                <label className="mb-1 block text-[11px] text-muted">Nombre</label>
                <input
                  className="vc-input !py-1.5 !text-xs"
                  value={nombreEditado}
                  onChange={(e) => setNombreEditado(e.target.value)}
                />
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Tipo</label>
                  <select className="vc-input !py-1.5 !text-xs" value={tipoEditado} onChange={(e) => setTipoEditado(e.target.value)}>
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">
                    Balance {esPasivo(tipoEditado) ? "que debes" : "actual"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="vc-input !py-1.5 !text-xs"
                    value={balanceEditado}
                    onChange={(e) => setBalanceEditado(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="vc-btn-primary" disabled={guardandoEdicion} onClick={() => guardarEdicion(c.id)}>
                  {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
                </button>
                <button className="text-xs text-muted underline" onClick={() => setEditandoCuentaId(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {subiendoCsvId === c.id && (
            <SubirEstado
              origen="manual"
              cuentaId={c.id}
              onCerrar={() => {
                setSubiendoCsvId(null);
                cargar();
              }}
            />
          )}
        </div>
      ))}

      {mostrarForm ? (
        <div className="px-4 py-3">
          <div className="mb-2">
            <label className="mb-1 block text-[11px] text-muted">Nombre</label>
            <input
              className="vc-input !py-1.5 !text-xs"
              placeholder="ej. Apple Card"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted">Tipo</label>
              <select className="vc-input !py-1.5 !text-xs" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">
                Balance {esPasivo(tipo) ? "que debes" : "actual"}
              </label>
              <input
                type="number"
                step="0.01"
                className="vc-input !py-1.5 !text-xs"
                placeholder="0.00"
                value={balanceInicial}
                onChange={(e) => setBalanceInicial(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="vc-btn-primary" disabled={guardando} onClick={crearCuenta}>
              {guardando ? "Guardando…" : "Guardar cuenta"}
            </button>
            <button className="text-xs text-muted underline" onClick={() => setMostrarForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="w-full px-4 py-3 text-left text-xs text-muted hover:opacity-80"
          onClick={() => setMostrarForm(true)}
        >
          + Añadir cuenta manual
        </button>
      )}
    </div>
  );
}
