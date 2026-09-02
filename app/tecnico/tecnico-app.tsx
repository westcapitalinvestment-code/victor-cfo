"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// App del técnico de campo (v2, 2 sept 2026 — reescrita sobre el mockup
// real de Joel: "Modo Equipo"). El técnico entra con PIN (mismo teclado
// visual que app/dashboard/pin-gate.tsx) y desde ahí completa TAREAS
// asignadas por el dueño o arranca una FACTURA REAL desde cero — nunca un
// registro aparte: lo que hace aquí es lo mismo que ve Facturación.

type Permisos = { vePrecios: boolean; cobraVencidas: boolean; anadeClientes: boolean; aplicaDescuento: boolean; descuentoMaxPct: number };
type CatalogoItem = { id: string; nombre: string; precio: number; ivu_exento: boolean };
type Tarea = { id: string; numero: string; total: number; fechaEmision: string; clienteNombre: string | null };
// Cotización aprobada que el dueño le asignó (Equipo v2, 2 sept 2026) —
// misma forma que Tarea, pero todavía no es una factura: el técnico la
// convierte él mismo con un tap cuando llega al trabajo.
type CotizacionAsignada = { id: string; numero: string; total: number; fechaEmision: string; clienteNombre: string | null };
type Sesion = {
  tecnico: { id: string; name: string };
  entidad: { name: string };
  permisos: Permisos;
  approvalMode: "auto" | "manual";
  catalogo: CatalogoItem[];
  tareas: Tarea[];
  cotizaciones: CotizacionAsignada[];
};
type ClienteLite = { id: string; name: string; phone: string | null };
type ItemFactura = { id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal_linea: number };
type FacturaDetalle = {
  id: string;
  numero: string;
  total: number;
  subtotal: number;
  ivu_monto: number;
  descuento_pct: number;
  descuento_monto: number;
  estado: string;
  pendiente_revision_tecnico: boolean;
  client_id: string;
  clients: { name: string; phone: string | null } | null;
};

const METODOS_COBRO = ["ATH Móvil", "Cheque", "Transferencia", "Efectivo", "Stripe"];
const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const MAX_INTENTOS = 5;

export default function TecnicoApp({ token }: { token: string }) {
  const [fase, setFase] = useState<"cargando" | "sin_token" | "pin" | "app">("cargando");
  const [sesion, setSesion] = useState<Sesion | null>(null);

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

  async function recargarSesion() {
    const r = await fetch("/api/tecnico/me");
    if (r.ok) setSesion(await r.json());
  }

  if (fase === "cargando") return <div className="min-h-screen bg-bg" />;

  if (fase === "sin_token") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <p className="mb-1 text-sm font-medium">Link no válido</p>
        <p className="max-w-xs text-xs text-muted">Pide al dueño del negocio que te comparta tu link personal de VICTOR CFO.</p>
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
    return <AppTecnico sesion={sesion} onSalir={salir} onRecargar={recargarSesion} />;
  }
  return null;
}

