"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// App del técnico de campo (2 sept 2026, módulo Equipo) — pantalla completa
// standalone, pensada para abrirse en el celular del técnico desde el link
// que le comparte el dueño. Sin cuenta de Supabase: entra con PIN de 4
// dígitos (mismo teclado visual que app/dashboard/pin-gate.tsx, para que se
// sienta consistente con el resto de VICTOR CFO) y de ahí registra visitas
// contra /api/tecnico/*.

type CatalogoItem = { id: string; nombre: string; descripcion: string | null; precio: number };
type Sesion = { tecnico: { id: string; name: string }; catalogo: CatalogoItem[]; approvalMode: string; maxDescuentoPct: number };
type ItemVisita = { key: string; descripcion: string; cantidad: number; precioUnitario: number; catalogItemId: string | null };

const METODOS_COBRO = ["ATH Móvil", "Cheque", "Transferencia", "Efectivo", "Stripe"];
const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const MAX_INTENTOS = 5;

export default function TecnicoApp({ token }: { token: string }) {
  const [fase, setFase] = useState<"cargando" | "sin_token" | "pin" | "app">("cargando");
  const [sesion, setSesion] = useState<Sesion | null>(null);

  // ---- Login por PIN ----
  const [digitos, setDigitos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const intentosFallidos = useRef(0);

  useEffect(() => {
    fetch("/api/tecnico/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok) {
          setSesion(data);
          setFase("app");
        } else {
          setFase(token ? "pin" : "sin_token");
        }
      })
      .catch(() => setFase(token ? "pin" : "sin_token"));
  }, [token]);

  async function intentarEntrar(pinCompleto: string) {
    setVerificando(true);
    setError(null);
    try {
      const res = await fetch("/api/tecnico/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin: pinCompleto }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSesion(data);
        setFase("app");
        intentosFallidos.current = 0;
      } else {
        intentosFallidos.current += 1;
        setDigitos("");
        if (intentosFallidos.current >= MAX_INTENTOS) {
          setBloqueado(true);
          setError("Demasiados intentos. Pide al dueño del negocio que revise tu link o PIN.");
        } else {
          setError(data?.error ?? `PIN incorrecto (intento ${intentosFallidos.current} de ${MAX_INTENTOS}).`);
        }
      }
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
      setDigitos("");
    } finally {
      setVerificando(false);
    }
  }

  function tocarDigito(d: string) {
    if (verificando || bloqueado) return;
    const nuevo = (digitos + d).slice(0, 4);
    setDigitos(nuevo);
    if (nuevo.length === 4) intentarEntrar(nuevo);
  }

  async function salir() {
    await fetch("/api/tecnico/logout", { method: "POST" }).catch(() => {});
    setSesion(null);
    setDigitos("");
    setFase(token ? "pin" : "sin_token");
  }

  if (fase === "cargando") return <div className="min-h-screen bg-bg" />;

  if (fase === "sin_token") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <p className="mb-1 text-sm font-medium">Link no válido</p>
        <p className="max-w-xs text-xs text-muted">
          Pide al dueño del negocio que te comparta tu link personal de VICTOR CFO.
        </p>
      </div>
    );
  }

  if (fase === "pin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
        <p className="mb-1 text-sm text-muted">VICTOR CFO — Equipo</p>
        <p className="mb-6 text-lg font-medium">Escribe tu PIN</p>

        <div className="mb-6 flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-3.5 w-3.5 rounded-full border border-teal ${i < digitos.length ? "bg-teal" : ""}`} />
          ))}
        </div>

        {error && <p className="mb-4 max-w-xs text-center text-xs text-red">{error}</p>}

        {!bloqueado && (
          <div className="grid grid-cols-3 gap-4">
            {TECLAS.map((n, i) =>
              n === "" ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => (n === "⌫" ? setDigitos((d) => d.slice(0, -1)) : tocarDigito(n))}
                  disabled={verificando}
                  className="h-14 w-14 rounded-full border border-border text-lg font-medium text-text active:bg-card"
                >
                  {n}
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  if (fase === "app" && sesion) {
    return <VisitaApp sesion={sesion} onSalir={salir} />;
  }

  return null;
}

function VisitaApp({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const [clientNombre, setClientNombre] = useState("");
  const [items, setItems] = useState<ItemVisita[]>([]);
  const [metodoCobro, setMetodoCobro] = useState(METODOS_COBRO[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ estado: string; total: number } | null>(null);

  // ---- Fila para añadir un ítem ----
  const [catalogItemId, setCatalogItemId] = useState("__libre__");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("");

  function alEscogerCatalogo(id: string) {
    setCatalogItemId(id);
    if (id === "__libre__") {
      setDescripcion("");
      setPrecioUnitario("");
      return;
    }
    const item = sesion.catalogo.find((c) => c.id === id);
    if (item) {
      setDescripcion(item.nombre);
      setPrecioUnitario(String(item.precio));
    }
  }

  function anadirItem() {
    if (!descripcion.trim() || Number(precioUnitario) < 0) return;
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        descripcion: descripcion.trim(),
        cantidad: Number(cantidad) > 0 ? Number(cantidad) : 1,
        precioUnitario: Number(precioUnitario) || 0,
        catalogItemId: catalogItemId === "__libre__" ? null : catalogItemId,
      },
    ]);
    setCatalogItemId("__libre__");
    setDescripcion("");
    setCantidad("1");
    setPrecioUnitario("");
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  const total = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);

  async function enviar(cobrado: boolean) {
    if (items.length === 0) {
      setError("Añade al menos un ítem antes de guardar.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/tecnico/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientNombre,
          items: items.map(({ descripcion, cantidad, precioUnitario, catalogItemId }) => ({
            descripcion,
            cantidad,
            precioUnitario,
            catalogItemId,
          })),
          metodoCobro: cobrado ? metodoCobro : null,
          cobrado,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "No se pudo guardar la visita.");
      setResultado({ estado: data.estado, total: data.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setEnviando(false);
    }
  }

  function nuevaVisita() {
    setResultado(null);
    setClientNombre("");
    setItems([]);
    setError(null);
  }

  if (resultado) {
    const ESTADO_LABEL: Record<string, string> = {
      requiere_aprobacion: "Enviada — pendiente de aprobación del dueño.",
      pendiente_cobro: "Guardada — todavía pendiente de cobro.",
      cobrado: "Guardada y marcada como cobrada.",
    };
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <i className="ti ti-circle-check mb-2 text-3xl text-teal" />
        <p className="mb-1 text-sm font-medium">Visita guardada</p>
        <p className="mb-1 text-lg font-medium">{formatMoney(resultado.total)}</p>
        <p className="mb-6 max-w-xs text-xs text-muted">{ESTADO_LABEL[resultado.estado] ?? resultado.estado}</p>
        <button className="vc-btn-primary" style={{ width: "auto" }} onClick={nuevaVisita}>
          Registrar otra visita
        </button>
      </div>
    );
  }

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <div>
          <p className="text-xs text-muted">VICTOR CFO — Equipo</p>
          <p className="text-lg font-medium">Hola, {sesion.tecnico.name}</p>
        </div>
        <button onClick={onSalir} className="text-xs text-muted hover:opacity-80">
          Salir
        </button>
      </div>

      {sesion.approvalMode === "manual" && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Cada visita que registres se envía primero al dueño para aprobación antes de contarse como cobrada.
        </div>
      )}

      <div className="vc-card mb-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Cliente</p>
        <input
          className="vc-input"
          placeholder="Nombre del cliente"
          value={clientNombre}
          onChange={(e) => setClientNombre(e.target.value)}
        />
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Añadir ítem</p>
        {sesion.catalogo.length > 0 && (
          <select className="vc-input mb-2" value={catalogItemId} onChange={(e) => alEscogerCatalogo(e.target.value)}>
            <option value="__libre__">Personalizado (escribe abajo)</option>
            {sesion.catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — {formatMoney(c.precio)}
              </option>
            ))}
          </select>
        )}
        <input
          className="vc-input mb-2"
          placeholder="Descripción"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <div className="mb-2 flex gap-2">
          <input
            className="vc-input"
            style={{ width: 90 }}
            type="number"
            min="1"
            placeholder="Cant."
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input
              className="vc-input w-full"
              style={{ paddingLeft: 18 }}
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio"
              value={precioUnitario}
              onChange={(e) => setPrecioUnitario(e.target.value)}
            />
          </div>
        </div>
        <button
          className="flex items-center justify-center gap-1 rounded-lg border border-teal py-2 text-xs font-medium text-teal"
          onClick={anadirItem}
        >
          <i className="ti ti-plus" /> Añadir ítem
        </button>
      </div>

      {items.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Ítems de esta visita</p>
          {items.map((it) => (
            <div key={it.key} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{it.descripcion}</p>
                <p className="text-xs text-muted">
                  {it.cantidad} × {formatMoney(it.precioUnitario)}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <p className="font-medium">{formatMoney(it.cantidad * it.precioUnitario)}</p>
                <button onClick={() => quitarItem(it.key)} className="text-muted hover:text-red">
                  <i className="ti ti-x" style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-sm font-medium">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
      )}

      {sesion.approvalMode !== "manual" && (
        <div className="vc-card mb-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Método de cobro</p>
          <select className="vc-input" value={metodoCobro} onChange={(e) => setMetodoCobro(e.target.value)}>
            {METODOS_COBRO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {sesion.approvalMode === "manual" ? (
        <button className="vc-btn-primary" disabled={enviando || items.length === 0} onClick={() => enviar(false)}>
          {enviando ? "Enviando..." : "Enviar para aprobación"}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg border border-teal py-2.5 text-sm font-medium text-teal"
            disabled={enviando || items.length === 0}
            onClick={() => enviar(false)}
          >
            Guardar sin cobrar
          </button>
          <button className="vc-btn-primary flex-1" style={{ width: "auto" }} disabled={enviando || items.length === 0} onClick={() => enviar(true)}>
            {enviando ? "Guardando..." : "Marcar cobrado"}
          </button>
        </div>
      )}
    </div>
  );
}