// ============================================================================
// Shell con las 2 vistas principales: home (tareas + accesos rápidos) y
// factura (crear/completar una).
// ============================================================================
function AppTecnico({ sesion, onSalir, onRecargar }: { sesion: Sesion; onSalir: () => void; onRecargar: () => void }) {
  const [vista, setVista] = useState<"home" | "cliente_nueva" | "cliente_cobrar" | "factura" | "cliente_cotizar" | "cotizacion">("home");
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [cotizacionId, setCotizacionId] = useState<string | null>(null);
  const [convirtiendoId, setConvirtiendoId] = useState<string | null>(null);
  const [errorConvertir, setErrorConvertir] = useState<string | null>(null);

  function abrirFactura(id: string) {
    setFacturaId(id);
    setVista("factura");
  }

  function abrirCotizacion(id: string) {
    setCotizacionId(id);
    setVista("cotizacion");
  }

  async function crearFacturaParaCliente(clientId: string) {
    const res = await fetch("/api/tecnico/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, items: [] }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      abrirFactura(data.id);
    }
  }

  // Cotización nueva desde cero (2 sept 2026, pedido de Joel) — mismo patrón
  // que crearFacturaParaCliente, pero cae en PantallaCotizacion en vez de
  // PantallaFactura porque nunca sale directo al cliente sin que el dueño
  // la vea primero.
  async function crearCotizacionParaCliente(clientId: string) {
    const res = await fetch("/api/tecnico/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, items: [] }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      abrirCotizacion(data.id);
    }
  }

  // Convertir una cotización aprobada y asignada en la factura real que el
  // técnico va a completar — cae en la misma pantalla de factura de
  // siempre (evidencia, ítems, firma, finalizar).
  async function convertirCotizacion(cotizacionId: string) {
    setConvirtiendoId(cotizacionId);
    setErrorConvertir(null);
    const res = await fetch(`/api/tecnico/cotizaciones/${cotizacionId}/convertir`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setConvirtiendoId(null);
    if (!res.ok || !data?.ok) {
      setErrorConvertir(data?.error ?? "No se pudo convertir la cotización.");
      return;
    }
    abrirFactura(data.invoiceId);
  }

  if (vista === "cliente_nueva") {
    return (
      <SelectorCliente
        titulo="¿Para qué cliente es el trabajo?"
        permiteCrear={sesion.permisos.anadeClientes}
        onCancelar={() => setVista("home")}
        onSeleccionar={crearFacturaParaCliente}
      />
    );
  }

  if (vista === "cliente_cobrar") {
    return (
      <SelectorClienteParaCobrar
        onCancelar={() => setVista("home")}
        onCobrado={() => {
          setVista("home");
          onRecargar();
        }}
      />
    );
  }

  if (vista === "cliente_cotizar") {
    return (
      <SelectorCliente
        titulo="¿Para qué cliente es la cotización?"
        permiteCrear={sesion.permisos.anadeClientes}
        onCancelar={() => setVista("home")}
        onSeleccionar={crearCotizacionParaCliente}
      />
    );
  }

  if (vista === "factura" && facturaId) {
    return (
      <PantallaFactura
        facturaId={facturaId}
        sesion={sesion}
        onVolver={() => {
          setVista("home");
          onRecargar();
        }}
      />
    );
  }

  if (vista === "cotizacion" && cotizacionId) {
    return (
      <PantallaCotizacion
        cotizacionId={cotizacionId}
        sesion={sesion}
        onVolver={() => {
          setVista("home");
          onRecargar();
        }}
      />
    );
  }

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <div>
          <p className="text-xs text-muted">{sesion.entidad.name} — Equipo</p>
          <p className="text-lg font-medium">Hola, {sesion.tecnico.name}</p>
        </div>
        <button onClick={onSalir} className="text-xs text-muted hover:opacity-80">
          Salir
        </button>
      </div>

      {sesion.approvalMode === "manual" && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Cada factura que completes se envía primero al dueño para aprobación antes de salir al cliente.
        </div>
      )}

      <div className="mb-2 flex gap-2">
        <button className="vc-btn-primary flex-1" onClick={() => setVista("cliente_nueva")}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} /> Nueva factura
        </button>
        {sesion.permisos.cobraVencidas && (
          <button
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-teal py-2.5 text-sm font-medium text-teal"
            onClick={() => setVista("cliente_cobrar")}
          >
            <i className="ti ti-cash" /> Cobrar
          </button>
        )}
      </div>
      {/* Cotizar algo nuevo (2 sept 2026, pedido de Joel) — separado del
          botón de factura porque el resultado es distinto: esto NUNCA sale
          directo, siempre pasa primero por tu aprobación. */}
      <div className="mb-3">
        <button
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted"
          onClick={() => setVista("cliente_cotizar")}
        >
          <i className="ti ti-file-description" /> Cotizar algo nuevo
        </button>
      </div>

      {errorConvertir && <p className="mb-3 text-xs text-red">{errorConvertir}</p>}

      {sesion.cotizaciones.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Cotizaciones aprobadas <span className="normal-case text-muted">· {sesion.cotizaciones.length}</span>
          </p>
          <p className="mb-2 text-xs text-muted">Ya tienen visto bueno del cliente — conviértela cuando llegues a hacer el trabajo.</p>
          {sesion.cotizaciones.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{c.clienteNombre || "Sin cliente"}</p>
                <p className="text-xs text-muted">
                  {c.numero} · {formatMoney(c.total)}
                </p>
              </div>
              <button
                className="flex-shrink-0 rounded-lg border border-teal px-2.5 py-1.5 text-xs font-medium text-teal disabled:opacity-50"
                disabled={convirtiendoId === c.id}
                onClick={() => convertirCotizacion(c.id)}
              >
                {convirtiendoId === c.id ? "..." : "Empezar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Tus tareas asignadas <span className="normal-case text-muted">· {sesion.tareas.length}</span>
        </p>
        {sesion.tareas.length === 0 && (
          <p className="text-xs text-muted">No tienes tareas asignadas. Puedes crear una factura nueva si llegaste a un trabajo.</p>
        )}
        {sesion.tareas.map((t) => (
          <button
            key={t.id}
            onClick={() => abrirFactura(t.id)}
            className="flex w-full items-center justify-between border-b border-border py-2.5 text-left text-sm last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate">{t.clienteNombre || "Sin cliente"}</p>
              <p className="text-xs text-muted">{t.numero}</p>
            </div>
            <p className="flex-shrink-0 font-medium">{formatMoney(t.total)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Buscar/crear cliente — usado al arrancar una factura desde cero.
// ============================================================================
function SelectorCliente({
  titulo,
  permiteCrear,
  onCancelar,
  onSeleccionar,
}: {
  titulo: string;
  permiteCrear: boolean;
  onCancelar: () => void;
  onSeleccionar: (clientId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteLite[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telNuevo, setTelNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscando(true);
      fetch(`/api/tecnico/clientes?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResultados(d?.clientes ?? []))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function crear() {
    if (!nombreNuevo.trim()) return;
    setError(null);
    const res = await fetch("/api/tecnico/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombreNuevo, phone: telNuevo }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo crear el cliente.");
      return;
    }
    onSeleccionar(data.cliente.id);
  }

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <p className="text-lg font-medium">{titulo}</p>
        <button onClick={onCancelar} className="text-xs text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      {!creando ? (
        <>
          <input className="vc-input mb-3" placeholder="Buscar cliente por nombre..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="vc-card mb-3">
            {buscando && <p className="text-xs text-muted">Buscando...</p>}
            {!buscando && resultados.length === 0 && <p className="text-xs text-muted">Sin resultados.</p>}
            {resultados.map((c) => (
              <button
                key={c.id}
                onClick={() => onSeleccionar(c.id)}
                className="flex w-full items-center justify-between border-b border-border py-2.5 text-left text-sm last:border-0"
              >
                <span>{c.name}</span>
                {c.phone && <span className="text-xs text-muted">{c.phone}</span>}
              </button>
            ))}
          </div>
          {permiteCrear && (
            <button className="text-xs font-medium text-teal hover:opacity-80" onClick={() => setCreando(true)}>
              <i className="ti ti-plus" style={{ marginRight: 4 }} /> Cliente nuevo
            </button>
          )}
        </>
      ) : (
        <div className="vc-card flex flex-col gap-2.5">
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre del cliente" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} autoFocus />
          <input className="vc-input" placeholder="Teléfono (opcional)" value={telNuevo} onChange={(e) => setTelNuevo(e.target.value)} />
          <div className="flex gap-2">
            <button className="vc-btn-primary flex-1" disabled={!nombreNuevo.trim()} onClick={crear}>
              Crear y continuar
            </button>
            <button className="px-3 text-xs text-muted hover:opacity-80" onClick={() => setCreando(false)}>
              Atrás
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cobrar una factura YA existente y vencida del cliente, en campo.
// ============================================================================
function SelectorClienteParaCobrar({ onCancelar, onCobrado }: { onCancelar: () => void; onCobrado: () => void }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [facturas, setFacturas] = useState<{ id: string; numero: string; total: number; fecha_vencimiento: string | null; estado: string }[] | null>(
    null
  );
  const [metodo, setMetodo] = useState(METODOS_COBRO[0]);
  const [facturaACobrar, setFacturaACobrar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alSeleccionarCliente(id: string, nombre: string) {
    setClienteId(id);
    setClienteNombre(nombre);
    fetch(`/api/tecnico/clientes/${id}/facturas-pendientes`)
      .then((r) => r.json())
      .then((d) => setFacturas(d?.facturas ?? []));
  }

  async function confirmarCobro() {
    if (!facturaACobrar) return;
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/tecnico/facturas/${facturaACobrar}/cobrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metodoCobro: metodo }),
    });
    const data = await res.json().catch(() => null);
    setEnviando(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo cobrar.");
      return;
    }
    onCobrado();
  }

  if (!clienteId) {
    return (
      <SelectorClienteBusqueda titulo="¿A qué cliente le vas a cobrar?" onCancelar={onCancelar} onSeleccionar={alSeleccionarCliente} />
    );
  }

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <p className="text-lg font-medium">{clienteNombre}</p>
        <button onClick={onCancelar} className="text-xs text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      {facturas === null && <p className="text-xs text-muted">Cargando facturas pendientes...</p>}
      {facturas !== null && facturas.length === 0 && <p className="text-xs text-muted">Este cliente no tiene facturas pendientes.</p>}

      <div className="vc-card mb-3">
        {(facturas ?? []).map((f) => (
          <button
            key={f.id}
            onClick={() => setFacturaACobrar(f.id)}
            className="flex w-full items-center justify-between border-b border-border py-2.5 text-left text-sm last:border-0"
            style={facturaACobrar === f.id ? { color: "#1D9E75" } : undefined}
          >
            <div>
              <p>{f.numero}</p>
              <p className="text-xs text-muted">Vence {f.fecha_vencimiento ?? "—"}</p>
            </div>
            <p className="font-medium">{formatMoney(f.total)}</p>
          </button>
        ))}
      </div>

      {facturaACobrar && (
        <div className="vc-card flex flex-col gap-2.5">
          {error && <p className="text-xs text-red">{error}</p>}
          <select className="vc-input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS_COBRO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="vc-btn-primary" disabled={enviando} onClick={confirmarCobro}>
            {enviando ? "Cobrando..." : "Confirmar cobro"}
          </button>
        </div>
      )}
    </div>
  );
}

function SelectorClienteBusqueda({
  titulo,
  onCancelar,
  onSeleccionar,
}: {
  titulo: string;
  onCancelar: () => void;
  onSeleccionar: (id: string, nombre: string) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteLite[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscando(true);
      fetch(`/api/tecnico/clientes?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResultados(d?.clientes ?? []))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <p className="text-lg font-medium">{titulo}</p>
        <button onClick={onCancelar} className="text-xs text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>
      <input className="vc-input mb-3" placeholder="Buscar cliente por nombre..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="vc-card">
        {buscando && <p className="text-xs text-muted">Buscando...</p>}
        {!buscando && resultados.length === 0 && <p className="text-xs text-muted">Sin resultados.</p>}
        {resultados.map((c) => (
          <button
            key={c.id}
            onClick={() => onSeleccionar(c.id, c.name)}
            className="flex w-full items-center justify-between border-b border-border py-2.5 text-left text-sm last:border-0"
          >
            <span>{c.name}</span>
            {c.phone && <span className="text-xs text-muted">{c.phone}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Pantalla de una factura — añadir ítems, evidencia (fotos + firma),
// descuento, y finalizar (enviar o mandar a revisión).
// ============================================================================
function PantallaFactura({ facturaId, sesion, onVolver }: { facturaId: string; sesion: Sesion; onVolver: () => void }) {
  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [items, setItems] = useState<ItemFactura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogItemId, setCatalogItemId] = useState("__libre__");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [guardandoItem, setGuardandoItem] = useState(false);

  const [descuentoPct, setDescuentoPct] = useState("0");
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [evidenciaSubida, setEvidenciaSubida] = useState(0);
  const [mostrarFirma, setMostrarFirma] = useState(false);

  const [finalizando, setFinalizando] = useState(false);
  const [resultado, setResultado] = useState<{ estado: string } | null>(null);
  const [metodoCobro, setMetodoCobro] = useState(METODOS_COBRO[0]);
  const [cobrando, setCobrando] = useState(false);
  const [cobrado, setCobrado] = useState(false);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/tecnico/facturas/${facturaId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      setFactura(data.factura);
      setItems(data.items ?? []);
      setDescuentoPct(String(data.factura.descuento_pct || 0));
    } else {
      setError(data?.error ?? "No se pudo cargar la factura.");
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId]);

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

  async function anadirItem() {
    // Antes esto salía en silencio sin decir nada si faltaba la descripción
    // o el precio era inválido (2 sept 2026, bug reportado por Joel: "hice
    // una factura como técnico y no me dejaba guardarla, solo se creó en
    // $0" — pasaba porque el ítem nunca se añadía y el botón de abajo sigue
    // deshabilitado mientras items.length === 0, sin que el técnico
    // entendiera por qué). Ahora avisa qué falta.
    if (!descripcion.trim()) {
      setError("Escribe una descripción para el ítem antes de añadirlo.");
      return;
    }
    if (precioUnitario.trim() === "" || Number(precioUnitario) < 0) {
      setError("Escribe un precio (puede ser $0 si es gratis, pero no puede quedar vacío).");
      return;
    }
    setError(null);
    setGuardandoItem(true);
    const res = await fetch(`/api/tecnico/facturas/${facturaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            descripcion: descripcion.trim(),
            cantidad: Number(cantidad) > 0 ? Number(cantidad) : 1,
            precioUnitario: Number(precioUnitario) || 0,
            servicioId: catalogItemId === "__libre__" ? null : catalogItemId,
          },
        ],
      }),
    });
    setGuardandoItem(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "No se pudo añadir el ítem.");
      return;
    }
    setCatalogItemId("__libre__");
    setDescripcion("");
    setCantidad("1");
    setPrecioUnitario("");
    cargar();
  }

  async function subirEvidencia(tipo: "foto" | "firma", dataUrl: string) {
    setSubiendoEvidencia(true);
    setError(null);
    const res = await fetch(`/api/tecnico/facturas/${facturaId}/evidencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, dataUrl }),
    });
    setSubiendoEvidencia(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "No se pudo subir la evidencia.");
      return;
    }
    setEvidenciaSubida((n) => n + 1);
    setMostrarFirma(false);
  }

  function alTomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => subirEvidencia("foto", lector.result as string);
    lector.readAsDataURL(file);
  }

  async function finalizar() {
    setFinalizando(true);
    setError(null);
    const res = await fetch(`/api/tecnico/facturas/${facturaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descuentoPct: Number(descuentoPct) || 0, finalizar: true }),
    });
    const data = await res.json().catch(() => null);
    setFinalizando(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo enviar la factura.");
      return;
    }
    setResultado({ estado: data.estado });
  }

  async function marcarCobrado() {
    setCobrando(true);
    setError(null);
    const res = await fetch(`/api/tecnico/facturas/${facturaId}/cobrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metodoCobro }),
    });
    setCobrando(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "No se pudo marcar cobrada.");
      return;
    }
    setCobrado(true);
  }

  if (cargando) return <div className="min-h-screen bg-bg" />;
  if (!factura) {
    return (
      <div className="vc-shell pb-10 pt-4">
        <button onClick={onVolver} className="mb-4 text-xs text-muted hover:opacity-80">
          ← Volver
        </button>
        <p className="text-xs text-red">{error ?? "Factura no encontrada."}</p>
      </div>
    );
  }

  if (resultado) {
    const ES_MANUAL = resultado.estado === "borrador";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <i className="ti ti-circle-check mb-2 text-3xl text-teal" />
        <p className="mb-1 text-sm font-medium">{factura.numero}</p>
        <p className="mb-1 text-lg font-medium">{formatMoney(factura.total)}</p>
        <p className="mb-6 max-w-xs text-xs text-muted">
          {ES_MANUAL ? "Enviada al dueño — pendiente de que la apruebe." : "Factura enviada al cliente."}
        </p>

        {!ES_MANUAL && !cobrado && (
          <div className="vc-card mb-4 flex w-full max-w-xs flex-col gap-2.5">
            <p className="text-xs uppercase tracking-wide text-muted">¿Ya cobraste?</p>
            {error && <p className="text-xs text-red">{error}</p>}
            <select className="vc-input" value={metodoCobro} onChange={(e) => setMetodoCobro(e.target.value)}>
              {METODOS_COBRO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className="vc-btn-primary" disabled={cobrando} onClick={marcarCobrado}>
              {cobrando ? "Marcando..." : "Marcar cobrado"}
            </button>
          </div>
        )}
        {cobrado && <p className="mb-4 text-xs text-teal">Marcada como cobrada ✓</p>}

        <button className="rounded-pill border border-teal px-4 py-2 text-sm font-medium text-teal" onClick={onVolver}>
          Volver al inicio
        </button>
      </div>
    );
  }

  const puedeEditar = factura.estado === "borrador" && !factura.pendiente_revision_tecnico;

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <button onClick={onVolver} className="text-xs text-muted hover:opacity-80">
          ← Volver
        </button>
        <p className="text-xs text-muted">{factura.numero}</p>
      </div>

      <div className="vc-card mb-3">
        <p className="text-xs uppercase tracking-wide text-muted">Cliente</p>
        <p className="text-sm">{factura.clients?.name ?? "—"}</p>
        {factura.clients?.phone && <p className="text-xs text-muted">{factura.clients.phone}</p>}
      </div>

      {!puedeEditar && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Esta factura ya {factura.pendiente_revision_tecnico ? "está pendiente de aprobación" : "fue enviada"} — no se puede editar.
        </div>
      )}

      {items.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Ítems</p>
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{it.descripcion}</p>
                {sesion.permisos.vePrecios && (
                  <p className="text-xs text-muted">
                    {it.cantidad} × {formatMoney(it.precio_unitario)}
                  </p>
                )}
              </div>
              {sesion.permisos.vePrecios && <p className="flex-shrink-0 font-medium">{formatMoney(it.subtotal_linea)}</p>}
            </div>
          ))}
          {sesion.permisos.vePrecios && (
            <div className="flex items-center justify-between pt-2 text-sm font-medium">
              <span>Total</span>
              <span>{formatMoney(factura.total)}</span>
            </div>
          )}
        </div>
      )}

      {puedeEditar && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Añadir ítem</p>
          {sesion.catalogo.length > 0 && (
            <select className="vc-input mb-2" value={catalogItemId} onChange={(e) => alEscogerCatalogo(e.target.value)}>
              <option value="__libre__">Personalizado (escribe abajo)</option>
              {sesion.catalogo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {sesion.permisos.vePrecios ? ` — ${formatMoney(c.precio)}` : ""}
                </option>
              ))}
            </select>
          )}
          <input className="vc-input mb-2" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <div className="mb-2 flex gap-2">
            <input className="vc-input" style={{ width: 90 }} type="number" min="1" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
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
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-teal py-2 text-xs font-medium text-teal"
            disabled={guardandoItem}
            onClick={anadirItem}
          >
            <i className="ti ti-plus" /> {guardandoItem ? "Añadiendo..." : "Añadir ítem"}
          </button>
        </div>
      )}

      {puedeEditar && sesion.permisos.aplicaDescuento && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Descuento (hasta {sesion.permisos.descuentoMaxPct}%)</p>
          <div className="flex w-24 items-center gap-1">
            <input
              className="vc-input"
              type="number"
              min="0"
              max={sesion.permisos.descuentoMaxPct}
              value={descuentoPct}
              onChange={(e) => setDescuentoPct(e.target.value)}
            />
            <span className="text-xs text-muted">%</span>
          </div>
        </div>
      )}

      {puedeEditar && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Evidencia {evidenciaSubida > 0 && <span className="normal-case text-teal">· {evidenciaSubida} subida{evidenciaSubida === 1 ? "" : "s"}</span>}
          </p>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs font-medium">
              <i className="ti ti-camera" /> {subiendoEvidencia ? "Subiendo..." : "Tomar foto"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={alTomarFoto} disabled={subiendoEvidencia} />
            </label>
            <button
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs font-medium"
              onClick={() => setMostrarFirma(true)}
            >
              <i className="ti ti-signature" /> Firma del cliente
            </button>
          </div>
          {mostrarFirma && (
            <FirmaCanvas onGuardar={(dataUrl) => subirEvidencia("firma", dataUrl)} onCancelar={() => setMostrarFirma(false)} guardando={subiendoEvidencia} />
          )}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {puedeEditar && items.length === 0 && (
        <p className="mb-2 text-xs text-muted">Añade al menos un ítem arriba para poder enviar la factura.</p>
      )}
      {puedeEditar && (
        <button className="vc-btn-primary" disabled={finalizando || items.length === 0} onClick={finalizar}>
          {finalizando ? "Enviando..." : sesion.approvalMode === "manual" ? "Enviar para aprobación" : "Finalizar y enviar al cliente"}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Pantalla de una cotización nueva (2 sept 2026, pedido de Joel: "si un
// cliente quiere algo nuevo el empleado pudiera cotizarlo y guardarlo para
// que el jefe lo apruebe y se lo envía como trabajo") — mismo patrón de
// añadir ítems que PantallaFactura, pero sin evidencia/firma/cobro (todavía
// no es un trabajo, es solo un precio que el dueño tiene que aprobar
// primero) y SIEMPRE termina "pendiente de aprobación", nunca se manda
// directo a un cliente real.
// ============================================================================
type ItemCotizacion = { id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal_linea: number };
type CotizacionDetalle = {
  id: string;
  numero: string;
  total: number;
  subtotal: number;
  ivu_monto: number;
  estado: string;
  pendiente_revision_tecnico: boolean;
  client_id: string;
  clients: { name: string; phone: string | null } | null;
};

function PantallaCotizacion({ cotizacionId, sesion, onVolver }: { cotizacionId: string; sesion: Sesion; onVolver: () => void }) {
  const [cotizacion, setCotizacion] = useState<CotizacionDetalle | null>(null);
  const [items, setItems] = useState<ItemCotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogItemId, setCatalogItemId] = useState("__libre__");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [guardandoItem, setGuardandoItem] = useState(false);

  const [finalizando, setFinalizando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/tecnico/cotizaciones/${cotizacionId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      setCotizacion(data.cotizacion);
      setItems(data.items ?? []);
    } else {
      setError(data?.error ?? "No se pudo cargar la cotización.");
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacionId]);

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

  async function anadirItem() {
    if (!descripcion.trim()) {
      setError("Escribe una descripción para el ítem antes de añadirlo.");
      return;
    }
    if (precioUnitario.trim() === "" || Number(precioUnitario) < 0) {
      setError("Escribe un precio (puede ser $0, pero no puede quedar vacío).");
      return;
    }
    setError(null);
    setGuardandoItem(true);
    const res = await fetch(`/api/tecnico/cotizaciones/${cotizacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            descripcion: descripcion.trim(),
            cantidad: Number(cantidad) > 0 ? Number(cantidad) : 1,
            precioUnitario: Number(precioUnitario) || 0,
            servicioId: catalogItemId === "__libre__" ? null : catalogItemId,
          },
        ],
      }),
    });
    setGuardandoItem(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "No se pudo añadir el ítem.");
      return;
    }
    setCatalogItemId("__libre__");
    setDescripcion("");
    setCantidad("1");
    setPrecioUnitario("");
    cargar();
  }

  async function finalizar() {
    setFinalizando(true);
    setError(null);
    const res = await fetch(`/api/tecnico/cotizaciones/${cotizacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalizar: true }),
    });
    const data = await res.json().catch(() => null);
    setFinalizando(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo enviar la cotización.");
      return;
    }
    setEnviada(true);
  }

  if (cargando) return <div className="min-h-screen bg-bg" />;
  if (!cotizacion) {
    return (
      <div className="vc-shell pb-10 pt-4">
        <button onClick={onVolver} className="mb-4 text-xs text-muted hover:opacity-80">
          ← Volver
        </button>
        <p className="text-xs text-red">{error ?? "Cotización no encontrada."}</p>
      </div>
    );
  }

  if (enviada) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <i className="ti ti-circle-check mb-2 text-3xl text-teal" />
        <p className="mb-1 text-sm font-medium">{cotizacion.numero}</p>
        <p className="mb-1 text-lg font-medium">{formatMoney(cotizacion.total)}</p>
        <p className="mb-6 max-w-xs text-xs text-muted">Enviada al dueño — pendiente de que la apruebe antes de mandarla al cliente.</p>
        <button className="rounded-pill border border-teal px-4 py-2 text-sm font-medium text-teal" onClick={onVolver}>
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="vc-shell pb-10">
      <div className="mb-4 flex items-center justify-between pt-4">
        <button onClick={onVolver} className="text-xs text-muted hover:opacity-80">
          ← Volver
        </button>
        <p className="text-xs text-muted">{cotizacion.numero}</p>
      </div>

      <div className="vc-card mb-3">
        <p className="text-xs uppercase tracking-wide text-muted">Cliente</p>
        <p className="text-sm">{cotizacion.clients?.name ?? "—"}</p>
        {cotizacion.clients?.phone && <p className="text-xs text-muted">{cotizacion.clients.phone}</p>}
      </div>

      {items.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Ítems</p>
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{it.descripcion}</p>
                {sesion.permisos.vePrecios && (
                  <p className="text-xs text-muted">
                    {it.cantidad} × {formatMoney(it.precio_unitario)}
                  </p>
                )}
              </div>
              {sesion.permisos.vePrecios && <p className="flex-shrink-0 font-medium">{formatMoney(it.subtotal_linea)}</p>}
            </div>
          ))}
          {sesion.permisos.vePrecios && (
            <div className="flex items-center justify-between pt-2 text-sm font-medium">
              <span>Total</span>
              <span>{formatMoney(cotizacion.total)}</span>
            </div>
          )}
        </div>
      )}

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Añadir ítem</p>
        {sesion.catalogo.length > 0 && (
          <select className="vc-input mb-2" value={catalogItemId} onChange={(e) => alEscogerCatalogo(e.target.value)}>
            <option value="__libre__">Personalizado (escribe abajo)</option>
            {sesion.catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {sesion.permisos.vePrecios ? ` — ${formatMoney(c.precio)}` : ""}
              </option>
            ))}
          </select>
        )}
        <input className="vc-input mb-2" placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <div className="mb-2 flex gap-2">
          <input className="vc-input" style={{ width: 90 }} type="number" min="1" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
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
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-teal py-2 text-xs font-medium text-teal"
          disabled={guardandoItem}
          onClick={anadirItem}
        >
          <i className="ti ti-plus" /> {guardandoItem ? "Añadiendo..." : "Añadir ítem"}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {items.length === 0 && <p className="mb-2 text-xs text-muted">Añade al menos un ítem arriba para poder enviarla.</p>}
      <button className="vc-btn-primary" disabled={finalizando || items.length === 0} onClick={finalizar}>
        {finalizando ? "Enviando..." : "Enviar al dueño para aprobación"}
      </button>
    </div>
  );
}

// ============================================================================
// Firma del cliente — canvas simple (dibujar con el dedo/mouse, limpiar,
// guardar como PNG). No hay librería de firmas instalada, así que esto es
// un canvas nativo mínimo — suficiente para capturar el trazo.
// ============================================================================
function FirmaCanvas({ onGuardar, onCancelar, guardando }: { onGuardar: (dataUrl: string) => void; onCancelar: () => void; guardando: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    dibujando.current = true;
    setVacio(false);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = coordenadas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = coordenadas(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  function terminar() {
    dibujando.current = false;
  }
  function limpiar() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setVacio(true);
  }
  function guardar() {
    onGuardar(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <canvas
        ref={canvasRef}
        width={300}
        height={140}
        className="w-full touch-none rounded-lg border border-border bg-white"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div className="mt-2 flex gap-2">
        <button className="flex-1 rounded-lg border border-border py-1.5 text-xs" onClick={limpiar}>
          Limpiar
        </button>
        <button className="flex-1 rounded-lg border border-border py-1.5 text-xs" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="vc-btn-primary flex-1" style={{ width: "auto" }} disabled={vacio || guardando} onClick={guardar}>
          {guardando ? "..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
