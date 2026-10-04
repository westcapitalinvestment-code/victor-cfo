"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";
import ConfirmarPagoModal, { type LineaConfirmacion } from "../confirmar-pago-modal";
// Calculadora de deducción en riesgo (3 oct 2026, pedido de Joel: quería la
// misma calculadora de la landing disponible DENTRO de la cuenta demo, en
// Pagos/Reportes, para que el que esté presentando el producto la use en
// vivo frente a un prospecto). lib/calculadora-deduccion.ts es la única
// fuente de verdad del cálculo — landing, VICTOR (chat) y esta tarjeta dicen
// exactamente lo mismo.
import {
  calcularImpuestoEnRiesgo,
  CALCULADORA_DISCLAIMER,
  CALCULADORA_EXPLICACION,
  TASA_CONTRIBUTIVA_LABEL,
  type TasaContributivaId,
} from "@/lib/calculadora-deduccion";

type Vendor = {
  id: string;
  name: string;
  tax_id: string | null;
  vendor_type: string;
  retention_type: string | null;
  default_retention_pct: number;
  is_corporation: boolean;
  active: boolean;
  entity_id: string | null;
  // Migración 0116 (30 sept 2026, pedido de Joel a raíz de la conversación
  // con su CPA): Certificado de Relevo de Retención archivado por
  // contratista — sin esto, el 6%/0% que alguien le puso al contratista en
  // pantalla no tiene respaldo real ante Hacienda (Sección 1062.03(g)).
  relevo_r2_key?: string | null;
  relevo_pct?: number | null;
  relevo_fecha_expiracion?: string | null;
  // Migración 0122 (1 oct 2026, #788 — mismo origen que el Relevo): parte
  // del expediente digital anti-reclasificación. Junto con el tax_id y el
  // Relevo, respalda ante una auditoría del Depto. del Trabajo/Hacienda que
  // este contratista opera un negocio independiente legítimo. No vence
  // como el Relevo, así que no lleva fecha de expiración.
  registro_comerciante_r2_key?: string | null;
  // Migración 0118 (30 sept 2026): cuenta bancaria del contratista para el
  // archivo NACHA — bank_account_number_enc NUNCA se trae al cliente (se
  // descifra solo en el servidor al generar el archivo), por eso no está en
  // este tipo; aquí solo lo que hace falta para saber si ya está completa.
  bank_routing_number?: string | null;
  bank_account_type?: string | null;
  // Migración 0119 (30 sept 2026): dirección postal, para enviarle al
  // contratista su copia del Modelo 480.6SP por correo.
  address?: string | null;
};

// Estado real del relevo de un contratista, comparado contra hoy (fecha de
// PR, no UTC — mismo fix de raíz que hoyISO() más abajo).
function estadoRelevo(v: Vendor, hoyISOStr: string): "vigente" | "vencido" | "ninguno" {
  if (!v.relevo_r2_key) return "ninguno";
  if (!v.relevo_fecha_expiracion) return "vigente"; // archivado sin fecha — no asumir vencido
  return v.relevo_fecha_expiracion >= hoyISOStr ? "vigente" : "vencido";
}

// Las 4 casillas reales del Modelo 480.6SP (Sección 1062.03) — confirmado
// con el CPA de Joel y con un 480.6SP real de su compañía, 30 sept 2026.
// No son "480.6A"/"480.6B" como dos formularios separados: es un solo
// formulario (480.6SP) con 4 casillas según sujeto/exento × individuo/
// corporación. retention_type sigue guardando internamente "480.6A"
// (exento) / "480.6B" (sujeto) por compatibilidad con los datos ya
// guardados — solo cambia cómo se le muestra al usuario. is_corporation
// (migración 0112) guarda el eje individuo/corporación.
function casilla480_6SP(v: { retention_type: string | null; is_corporation: boolean }): { numero: number; label: string } {
  const sujeto = v.retention_type === "480.6B";
  if (!sujeto && !v.is_corporation) return { numero: 1, label: "Casilla 1 — individuo, no sujeto a retención" };
  if (!sujeto && v.is_corporation) return { numero: 2, label: "Casilla 2 — corporación/entidad, no sujeta a retención" };
  if (sujeto && !v.is_corporation) return { numero: 3, label: "Casilla 3 — individuo, sujeto a retención" };
  return { numero: 4, label: "Casilla 4 — corporación/entidad, sujeta a retención" };
}

type Retencion = {
  id: string;
  vendor_id: string;
  gross_amount: number;
  retention_pct: number;
  retention_amount: number;
  net_paid: number;
  period_start: string | null;
  period_end: string | null;
  remittance_status: string;
  entity_id: string | null;
  created_at: string;
};

// Evidencia (foto/PDF) de un pago — migración 0085, 12 sept 2026, pedido de
// Joel: "poner un boton de foto y upload por si se necesitara poner una
// evidencia de la factura o lo que uno esta pagando en pagos". Mismo shape
// que Adjunto en factura-detalle.tsx.
type AdjuntoPago = { id: string; nombre_archivo: string };

const EXTENSIONES_IMAGEN_PAGO = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];
function esImagenPago(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES_IMAGEN_PAGO.some((ext) => n.endsWith(ext));
}

const TABS = [
  { id: "pagos", label: "Pagos", icon: "ti-cash" },
  { id: "contratistas", label: "Contratistas", icon: "ti-users" },
  { id: "reportes", label: "Reportes", icon: "ti-chart-bar" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Misma paleta/hash que Facturación, para que los avatares de iniciales se
// sientan consistentes entre los dos portales.
const COLORES_AVATAR = ["#0F6E56", "#534AB7", "#A32D2D", "#185FA5", "#854F0B", "#1D9E75", "#B7590F"];

function colorAvatar(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORES_AVATAR[hash % COLORES_AVATAR.length];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Fix (30 sept 2026, reportado por Joel): esto usaba new Date().toISOString()
// crudo, que es UTC — en PR (UTC-4/AST) después de las 8:00pm el reloj UTC ya
// cruzó a mañana aunque acá todavía no sea medianoche, así que "hoy" y el
// trimestre/mes calculado a partir de eso salían adelantados un día (o un
// trimestre entero, si el salto cae el día 1). fechaHoyPR() usa
// Intl.DateTimeFormat contra "America/Puerto_Rico" — mismo criterio que ya
// se usa en el resto de la app (lib/hora-pr.ts) desde la tarea #83.
function hoyISO(): string {
  return fechaHoyPR();
}

// Trimestre calendario (Ene-Mar, Abr-Jun, Jul-Sep, Oct-Dic) — el mismo
// agrupamiento que pide Hacienda PR para el 480.6A/B.
function trimestreDe(fechaISO: string): number {
  return Math.ceil(Number(fechaISO.slice(5, 7)) / 3);
}

// Nombre del mes en español a partir de "YYYY-MM" (30 sept 2026) — para el
// indicador "Retenido en {mes}" junto al de trimestre.
const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function nombreMes(anioMes: string): string {
  const [anio, mes] = anioMes.split("-");
  return `${NOMBRES_MES[Number(mes) - 1]} ${anio}`;
}

function rangoTrimestre(anio: number, trimestre: number): { desde: string; hasta: string } {
  const mesInicio = (trimestre - 1) * 3 + 1;
  const mesFin = mesInicio + 2;
  const ultimoDia = new Date(anio, mesFin, 0).getDate();
  return {
    desde: `${anio}-${String(mesInicio).padStart(2, "0")}-01`,
    hasta: `${anio}-${String(mesFin).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

// Valores internos sin cambiar ("480.6A"/"480.6B") por compatibilidad con
// datos ya guardados — el label ya no los nombra como formularios
// separados (corregido 30 sept 2026, ver nota en casilla480_6SP()).
const TIPOS_RETENCION = [
  { value: "480.6B", label: "Sujeto a retención" },
  { value: "480.6A", label: "Exento de retención" },
] as const;

// Umbral real de Hacienda PR (Sección 1062.03) sobre pagos por servicios a
// un mismo contratista en el año calendario (confirmado por el CPA de Joel
// — 30 sept 2026 — corrige un error de esta misma lógica que tenía DOS
// umbrales, $500 para "declarar" y $1,500 para "retener": ese segundo
// número no existe en la ley. Es un solo umbral de $500, y la retención
// del 10%/6% aplica sobre el EXCESO de $500 acumulado en el año, no sobre
// el pago completo una vez se cruza el umbral. Ver retencionMarginal() más
// abajo para el cálculo real.
// NOTA: gross_amount en vendor_retenciones está en dólares (no centavos,
// a diferencia de socios_comisiones) — este umbral va en dólares.
const UMBRAL_DECLARAR_DOLARES = 500;

// Retención real sobre pagos por servicios (Sección 1062.03): solo la
// porción de ESTE pago que hace que el acumulado del año supere los $500
// paga retención — no el pago completo. Ej.: si ya le llevas pagado $400
// este año y le pagas $300 más ($700 acumulado), la retención es sobre
// $200 ($700 - $500), no sobre los $300 completos. Si ya había pasado los
// $500 antes de este pago, la retención es sobre el pago completo (el
// acumulado previo ya "usó" los primeros $500 exentos).
function retencionMarginal(acumuladoPrevio: number, montoPago: number, pct: number): number {
  if (pct <= 0 || montoPago <= 0) return 0;
  const excesoPrevio = Math.max(0, acumuladoPrevio - UMBRAL_DECLARAR_DOLARES);
  const excesoNuevo = Math.max(0, acumuladoPrevio + montoPago - UMBRAL_DECLARAR_DOLARES);
  const baseTributable = excesoNuevo - excesoPrevio;
  return Math.round(baseTributable * (pct / 100) * 100) / 100;
}

// Suma de gross_amount por contratista en el año calendario dado — misma
// fuente de verdad que Reportes (period_start/period_end de cada corrida).
function acumuladoAnualPorVendor(retenciones: Retencion[], anio: number): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of retenciones) {
    const fecha = r.period_end ?? r.period_start ?? r.created_at;
    if (!fecha || Number(fecha.slice(0, 4)) !== anio) continue;
    mapa.set(r.vendor_id, (mapa.get(r.vendor_id) ?? 0) + Number(r.gross_amount));
  }
  return mapa;
}

// Modelo 480.9A — depósito mensual de las retenciones de la Sección
// 1062.03, vence el día 15 del mes SIGUIENTE al mes en que se hizo el pago
// (no trimestral, a diferencia del 480.6SP que es anual). Esto solo AVISA
// cuánto hay que depositar y cuándo vence — Joel remesa a SURI por fuera de
// la app (marcar como "remesado" es roadmap, tarea #317).
// Regla: si hoy es día 1-15, el depósito pendiente es el del mes PASADO
// (vence hoy, día 15). Si hoy es día 16+, el depósito pendiente es el del
// mes EN CURSO (vence el día 15 del mes que viene) — todavía no ha vencido.
function estadoDeposito480_9A(
  retenciones: Retencion[],
  entidadId: string | null,
  vistaGlobal: boolean,
  hoy: Date
): { anio: number; mes: number; totalDolares: number; vence: Date; vencido: boolean } {
  const diaHoy = hoy.getDate();
  // Mes de referencia (0-indexado) cuyo depósito nos interesa mostrar.
  const refFecha = new Date(hoy.getFullYear(), hoy.getMonth() - (diaHoy <= 15 ? 1 : 0), 1);
  const anio = refFecha.getFullYear();
  const mes = refFecha.getMonth(); // 0-11
  const vence = new Date(anio, mes + 1, 15);

  let total = 0;
  for (const r of retenciones) {
    if (!vistaGlobal && entidadId && r.entity_id !== entidadId) continue;
    const fecha = r.period_end ?? r.period_start ?? r.created_at;
    if (!fecha) continue;
    const f = new Date(fecha);
    if (f.getFullYear() === anio && f.getMonth() === mes) total += Number(r.retention_amount);
  }

  return { anio, mes, totalDolares: total, vence, vencido: hoy > vence && total > 0 };
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Portal de Pagos a contratistas (2 sept 2026, pedido de Joel). Alcance
// acordado: el sistema calcula bruto/retención 480.6/neto por corrida de
// pago — Joel toma esos números y los sube a mano al ACH de BPPR, como hace
// hoy. No se genera archivo ACH ni se guardan cuentas bancarias de nadie.
export default function PagosPortal({
  vendors,
  retenciones,
  entidadId,
  vistaGlobal = false,
  entidades = [],
  retencionDefault,
  volverHref = "/dashboard",
  volverLabel = "← VICTOR",
  ownerIdEfectivo,
  modoAdmin = false,
  adjuntosPorRetencion = {},
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
  // 7 sept 2026 — bug real reportado por Joel ("no me esta trayendo los
  // reportes"): entidadId SIEMPRE traía un valor (con fallback a
  // entities[0].id incluso en "Vista global" del topbar), así que el
  // export CSV/PDF de Reportes filtraba de más — solo la PRIMERA entidad
  // — mientras la lista en pantalla (que no filtra por entidad, mezcla
  // todas) sí mostraba los contratistas de TODAS las entidades. Este flag
  // le dice a ReportesTab cuándo NO debe mandar entityId al exportar, para
  // que el PDF/CSV traiga exactamente lo mismo que ya se ve en pantalla.
  vistaGlobal?: boolean;
  // Todas las entidades activas del usuario (no solo la activa del topbar) —
  // hace falta la lista completa para resolver el nombre de CADA contratista
  // en "vista global" (varias entidades mezcladas), no solo el de la
  // entidad actualmente seleccionada. Ver ConfirmarPagoModal.
  entidades?: { id: string; name: string }[];
  retencionDefault: number;
  volverHref?: string;
  volverLabel?: string;
  ownerIdEfectivo?: string;
  modoAdmin?: boolean;
  // Evidencia por pago, agrupada por vendor_retencion_id — solo trae la de
  // las filas visibles en "Pagos recientes" (últimas 20). Soportado también
  // en modoAdmin (Administrador) desde la migración 0086 + fix de ownerId
  // efectivo en /api/pagos/adjuntos/* (12 sept 2026) — /admin/[entityId]/pagos
  // debe pasar este prop igual que dashboard/pagos/page.tsx para que se vea.
  adjuntosPorRetencion?: Record<string, AdjuntoPago[]>;
}) {
  const [tab, setTab] = useState<TabId>("pagos");

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        {modoAdmin ? <CerrarSesionAdminPagos /> : <Link href={volverHref} className="text-sm text-muted hover:opacity-80">{volverLabel}</Link>}
      </div>

      <div className="mb-4 rounded-2xl border border-teal bg-teal/[.04] p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-medium">Pagos</p>
            <p className="text-xs text-muted">Contratistas y retención 480.6</p>
          </div>
          {entidadId && !modoAdmin && (
            <Link
              href={`/dashboard/entidades/${entidadId}/editar`}
              className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal hover:opacity-80"
            >
              <i className="ti ti-settings" style={{ fontSize: 14 }} />
              Editar negocio
            </Link>
          )}
        </div>
        <div
          className="flex"
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, gap: 3 }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5"
              style={{
                padding: "9px 4px",
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.2,
                textAlign: "center",
                color: tab === t.id ? "#1D9E75" : "var(--muted)",
                borderBottom: tab === t.id ? "2px solid #1D9E75" : "2px solid transparent",
                background: "none",
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 17 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pagos" && (
        <PagosTab
          vendors={vendors}
          retenciones={retenciones}
          entidadId={entidadId}
          entidades={entidades}
          ownerIdEfectivo={ownerIdEfectivo}
          adjuntosPorRetencionInicial={adjuntosPorRetencion}
          modoAdmin={modoAdmin}
        />
      )}
      {tab === "contratistas" && (
        <ContratistasTab
          vendors={vendors}
          retenciones={retenciones}
          entidadId={entidadId}
          retencionDefault={retencionDefault}
          ownerIdEfectivo={ownerIdEfectivo}
        />
      )}
      {tab === "reportes" && <ReportesTab vendors={vendors} retenciones={retenciones} entidadId={entidadId} vistaGlobal={vistaGlobal} />}
    </div>
  );
}

// Cierre de sesión para el admin/secretaria (calcado de CerrarSesionAdmin en
// facturacion-portal.tsx) — duplicado a propósito aquí, mismo patrón que el
// resto del código (cada portal trae su propia copia).
function CerrarSesionAdminPagos() {
  const router = useRouter();
  const supabase = createClient();
  async function salir() {
    await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <button onClick={salir} className="text-sm text-muted hover:opacity-80">
      Cerrar sesión
    </button>
  );
}

// Sección con +/- para minimizar (2 sept 2026, pedido de Joel: "veo una
// lista laaarga de pagos recientes, puedes ponerle un minimizador") —
// arranca cerrada por default cuando la lista puede crecer mucho.
function SeccionColapsable({
  titulo,
  defaultAbierta = true,
  children,
}: {
  titulo: string;
  defaultAbierta?: boolean;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(defaultAbierta);
  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setAbierta((v) => !v)}>
        <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
        <i className={`ti ${abierta ? "ti-minus" : "ti-plus"} text-muted`} style={{ fontSize: 13 }} />
      </button>
      {abierta && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// Tab: Pagos — corrida tipo nómina (pedido de Joel: calcado de cómo lo hace
// hoy en Excel — un solo periodo, monto bruto por contratista, y de un tirón
// ve bruto/retenido/neto de todos).
// ============================================================================
function PagosTab({
  vendors,
  retenciones,
  entidadId,
  entidades,
  ownerIdEfectivo,
  adjuntosPorRetencionInicial = {},
  modoAdmin = false,
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
  entidades: { id: string; name: string }[];
  ownerIdEfectivo?: string;
  adjuntosPorRetencionInicial?: Record<string, AdjuntoPago[]>;
  modoAdmin?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ nombre: string; neto: number }[] | null>(null);
  const [copiado, setCopiado] = useState(false);
  // IDs + entidad de la corrida que se acaba de registrar (4 oct 2026,
  // pedido de Joel: "cuando registro los pagos... es ahi dnd debe aparecer
  // [el botón de ACH] para copiar esa corrida, no las de abajo pq esas son
  // viejas") — antes el botón de ACH solo vivía en "Pagos recientes"
  // mezclado con corridas de semanas pasadas; ahora también aparece pegado
  // al resultado de la corrida recién guardada.
  const [resultadoIds, setResultadoIds] = useState<string[]>([]);
  const [resultadoEntityId, setResultadoEntityId] = useState<string | null>(null);
  // Confirmación con advertencia de entidad antes de guardar de verdad (4
  // sept 2026, pedido de Joel: calcado del mockup — "Registrar corrida" ya
  // no guarda directo, primero muestra bajo qué entidad va a quedar el pago.
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  // Adjuntar factura al MOMENTO de registrar el pago (12 sept 2026, pedido
  // de Joel: "eso debe estar en corrida de pagos tambien... si uno va a
  // pagar algo es pq tiene una factura") — no hay que esperar a que el pago
  // ya esté guardado para subir evidencia. Por contratista, antes de
  // "Registrar corrida"; se sube DESPUÉS del insert, usando el id real de
  // la vendor_retencion recién creada (no existe todavía mientras se arma
  // la corrida).
  const [archivosPendientes, setArchivosPendientes] = useState<Record<string, File[]>>({});
  const inputArchivoCorridaRef = useRef<HTMLInputElement>(null);
  const vendorArchivoObjetivo = useRef<string | null>(null);

  function abrirArchivoCorrida(vendorId: string) {
    vendorArchivoObjetivo.current = vendorId;
    inputArchivoCorridaRef.current?.click();
  }

  function agregarArchivosPendientes(e: React.ChangeEvent<HTMLInputElement>) {
    const vendorId = vendorArchivoObjetivo.current;
    const nuevos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (nuevos.length === 0 || !vendorId) return;
    setArchivosPendientes((prev) => ({ ...prev, [vendorId]: [...(prev[vendorId] ?? []), ...nuevos] }));
  }

  function quitarArchivoPendiente(vendorId: string, index: number) {
    setArchivosPendientes((prev) => ({
      ...prev,
      [vendorId]: (prev[vendorId] ?? []).filter((_, i) => i !== index),
    }));
  }

  // Evidencia por pago (12 sept 2026, pedido de Joel) — un solo panel
  // expandido a la vez dentro de "Pagos recientes", igual patrón visual que
  // "Evidencia del trabajo" en factura-detalle.tsx pero compacto porque acá
  // cada fila ya es una lista densa (no una pantalla propia).
  const [adjuntosPorRetencion, setAdjuntosPorRetencion] = useState(adjuntosPorRetencionInicial);
  const [evidenciaAbiertaId, setEvidenciaAbiertaId] = useState<string | null>(null);
  const [subiendoEvidenciaId, setSubiendoEvidenciaId] = useState<string | null>(null);
  const [borrandoEvidenciaId, setBorrandoEvidenciaId] = useState<string | null>(null);
  const inputCamaraEvidenciaRef = useRef<HTMLInputElement>(null);
  const inputArchivoEvidenciaRef = useRef<HTMLInputElement>(null);
  const retencionEvidenciaObjetivo = useRef<string | null>(null);

  // Archivo ACH/NACHA (30 sept 2026, pedido de Joel — segunda mitad de "crear
  // los 2, uno para los tecnologicos... y el NACHA para los que tiran ACH").
  // Selección de pagos "pendiente" para armar un solo archivo .ach que se
  // sube al portal del banco en vez de copiar/pegar nombre+monto a mano.
  const [seleccionNacha, setSeleccionNacha] = useState<Set<string>>(new Set());
  const [descargandoNacha, setDescargandoNacha] = useState(false);
  const [nachaError, setNachaError] = useState<string | null>(null);
  const [nachaAvisos, setNachaAvisos] = useState<string | null>(null);

  // idsOverride/entityIdOverride: usado por el botón pegado al resultado de
  // una corrida recién registrada (esas filas aún no están en el prop
  // `retenciones` del servidor hasta el próximo router.refresh()). Sin
  // override, usa la selección manual de "Pagos recientes" como antes.
  async function descargarNacha(idsOverride?: string[], entityIdOverride?: string) {
    const ids = idsOverride ?? [...seleccionNacha];
    if (ids.length === 0) return;
    setDescargandoNacha(true);
    setNachaError(null);
    setNachaAvisos(null);
    // Todas las filas seleccionadas deberían ser de la misma entidad (un
    // archivo NACHA sale de UNA sola cuenta originadora) — se usa la
    // entidad de la primera fila seleccionada; si alguna otra es de otra
    // entidad, el backend la excluye y avisa en vez de fallar todo.
    const primeraFila = retenciones.find((r) => r.id === ids[0]);
    const entityIdParaNacha = entityIdOverride ?? primeraFila?.entity_id ?? entidadId ?? "";
    try {
      const res = await fetch(`/api/pagos/nacha?ids=${ids.join(",")}&entityId=${entityIdParaNacha}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNachaError(data.error ?? "No se pudo generar el archivo ACH.");
        setDescargandoNacha(false);
        return;
      }
      const avisos = res.headers.get("X-Nacha-Avisos");
      if (avisos) setNachaAvisos(decodeURIComponent(avisos));
      const blob = await res.blob();
      const nombreArchivo =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "pagos.ach";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo;
      a.click();
      URL.revokeObjectURL(url);
      if (idsOverride) {
        setResultadoIds([]);
      } else {
        setSeleccionNacha(new Set());
      }
    } catch {
      setNachaError("No se pudo generar el archivo ACH. Intenta de nuevo.");
    }
    setDescargandoNacha(false);
  }

  function abrirCamaraEvidencia(retencionId: string) {
    retencionEvidenciaObjetivo.current = retencionId;
    inputCamaraEvidenciaRef.current?.click();
  }

  function abrirArchivoEvidencia(retencionId: string) {
    retencionEvidenciaObjetivo.current = retencionId;
    inputArchivoEvidenciaRef.current?.click();
  }

  async function subirEvidenciaPago(e: React.ChangeEvent<HTMLInputElement>) {
    const retencionId = retencionEvidenciaObjetivo.current;
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || !retencionId) return;

    setSubiendoEvidenciaId(retencionId);
    setError(null);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vendorRetencionId", retencionId);

      const res = await fetch("/api/pagos/adjuntos/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "No se pudo subir el archivo.");
        continue;
      }
      setAdjuntosPorRetencion((prev) => ({
        ...prev,
        [retencionId]: [...(prev[retencionId] ?? []), { id: data.id, nombre_archivo: file.name }],
      }));
    }

    setSubiendoEvidenciaId(null);
  }

  async function borrarEvidenciaPago(retencionId: string, adjuntoId: string) {
    setBorrandoEvidenciaId(adjuntoId);
    setError(null);
    const res = await fetch(`/api/pagos/adjuntos/${adjuntoId}`, { method: "DELETE" });
    setBorrandoEvidenciaId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar el archivo.");
      return;
    }
    setAdjuntosPorRetencion((prev) => ({
      ...prev,
      [retencionId]: (prev[retencionId] ?? []).filter((a) => a.id !== adjuntoId),
    }));
  }

  const nombreEntidad = useMemo(() => {
    const mapa = new Map(entidades.map((e) => [e.id, e.name]));
    return (id: string | null) => (id ? mapa.get(id) ?? "Entidad eliminada" : mapa.get(entidadId ?? "") ?? "Personal");
  }, [entidades, entidadId]);

  const activos = useMemo(() => vendors.filter((v) => v.active).sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  function pctDe(v: Vendor): number {
    const override = pcts[v.id];
    return override !== undefined && override !== "" ? Number(override) : Number(v.default_retention_pct);
  }

  // anioActual hace falta ANTES de filas — la retención marginal necesita
  // saber cuánto se le lleva pagado al contratista en el año de la fecha
  // del pago, no del año de hoy (por si se registra un pago atrasado).
  const anioActual = Number(fechaPago.slice(0, 4));
  const acumuladoAnual = useMemo(() => acumuladoAnualPorVendor(retenciones, anioActual), [retenciones, anioActual]);

  const filas = useMemo(() => {
    return activos
      .map((v) => {
        const bruto = Number(montos[v.id] || 0);
        const pct = pctDe(v);
        const acumuladoPrevio = acumuladoAnual.get(v.id) ?? 0;
        const retenido = retencionMarginal(acumuladoPrevio, bruto, pct);
        const neto = bruto - retenido;
        // 30 sept 2026, pedido de Joel: un % menor a 10 (6% o 0%) solo tiene
        // respaldo real si hay un Certificado de Relevo VIGENTE archivado —
        // Sección 1062.03(g). Si alguien bajó el % a mano sin eso, se marca
        // la fila para bloquear "Registrar corrida" más abajo.
        const relevoOk = pct >= 10 || estadoRelevo(v, fechaPago) === "vigente";
        return { vendor: v, bruto, pct, retenido, neto, relevoOk };
      })
      .filter((f) => f.bruto > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos, montos, pcts, acumuladoAnual, fechaPago]);

  const totalBruto = filas.reduce((s, f) => s + f.bruto, 0);
  const totalRetenido = filas.reduce((s, f) => s + f.retenido, 0);
  const totalNeto = filas.reduce((s, f) => s + f.neto, 0);
  const filasConProblemaRelevo = filas.filter((f) => !f.relevoOk);

  // Pote de "ya retenido este trimestre" — mismo cálculo que usará Reportes,
  // aquí solo como referencia rápida mientras registra la corrida.
  const trimestreActual = trimestreDe(fechaPago);
  const { desde: desdeTrim, hasta: hastaTrim } = rangoTrimestre(anioActual, trimestreActual);
  const retenidoTrimestre = retenciones
    .filter((r) => r.period_end && r.period_end >= desdeTrim && r.period_end <= hastaTrim)
    .reduce((s, r) => s + Number(r.retention_amount), 0);

  // Mismo pote pero por MES. 30 sept 2026, pedido de Joel: "deberia tener
  // los meses y los quarters" — el depósito real en SURI es mensual
  // (480.9A, Sección 1062.03), así que el mes es el dato que de verdad
  // importa para saber cuánto hay que depositar antes del día 15; el
  // trimestre se deja también porque sigue siendo útil como referencia
  // de ritmo, no se reemplaza, se añade al lado.
  const mesActualStr = fechaPago.slice(0, 7); // YYYY-MM
  const desdeMes = `${mesActualStr}-01`;
  const ultimoDiaMes = new Date(Number(mesActualStr.slice(0, 4)), Number(mesActualStr.slice(5, 7)), 0).getDate();
  const hastaMes = `${mesActualStr}-${String(ultimoDiaMes).padStart(2, "0")}`;
  const retenidoMes = retenciones
    .filter((r) => r.period_end && r.period_end >= desdeMes && r.period_end <= hastaMes)
    .reduce((s, r) => s + Number(r.retention_amount), 0);

  // Agrupado por entidad — solo para el modal de confirmación. La inmensa
  // mayoría de las veces es un solo grupo (una entidad activa normal); solo
  // aparece más de uno en "vista global" con contratistas de entidades
  // distintas en la misma corrida.
  const gruposPorEntidad = useMemo(() => {
    const mapa = new Map<string, { nombre: string; bruto: number; retenido: number; neto: number; filas: typeof filas }>();
    for (const f of filas) {
      const id = f.vendor.entity_id ?? entidadId ?? "";
      const actual = mapa.get(id) ?? { nombre: nombreEntidad(f.vendor.entity_id), bruto: 0, retenido: 0, neto: 0, filas: [] as typeof filas };
      actual.bruto += f.bruto;
      actual.retenido += f.retenido;
      actual.neto += f.neto;
      actual.filas.push(f);
      mapa.set(id, actual);
    }
    return [...mapa.values()];
  }, [filas, entidadId, nombreEntidad]);

  async function registrarCorrida() {
    if (filas.length === 0) return;
    setGuardando(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setGuardando(false);
      return;
    }

    const inserts = filas.map((f) => ({
      owner_id: ownerIdEfectivo ?? user.id,
      // Entidad del CONTRATISTA, no la entidad activa de la página (4 sept
      // 2026, fix de raíz junto con el modal de confirmación) — en "vista
      // global" esta tabla mezcla contratistas de varias entidades, y antes
      // TODAS las filas de la corrida quedaban registradas bajo una sola
      // entidad fija (la primera de la lista), sin importar de cuál era
      // cada contratista de verdad.
      entity_id: f.vendor.entity_id ?? entidadId,
      vendor_id: f.vendor.id,
      gross_amount: f.bruto,
      retention_pct: f.pct,
      retention_amount: f.retenido,
      period_start: fechaPago,
      period_end: fechaPago,
      remittance_status: "pendiente",
    }));

    const { data: nuevasRetenciones, error: insertError } = await supabase
      .from("vendor_retenciones")
      .insert(inserts)
      .select("id, vendor_id");
    setGuardando(false);
    setMostrarConfirmacion(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Sube las facturas que se adjuntaron mientras se armaba la corrida,
    // ahora que ya existe el id real de cada vendor_retencion. Si una sube
    // falla no se revierte el pago (ya quedó registrado) — solo se avisa.
    if (nuevasRetenciones) {
      for (const r of nuevasRetenciones) {
        const archivos = archivosPendientes[r.vendor_id] ?? [];
        for (const file of archivos) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("vendorRetencionId", r.id);
          const res = await fetch("/api/pagos/adjuntos/upload", { method: "POST", body: formData });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            setAdjuntosPorRetencion((prev) => ({
              ...prev,
              [r.id]: [...(prev[r.id] ?? []), { id: data.id, nombre_archivo: file.name }],
            }));
          } else {
            setError(`No se pudo subir "${file.name}": ${data.error ?? "error desconocido"}`);
          }
        }
      }
    }

    setResultado(filas.map((f) => ({ nombre: f.vendor.name, neto: f.neto })));
    setResultadoIds((nuevasRetenciones ?? []).map((r) => r.id));
    setResultadoEntityId(inserts[0]?.entity_id ?? null);
    setMontos({});
    setArchivosPendientes({});
    setCopiado(false);
    router.refresh();
  }

  // Contenido del modal de confirmación — un solo contratista de una sola
  // entidad muestra el desglose tal cual el mockup ("Le pagas"/"Retención");
  // varios contratistas de la MISMA entidad muestran el total agregado; y si
  // hay más de una entidad mezclada (vista global), se lista cada una con su
  // propio subtotal para que quede clarísimo qué le toca a cuál.
  const soloUnGrupo = gruposPorEntidad.length === 1 ? gruposPorEntidad[0] : null;
  const descripcionConfirmacion =
    filas.length === 1
      ? `Vas a registrar un pago a ${filas[0].vendor.name} por ${formatMoney(filas[0].bruto)}`
      : `Vas a registrar ${filas.length} pagos por un total de ${formatMoney(totalBruto)}`;
  const entidadNombreConfirmacion = soloUnGrupo
    ? soloUnGrupo.nombre
    : `${gruposPorEntidad.length} entidades distintas`;
  const lineasConfirmacion: LineaConfirmacion[] = soloUnGrupo
    ? filas.length === 1
      ? [
          { label: "Le pagas", valor: formatMoney(filas[0].neto) },
          ...(filas[0].retenido > 0
            ? [{ label: `Retención ${filas[0].pct}% → Hacienda`, valor: formatMoney(filas[0].retenido), tono: "amb" as const }]
            : []),
        ]
      : [
          { label: "Total bruto", valor: formatMoney(totalBruto) },
          ...(totalRetenido > 0 ? [{ label: "Retención total → Hacienda", valor: formatMoney(totalRetenido), tono: "amb" as const }] : []),
          { label: "Total neto a pagar", valor: formatMoney(totalNeto) },
        ]
    : gruposPorEntidad.map((g) => ({ label: g.nombre, valor: formatMoney(g.neto) }));

  function copiarResultado() {
    if (!resultado) return;
    const texto = resultado.map((r) => `${r.nombre}\t${r.neto.toFixed(2)}`).join("\n");
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  // Historial reciente — últimas 20 retenciones, con el nombre del
  // contratista resuelto localmente (retenciones solo trae vendor_id). Se
  // deriva directamente del prop `retenciones` (no una copia local aparte)
  // porque router.refresh() actualiza props sin remontar este componente —
  // una copia en useState() nunca vería esa actualización. `eliminados` es
  // solo para que el borrado se sienta instantáneo mientras se espera el
  // refresh del servidor.
  const vendorPorId = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const [eliminados, setEliminados] = useState<Set<string>>(new Set());
  const historialOrdenado = useMemo(
    () =>
      retenciones
        .filter((r) => !eliminados.has(r.id))
        .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "") || b.created_at.localeCompare(a.created_at))
        .slice(0, 20),
    [retenciones, eliminados]
  );
  const nachaSeleccionables = useMemo(() => historialOrdenado.filter((r) => r.remittance_status === "pendiente"), [historialOrdenado]);

  async function eliminarRetencion(id: string) {
    if (!confirm("¿Eliminar este registro de pago? Esto no revierte nada en el banco, solo borra el número de aquí.")) return;
    setEliminados((prev) => new Set(prev).add(id));
    const { error: deleteError } = await supabase.from("vendor_retenciones").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      setEliminados((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    router.refresh();
  }

  if (activos.length === 0) {
    return (
      <div className="vc-card text-center">
        <i className="ti ti-users mb-2 text-2xl text-teal" />
        <p className="mb-1 text-sm font-medium">Todavía no tienes contratistas activos</p>
        <p className="text-xs text-muted">Ve al tab "Contratistas" y añade a los que les pagas por servicios profesionales.</p>
      </div>
    );
  }

  return (
    <>
      <div className="vc-card mb-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">Corrida de pago</p>
          <input
            type="date"
            className="vc-input flex-shrink-0"
            style={{ width: "auto" }}
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
          />
        </div>
        {/* 30 sept 2026, feedback de Joel: esto era un párrafo text-xs muted
            — "muy peq y no llama la atención" para un número que de verdad
            importa (lo que va a tener que depositar). Ahora son dos cajas
            con el monto grande, mismo tratamiento visual que la tarjeta de
            Depósito 480.9A en Reportes. */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-amb/30 bg-amb/5 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">Retenido en {nombreMes(mesActualStr)}</p>
            <p className="text-base font-semibold text-amb">{formatMoney(retenidoMes)}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              Q{trimestreActual} {anioActual}
            </p>
            <p className="text-base font-semibold text-text">{formatMoney(retenidoTrimestre)}</p>
          </div>
        </div>

        {error && <p className="mb-2 text-xs text-red">{error}</p>}

        <div className="flex flex-col divide-y divide-border">
          {activos.map((v) => {
            const bruto = montos[v.id] || "";
            const pct = pcts[v.id] !== undefined ? pcts[v.id] : String(v.default_retention_pct);
            const brutoNum = Number(bruto || 0);
            const pctNum = Number(pct || 0);
            const retenido = retencionMarginal(acumuladoAnual.get(v.id) ?? 0, brutoNum, pctNum);
            const neto = brutoNum - retenido;
            const faltaRelevo = brutoNum > 0 && pctNum < 10 && estadoRelevo(v, fechaPago) !== "vigente";
            return (
              <div key={v.id} className={faltaRelevo ? "py-2.5" : "flex items-center gap-2 py-2.5"}>
              {faltaRelevo ? (
                <div className="rounded-lg border border-red/30 bg-red/5 p-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                      style={{ background: colorAvatar(v.id) }}
                    >
                      {iniciales(v.name)}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm">{v.name}</p>
                    <button
                      type="button"
                      onClick={() => abrirArchivoCorrida(v.id)}
                      className={`relative flex-shrink-0 ${
                        (archivosPendientes[v.id]?.length ?? 0) > 0 ? "text-teal" : "text-muted hover:text-teal"
                      }`}
                      title="Adjuntar factura de este pago"
                    >
                      <i className="ti ti-paperclip" style={{ fontSize: 14 }} />
                      {(archivosPendientes[v.id]?.length ?? 0) > 0 && (
                        <span
                          className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-medium text-white"
                          style={{ background: "#1D9E75" }}
                        >
                          {archivosPendientes[v.id]!.length}
                        </span>
                      )}
                    </button>
                    <div className="relative flex-shrink-0">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                      <input
                        className="vc-input"
                        style={{ width: 128, paddingLeft: 22 }}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={bruto}
                        onChange={(e) => setMontos((prev) => ({ ...prev, [v.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <input
                        className="vc-input flex-shrink-0"
                        style={{ width: 68 }}
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={pct}
                        onChange={(e) => setPcts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                      />
                      <span className="text-xs text-muted">%</span>
                    </div>
                    <span className="w-16 flex-shrink-0 text-right text-xs text-amb">-{formatMoney(retenido)}</span>
                    <span className="w-20 flex-shrink-0 text-right text-sm font-medium">
                      {formatMoney(brutoNum > 0 ? neto : 0)}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-10 text-[11px] text-red">
                    ⚠️ Le estás aplicando {pctNum}% pero no tiene Certificado de Relevo vigente archivado — sin ese papel
                    Hacienda exige el 10% completo. Súbelo en "Contratistas" o pon el % en 10 para poder registrar.
                  </p>
                </div>
              ) : (
                <>
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ background: colorAvatar(v.id) }}
                >
                  {iniciales(v.name)}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm">{v.name}</p>
                <button
                  type="button"
                  onClick={() => abrirArchivoCorrida(v.id)}
                  className={`relative flex-shrink-0 ${
                    (archivosPendientes[v.id]?.length ?? 0) > 0 ? "text-teal" : "text-muted hover:text-teal"
                  }`}
                  title="Adjuntar factura de este pago"
                >
                  <i className="ti ti-paperclip" style={{ fontSize: 14 }} />
                  {(archivosPendientes[v.id]?.length ?? 0) > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-medium text-white"
                      style={{ background: "#1D9E75" }}
                    >
                      {archivosPendientes[v.id]!.length}
                    </span>
                  )}
                </button>
                <div className="relative flex-shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <input
                    className="vc-input"
                    style={{ width: 128, paddingLeft: 22 }}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={bruto}
                    onChange={(e) => setMontos((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <input
                    className="vc-input flex-shrink-0"
                    style={{ width: 68 }}
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={pct}
                    onChange={(e) => setPcts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
                <span className="w-16 flex-shrink-0 text-right text-xs text-amb">-{formatMoney(retenido)}</span>
                <span className="w-20 flex-shrink-0 text-right text-sm font-medium">{formatMoney(brutoNum > 0 ? neto : 0)}</span>
                </>
              )}
              </div>
            );
          })}
        </div>

        {filas.length > 0 && (
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted">
              Bruto {formatMoney(totalBruto)} · Retenido {formatMoney(totalRetenido)}
            </span>
            <span className="font-medium">Neto {formatMoney(totalNeto)}</span>
          </div>
        )}

        {Object.values(archivosPendientes).some((files) => files.length > 0) && (
          <div className="mt-2 rounded-lg border border-border bg-bg p-2">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Facturas adjuntas a esta corrida</p>
            {Object.entries(archivosPendientes).flatMap(([vendorId, files]) =>
              files.map((file, idx) => (
                <div key={`${vendorId}-${idx}`} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {activos.find((v) => v.id === vendorId)?.name ?? "Contratista"} — {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarArchivoPendiente(vendorId, idx)}
                    className="flex-shrink-0 text-muted hover:text-red"
                    title="Quitar"
                  >
                    <i className="ti ti-x" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <input
          ref={inputArchivoCorridaRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={agregarArchivosPendientes}
        />

        {filasConProblemaRelevo.length > 0 && (
          <p className="mt-2 text-[11px] text-red">
            ⚠️ No se puede registrar la corrida: {filasConProblemaRelevo.length === 1 ? "hay un contratista" : `hay ${filasConProblemaRelevo.length} contratistas`} con % reducido sin Relevo vigente (marcados arriba en rojo).
          </p>
        )}
        <button
          className="vc-btn-primary mt-3"
          disabled={filas.length === 0 || guardando || filasConProblemaRelevo.length > 0}
          onClick={() => setMostrarConfirmacion(true)}
        >
          {guardando ? "Guardando..." : `Registrar corrida${filas.length > 0 ? ` (${filas.length})` : ""}`}
        </button>
      </div>

      <ConfirmarPagoModal
        abierto={mostrarConfirmacion}
        descripcion={descripcionConfirmacion}
        entidadNombre={entidadNombreConfirmacion}
        lineas={lineasConfirmacion}
        confirmando={guardando}
        onConfirmar={registrarCorrida}
        onCancelar={() => setMostrarConfirmacion(false)}
      />

      {resultado && (
        <div className="vc-card mb-3 border border-teal">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-teal">Listo — esto es lo que subes al ACH de BPPR</p>
            <button className="text-xs font-medium text-teal hover:opacity-80" onClick={copiarResultado}>
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          {resultado.map((r) => (
            <div key={r.nombre} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
              <span>{r.nombre}</span>
              <span className="font-medium">{formatMoney(r.neto)}</span>
            </div>
          ))}
          {resultadoIds.length > 0 && (
            <button
              type="button"
              disabled={descargandoNacha}
              className="vc-btn-secondary mt-2 w-full text-xs"
              onClick={() => descargarNacha(resultadoIds, resultadoEntityId ?? undefined)}
            >
              {descargandoNacha ? "Generando..." : "Descargar archivo ACH de esta corrida"}
            </button>
          )}
          {nachaError && <p className="mt-2 text-xs text-red">{nachaError}</p>}
          {nachaAvisos && <p className="mt-2 text-xs text-amb">{nachaAvisos}</p>}
        </div>
      )}

      {/* Evidencia también disponible para Administrador (12 sept 2026 — ya no
          se oculta con !modoAdmin: RLS 0086 + los 3 API routes de
          /api/pagos/adjuntos ya resuelven el owner_id efectivo del negocio). */}
      <input
        ref={inputCamaraEvidenciaRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={subirEvidenciaPago}
      />
      <input
        ref={inputArchivoEvidenciaRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={subirEvidenciaPago}
      />

      <SeccionColapsable titulo={`Pagos recientes${historialOrdenado.length > 0 ? ` (${historialOrdenado.length})` : ""}`} defaultAbierta={false}>
        {historialOrdenado.length === 0 && <p className="text-xs text-muted">Todavía no has registrado ningún pago.</p>}
        {/* Selección para archivo ACH/NACHA (30 sept 2026, pedido de Joel: el
            otro camino además de copiar/pegar — un archivo .ach para subir
            al portal del banco). Solo pagos "pendiente" (los ya remesados no
            hace falta volver a pagarlos). */}
        {nachaSeleccionables.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal/30 bg-teal/5 px-2.5 py-2">
            <label className="flex min-w-0 items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={seleccionNacha.size > 0 && seleccionNacha.size === nachaSeleccionables.length}
                onChange={(e) =>
                  setSeleccionNacha(e.target.checked ? new Set(nachaSeleccionables.map((r) => r.id)) : new Set())
                }
              />
              <span className="truncate">
                {seleccionNacha.size > 0 ? `${seleccionNacha.size} seleccionado(s)` : "Seleccionar todos los pendientes"}
              </span>
            </label>
            <button
              type="button"
              disabled={seleccionNacha.size === 0 || descargandoNacha}
              className="vc-btn-secondary flex-shrink-0 whitespace-nowrap text-xs"
              onClick={() => descargarNacha()}
            >
              {descargandoNacha ? "Generando..." : "Descargar archivo ACH"}
            </button>
          </div>
        )}
        {nachaError && <p className="mb-2 text-xs text-red">{nachaError}</p>}
        {nachaAvisos && <p className="mb-2 text-xs text-amb">{nachaAvisos}</p>}
        {historialOrdenado.map((r) => {
          const v = vendorPorId.get(r.vendor_id);
          const adjuntos = adjuntosPorRetencion[r.id] ?? [];
          const evidenciaAbierta = evidenciaAbiertaId === r.id;
          return (
            <div key={r.id} className="border-b border-border py-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                {r.remittance_status === "pendiente" && (
                  <input
                    type="checkbox"
                    className="flex-shrink-0"
                    checked={seleccionNacha.has(r.id)}
                    onChange={(e) =>
                      setSeleccionNacha((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">{v?.name ?? "Contratista eliminado"}</p>
                  <p className="text-xs text-muted">
                    {formatFecha(r.period_start)} · Bruto {formatMoney(Number(r.gross_amount))} · Retenido{" "}
                    {formatMoney(Number(r.retention_amount))} ({Number(r.retention_pct)}%)
                  </p>
                </div>
                <span className="flex-shrink-0 text-sm font-medium">{formatMoney(Number(r.net_paid))}</span>
                <button
                  onClick={() => setEvidenciaAbiertaId(evidenciaAbierta ? null : r.id)}
                  className={`relative flex-shrink-0 ${adjuntos.length > 0 ? "text-teal" : "text-muted hover:text-teal"}`}
                  title="Evidencia (factura/recibo del pago)"
                >
                  <i className="ti ti-paperclip" style={{ fontSize: 14 }} />
                  {adjuntos.length > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-medium text-white"
                      style={{ background: "#1D9E75" }}
                    >
                      {adjuntos.length}
                    </span>
                  )}
                </button>
                <button onClick={() => eliminarRetencion(r.id)} className="flex-shrink-0 text-muted hover:text-red" title="Eliminar">
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              </div>

              {evidenciaAbierta && (
                <div className="mt-2 rounded-lg border border-border bg-bg p-2">
                  {adjuntos.length > 0 && (
                    <div className="mb-2 grid grid-cols-4 gap-1.5">
                      {adjuntos.map((a) => (
                        <div key={a.id} className="relative overflow-hidden rounded-lg border border-border">
                          <a href={`/api/pagos/adjuntos/${a.id}/ver`} target="_blank" rel="noopener noreferrer" className="block">
                            {esImagenPago(a.nombre_archivo) ? (
                              <img src={`/api/pagos/adjuntos/${a.id}/ver`} alt={a.nombre_archivo} className="h-14 w-full object-cover" />
                            ) : (
                              <div className="flex h-14 w-full items-center justify-center bg-card">
                                <i className="ti ti-file-text text-lg text-muted" />
                              </div>
                            )}
                          </a>
                          <button
                            type="button"
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-50"
                            disabled={borrandoEvidenciaId === a.id}
                            onClick={() => borrarEvidenciaPago(r.id, a.id)}
                            title="Eliminar"
                          >
                            <i className="ti ti-x" style={{ fontSize: 10 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={subiendoEvidenciaId === r.id}
                      className="flex-1 rounded-pill border border-border py-1.5 text-xs font-medium hover:opacity-80 disabled:opacity-50"
                      onClick={() => abrirCamaraEvidencia(r.id)}
                    >
                      📷 Foto
                    </button>
                    <button
                      type="button"
                      disabled={subiendoEvidenciaId === r.id}
                      className="flex-1 rounded-pill border border-border py-1.5 text-xs font-medium hover:opacity-80 disabled:opacity-50"
                      onClick={() => abrirArchivoEvidencia(r.id)}
                    >
                      📁 {subiendoEvidenciaId === r.id ? "Subiendo..." : "Añadir"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </SeccionColapsable>
    </>
  );
}

// ============================================================================
// Tab: Contratistas — catálogo (calcado de ServiciosTab en Facturación). Se
// archiva en vez de borrar (toggle "active") porque vendor_retenciones tiene
// ON DELETE CASCADE hacia vendors — borrar de verdad se llevaría el
// historial de pagos/retenciones del contratista.
// ============================================================================
function ContratistasTab({
  vendors,
  retenciones,
  entidadId,
  retencionDefault,
  ownerIdEfectivo,
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
  retencionDefault: number;
  ownerIdEfectivo?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(vendors);
  const acumuladoAnual = useMemo(() => acumuladoAnualPorVendor(retenciones, new Date().getFullYear()), [retenciones]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 30 sept 2026, pedido de Joel: con varios contratistas y la pantalla
  // scrolleada abajo, al darle editar al último el formulario se abría
  // arriba (fuera de vista) y parecía que no pasaba nada. Ahora hace scroll
  // automático hacia el formulario en cuanto se abre (nuevo o editar).
  const formVendorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formAbierto) {
      formVendorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [formAbierto]);

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  // Migración 0119 (30 sept 2026, pedido de Joel): dirección postal, para
  // enviarle al contratista su copia del Modelo 480.6SP por correo.
  const [address, setAddress] = useState("");
  const [retentionType, setRetentionType] = useState<(typeof TIPOS_RETENCION)[number]["value"]>("480.6B");
  const [pct, setPct] = useState(String(retencionDefault));
  // Migración 0112 (30 sept 2026) — segundo eje del Modelo 480.6SP, junto a
  // retentionType decide la casilla real (1/2/3/4, ver casilla480_6SP()).
  const [isCorporation, setIsCorporation] = useState(false);

  // Relevo de Retención por contratista (migración 0116, 30 sept 2026).
  // Solo tiene sentido cuando ya existe el vendor (necesita el id para
  // subir el PDF a R2) — por eso el bloque de UI más abajo solo se muestra
  // editando, no al crear uno nuevo.
  const [relevoVendor, setRelevoVendor] = useState<Vendor | null>(null);
  const [relevoArchivo, setRelevoArchivo] = useState<File | null>(null);
  const [relevoPctForm, setRelevoPctForm] = useState<"6" | "0">("6");
  const [relevoFechaExp, setRelevoFechaExp] = useState("");
  const [relevoSubiendo, setRelevoSubiendo] = useState(false);
  const [relevoError, setRelevoError] = useState<string | null>(null);

  // Certificado de Registro de Comerciante por contratista (migración 0122,
  // 1 oct 2026, #788) — mismo patrón que el Relevo justo arriba, pero sin
  // % ni fecha de expiración (no vence).
  const [registroArchivo, setRegistroArchivo] = useState<File | null>(null);
  const [registroSubiendo, setRegistroSubiendo] = useState(false);
  const [registroError, setRegistroError] = useState<string | null>(null);

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setName("");
    setTaxId("");
    setAddress("");
    setRetentionType("480.6B");
    setPct(String(retencionDefault));
    setIsCorporation(false);
    setRelevoVendor(null);
    setRegistroArchivo(null);
    setRegistroError(null);
    setError(null);
  }

  function abrirEditar(v: Vendor) {
    setFormAbierto(v.id);
    setName(v.name);
    setTaxId(v.tax_id ?? "");
    setAddress(v.address ?? "");
    setRetentionType((v.retention_type as (typeof TIPOS_RETENCION)[number]["value"]) || "480.6B");
    setPct(String(v.default_retention_pct));
    setIsCorporation(v.is_corporation ?? false);
    setRelevoVendor(v);
    setRelevoArchivo(null);
    setRelevoPctForm(v.relevo_pct === 0 ? "0" : "6");
    setRelevoFechaExp(v.relevo_fecha_expiracion ?? "");
    setRelevoError(null);
    setRegistroArchivo(null);
    setRegistroError(null);
    setError(null);
  }

  async function subirRelevo() {
    if (!relevoVendor || !relevoArchivo || !relevoFechaExp) return;
    setRelevoSubiendo(true);
    setRelevoError(null);
    const fd = new FormData();
    fd.append("file", relevoArchivo);
    fd.append("vendorId", relevoVendor.id);
    fd.append("relevoPct", relevoPctForm);
    fd.append("relevoFechaExpiracion", relevoFechaExp);
    const res = await fetch("/api/pagos/vendors/relevo/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setRelevoSubiendo(false);
    if (!res.ok) {
      setRelevoError(json?.error ?? "No se pudo subir el relevo.");
      return;
    }
    const actualizado: Vendor = {
      ...relevoVendor,
      relevo_r2_key: json.key,
      relevo_pct: Number(relevoPctForm),
      relevo_fecha_expiracion: relevoFechaExp,
    };
    setRelevoVendor(actualizado);
    setRelevoArchivo(null);
    setLista((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
  }

  async function borrarRelevo() {
    if (!relevoVendor) return;
    setRelevoSubiendo(true);
    setRelevoError(null);
    const res = await fetch(`/api/pagos/vendors/${relevoVendor.id}/relevo`, { method: "DELETE" });
    setRelevoSubiendo(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setRelevoError(json?.error ?? "No se pudo borrar el relevo.");
      return;
    }
    const actualizado: Vendor = { ...relevoVendor, relevo_r2_key: null, relevo_pct: null, relevo_fecha_expiracion: null };
    setRelevoVendor(actualizado);
    setRelevoFechaExp("");
    setLista((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
  }

  async function subirRegistroComerciante() {
    if (!relevoVendor || !registroArchivo) return;
    setRegistroSubiendo(true);
    setRegistroError(null);
    const fd = new FormData();
    fd.append("file", registroArchivo);
    fd.append("vendorId", relevoVendor.id);
    const res = await fetch("/api/pagos/vendors/registro-comerciante/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setRegistroSubiendo(false);
    if (!res.ok) {
      setRegistroError(json?.error ?? "No se pudo subir el Registro de Comerciante.");
      return;
    }
    const actualizado: Vendor = { ...relevoVendor, registro_comerciante_r2_key: json.key };
    setRelevoVendor(actualizado);
    setRegistroArchivo(null);
    setLista((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
  }

  async function borrarRegistroComerciante() {
    if (!relevoVendor) return;
    setRegistroSubiendo(true);
    setRegistroError(null);
    const res = await fetch(`/api/pagos/vendors/${relevoVendor.id}/registro-comerciante`, { method: "DELETE" });
    setRegistroSubiendo(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setRegistroError(json?.error ?? "No se pudo borrar el Registro de Comerciante.");
      return;
    }
    const actualizado: Vendor = { ...relevoVendor, registro_comerciante_r2_key: null };
    setRelevoVendor(actualizado);
    setLista((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
  }

  function cambiarTipoRetencion(valor: (typeof TIPOS_RETENCION)[number]["value"]) {
    setRetentionType(valor);
    setPct(valor === "480.6A" ? "0" : String(retencionDefault));
  }

  async function guardar() {
    if (!name.trim()) return;
    setGuardando(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setGuardando(false);
      return;
    }

    if (formAbierto === "nuevo") {
      const { data, error: insertError } = await supabase
        .from("vendors")
        .insert({
          owner_id: ownerIdEfectivo ?? user.id,
          entity_id: entidadId,
          name: name.trim(),
          tax_id: taxId.trim() || null,
          address: address.trim() || null,
          vendor_type: "contratista_servicios",
          retention_type: retentionType,
          default_retention_pct: Number(pct || 0),
          is_corporation: isCorporation,
          active: true,
        })
        .select(
          "id, name, tax_id, address, vendor_type, retention_type, default_retention_pct, is_corporation, active, entity_id"
        )
        .single();
      setGuardando(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "No se pudo guardar.");
        return;
      }
      setLista((prev) => [data as Vendor, ...prev]);
      // 30 sept 2026, pedido de Joel: no cerrar el formulario tras crear —
      // pasar a modo "editar" sobre el contratista recién guardado para que
      // de una vez aparezcan Relevo y Cuenta Bancaria, sin tener que cerrar
      // y reabrir manualmente.
      abrirEditar(data as Vendor);
      router.refresh();
    } else if (formAbierto) {
      const { error: updateError } = await supabase
        .from("vendors")
        .update({
          name: name.trim(),
          tax_id: taxId.trim() || null,
          address: address.trim() || null,
          retention_type: retentionType,
          default_retention_pct: Number(pct || 0),
          is_corporation: isCorporation,
        })
        .eq("id", formAbierto);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setLista((prev) =>
        prev.map((v) =>
          v.id === formAbierto
            ? {
                ...v,
                name: name.trim(),
                tax_id: taxId.trim() || null,
                address: address.trim() || null,
                retention_type: retentionType,
                default_retention_pct: Number(pct || 0),
                is_corporation: isCorporation,
              }
            : v
        )
      );
      setFormAbierto(null);
      router.refresh();
    }
  }

  async function toggleActivo(v: Vendor) {
    const { error: updateError } = await supabase.from("vendors").update({ active: !v.active }).eq("id", v.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === v.id ? { ...x, active: !x.active } : x)));
    router.refresh();
  }

  const filtrados = useMemo(() => {
    return lista.filter((v) => {
      if (filtro === "archivados") return !v.active;
      if (filtro === "activos" && !v.active) return false;
      if (busqueda.trim() && !v.name.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [lista, filtro, busqueda]);

  return (
    <>
      {/* Importador de pagos históricos (30 sept 2026, pedido de Joel: un
          contratista que llega a mitad de año con data de otro sistema no
          debería esperar a enero para que el acumulado de $500 y el
          480.6SP le funcionen) — ver /api/pagos/csv/importar. Primero era
          un link de texto 11px que "pasaba desapercibido", luego se pasó a
          vc-btn-secondary (gris apagado) pero Joel dijo que "casi ni se
          ve" — ahora es un botón teal sólido, mismo peso visual que
          "Registrar corrida" y el resto de las acciones primarias. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/dashboard/pagos/importar${entidadId ? `?entidadId=${entidadId}` : ""}`}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75" }}
        >
          <i className="ti ti-file-upload" style={{ fontSize: 14 }} />
          Importar histórico (CSV)
        </Link>
        <Link
          href={`/dashboard/pagos/importaciones${entidadId ? `?entidadId=${entidadId}` : ""}`}
          className="text-xs font-medium text-muted hover:text-teal"
        >
          Importaciones anteriores
        </Link>
      </div>

      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar contratista..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="vc-input flex-shrink-0 px-1.5"
          style={{ width: 100 }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          <option value="archivados">Archivados</option>
        </select>
        <button
          onClick={abrirNuevo}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nuevo
        </button>
      </div>

      {formAbierto && (
        <div ref={formVendorRef} className="vc-card mb-3 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-wide text-muted">
            {formAbierto === "nuevo" ? "Nuevo contratista" : "Editar contratista"}
          </p>
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="vc-input"
            placeholder="Tax ID / SSN (opcional)"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
          <input
            className="vc-input"
            placeholder="Dirección postal (para enviarle su 480.6SP)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="vc-input flex-1"
              value={retentionType}
              onChange={(e) => cambiarTipoRetencion(e.target.value as (typeof TIPOS_RETENCION)[number]["value"])}
            >
              {TIPOS_RETENCION.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex w-20 flex-shrink-0 items-center gap-1">
              <input
                className="vc-input"
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={retentionType === "480.6A"}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <span className="text-xs text-muted">%</span>
            </div>
          </div>
          {/* Migración 0112 (30 sept 2026) — junto a retentionType decide la
              casilla real del 480.6SP (1/2/3/4, ver casilla480_6SP()). */}
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={isCorporation} onChange={(e) => setIsCorporation(e.target.checked)} />
            Es corporación o entidad (no individuo)
          </label>
          <p className="text-[11px] text-muted">
            {casilla480_6SP({ retention_type: retentionType, is_corporation: isCorporation }).label}
          </p>

          {/* Relevo de Retención (migración 0116, 30 sept 2026) — solo
              aplica a un contratista ya guardado, y solo tiene sentido si
              está sujeto a retención (si no, no hay nada que relevar). */}
          {relevoVendor && retentionType === "480.6B" && (
            <div className="rounded-lg border border-border bg-bg p-2.5">
              <p className="mb-1.5 text-xs font-medium">Certificado de Relevo de SURI</p>
              {relevoVendor.relevo_r2_key ? (
                <>
                  <p className="mb-1.5 text-[11px] text-muted">
                    Archivado: {relevoVendor.relevo_pct}% de retención, vence{" "}
                    {relevoVendor.relevo_fecha_expiracion ? formatFecha(relevoVendor.relevo_fecha_expiracion) : "sin fecha"} —{" "}
                    <span
                      className={
                        estadoRelevo(relevoVendor, hoyISO()) === "vigente" ? "font-medium text-teal" : "font-medium text-red"
                      }
                    >
                      {estadoRelevo(relevoVendor, hoyISO()) === "vigente" ? "vigente" : "VENCIDO"}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={`/api/pagos/vendors/${relevoVendor.id}/relevo`}
                      target="_blank"
                      className="text-[11px] font-medium text-teal hover:opacity-80"
                    >
                      Ver PDF
                    </a>
                    <button
                      className="text-[11px] font-medium text-red hover:opacity-80"
                      disabled={relevoSubiendo}
                      onClick={borrarRelevo}
                    >
                      Quitar relevo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-1.5 text-[11px] text-muted">
                    Sin relevo archivado — a este contratista se le retiene 10% completo aunque le pongas un % menor arriba,
                    hasta que subas su Certificado de Relevo.
                  </p>
                  <div className="mb-1.5 flex gap-2">
                    <select
                      className="vc-input flex-1"
                      value={relevoPctForm}
                      onChange={(e) => setRelevoPctForm(e.target.value as "6" | "0")}
                    >
                      <option value="6">Relevo parcial (6%)</option>
                      <option value="0">Relevo total (0%)</option>
                    </select>
                    <input
                      className="vc-input flex-1"
                      type="date"
                      value={relevoFechaExp}
                      onChange={(e) => setRelevoFechaExp(e.target.value)}
                    />
                  </div>
                  <input
                    className="vc-input mb-1.5 w-full text-xs"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setRelevoArchivo(e.target.files?.[0] ?? null)}
                  />
                  {relevoError && <p className="mb-1.5 text-[11px] text-red">{relevoError}</p>}
                  <button
                    className="vc-btn-primary w-full text-xs"
                    disabled={!relevoArchivo || !relevoFechaExp || relevoSubiendo}
                    onClick={subirRelevo}
                  >
                    {relevoSubiendo ? "Subiendo..." : "Subir Certificado de Relevo"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Certificado de Registro de Comerciante (migración 0122, 1 oct
              2026, #788) — a diferencia del Relevo, aplica a CUALQUIER
              contratista (no solo los sujetos a retención): es la pieza que
              completa el expediente digital que respalda ante una auditoría
              de reclasificación (Depto. del Trabajo/Hacienda) que este
              contratista opera un negocio independiente legítimo. */}
          {relevoVendor && (
            <div className="rounded-lg border border-border bg-bg p-2.5">
              <p className="mb-1.5 text-xs font-medium">Certificado de Registro de Comerciante</p>
              {relevoVendor.registro_comerciante_r2_key ? (
                <>
                  <p className="mb-1.5 text-[11px] text-muted">Archivado — parte del expediente anti-reclasificación.</p>
                  <div className="flex gap-2">
                    <a
                      href={`/api/pagos/vendors/${relevoVendor.id}/registro-comerciante`}
                      target="_blank"
                      className="text-[11px] font-medium text-teal hover:opacity-80"
                    >
                      Ver PDF
                    </a>
                    <button
                      className="text-[11px] font-medium text-red hover:opacity-80"
                      disabled={registroSubiendo}
                      onClick={borrarRegistroComerciante}
                    >
                      Quitar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-1.5 text-[11px] text-muted">
                    Sin archivar — junto con el tax_id y el Relevo, respalda ante Hacienda/Depto. del Trabajo que este
                    contratista opera un negocio independiente, no un empleado disfrazado.
                  </p>
                  <input
                    className="vc-input mb-1.5 w-full text-xs"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setRegistroArchivo(e.target.files?.[0] ?? null)}
                  />
                  {registroError && <p className="mb-1.5 text-[11px] text-red">{registroError}</p>}
                  <button
                    className="vc-btn-primary w-full text-xs"
                    disabled={!registroArchivo || registroSubiendo}
                    onClick={subirRegistroComerciante}
                  >
                    {registroSubiendo ? "Subiendo..." : "Subir Registro de Comerciante"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Cuenta bancaria del contratista (migración 0118, 30 sept 2026)
              — para el archivo NACHA. Igual que el Relevo, solo aplica a un
              contratista ya guardado (necesita el id real). */}
          {relevoVendor && <CuentaBancariaVendor vendor={relevoVendor} />}

          <div className="flex gap-2">
            <button className="vc-btn-primary flex-1" disabled={!name.trim() || guardando} onClick={guardar}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="flex-shrink-0 px-3 text-xs text-muted hover:opacity-80" onClick={() => setFormAbierto(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Contratistas <span className="normal-case text-muted">· {filtrados.length}</span>
        </p>

        {lista.length === 0 && (
          <p className="text-xs text-muted">Todavía no tienes contratistas. Dale a "+ Nuevo" arriba para añadir al primero.</p>
        )}
        {lista.length > 0 && filtrados.length === 0 && <p className="text-xs text-muted">No hay contratistas que coincidan.</p>}

        {filtrados.map((v) => {
          const acumulado = acumuladoAnual.get(v.id) ?? 0;
          const pasoDeclarar = acumulado >= UMBRAL_DECLARAR_DOLARES;
          return (
            <div key={v.id} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ background: colorAvatar(v.id) }}
                >
                  {iniciales(v.name)}
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => abrirEditar(v)}>
                  <p className="truncate">
                    {v.name} {!v.active && <span className="text-xs text-muted">(archivado)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {`Casilla ${casilla480_6SP(v).numero}`}
                    {v.retention_type === "480.6B" ? ` · ${Number(v.default_retention_pct)}%` : " · exento"}
                    {v.tax_id ? ` · ${v.tax_id}` : ""}
                  </p>
                  {/* Relevo por contratista (30 sept 2026): solo tiene sentido
                      mostrarlo cuando el % aplicado es menor a 10 — ahí es
                      donde hace falta el papel que lo respalde. */}
                  {v.retention_type === "480.6B" && Number(v.default_retention_pct) < 10 && (
                    <p className="truncate text-[11px]">
                      {estadoRelevo(v, hoyISO()) === "vigente" && <span className="text-teal">Relevo vigente</span>}
                      {estadoRelevo(v, hoyISO()) === "vencido" && (
                        <span className="font-medium text-red">⚠️ Relevo VENCIDO</span>
                      )}
                      {estadoRelevo(v, hoyISO()) === "ninguno" && (
                        <span className="font-medium text-amb">⚠️ Sin relevo archivado</span>
                      )}
                    </p>
                  )}
                </button>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button onClick={() => abrirEditar(v)} className="text-muted hover:text-teal">
                    <i className="ti ti-edit" style={{ fontSize: 15 }} />
                  </button>
                  <button
                    onClick={() => toggleActivo(v)}
                    className="text-xs font-medium text-muted hover:text-teal"
                    title={v.active ? "Archivar" : "Reactivar"}
                  >
                    <i className={`ti ${v.active ? "ti-archive" : "ti-refresh"}`} style={{ fontSize: 15 }} />
                  </button>
                </div>
              </div>
              {/* Umbral de Hacienda PR, Sección 1062.03 (29 sept 2026, pedido
                  de Joel: "que el sistema lo calcule y me avise... eso le da
                  valor", corregido 30 sept 2026 — un solo umbral de $500, la
                  retención aplica sobre el exceso, no sobre el pago completo).
                  Aviso informativo, no cambia retention_type ni el % a mano. */}
              {pasoDeclarar && (
                <p className="ml-11 mt-1 rounded-md bg-amb/10 px-2 py-1 text-[11px] text-amb">
                  ⚠️ Le llevas pagado {formatMoney(acumulado)} este año — pasó los $500 de la Sección 1062.03. Hay que
                  declararlo en el Modelo 480.6SP; si está sujeto a retención, el exceso sobre $500 lleva 10% (o 6%
                  con relevo).
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Bancos de PR con routing number conocido — mismo listado que
// CuentaACHEntidad en entidad-form.tsx (duplicado a propósito, mismo
// patrón que el resto del código: cada portal trae su propia copia).
const BANCOS_ACH_VENDOR: { nombre: string; routing: string }[] = [
  { nombre: "BPPR", routing: "021502011" },
  { nombre: "FirstBank", routing: "021502228" },
  { nombre: "Oriental", routing: "021502914" },
];

// Cuenta bancaria RECEPTORA de un contratista (migración 0118, 30 sept 2026)
// — a esta cuenta llega el pago cuando Joel sube el archivo NACHA al banco.
// Mismo patrón que la sección de Relevo justo arriba: componente propio con
// su botón de Guardar, porque el número de cuenta se cifra en el servidor
// (no puede pasar por el insert/update directo de Supabase que usa el resto
// del formulario de contratista).
function CuentaBancariaVendor({ vendor }: { vendor: Vendor }) {
  const [bankName, setBankName] = useState("BPPR");
  const [routing, setRouting] = useState(vendor.bank_routing_number ?? BANCOS_ACH_VENDOR[0].routing);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState(vendor.bank_account_type === "savings" ? "savings" : "checking");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function escogerBanco(nombre: string) {
    setBankName(nombre);
    const preset = BANCOS_ACH_VENDOR.find((b) => b.nombre === nombre);
    if (preset) setRouting(preset.routing);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const res = await fetch(`/api/pagos/vendors/${vendor.id}/banca`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName, routingNumber: routing, accountNumber, accountType }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar la cuenta bancaria.");
      return;
    }
    setAccountNumber("");
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  const tieneCuenta = !!vendor.bank_routing_number;

  return (
    <div className="rounded-lg border border-border bg-bg p-2.5">
      <p className="mb-1 text-xs font-medium">Cuenta bancaria — para archivo NACHA</p>
      <p className="mb-1.5 text-[11px] text-muted">
        Opcional. Llénala si vas a pagarle con el archivo .ach en vez de ACH manual o ATH Móvil.
      </p>
      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <select className="vc-input text-xs" value={bankName} onChange={(e) => escogerBanco(e.target.value)}>
          {BANCOS_ACH_VENDOR.map((b) => (
            <option key={b.nombre} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
          <option value="Otro">Otro</option>
        </select>
        <select className="vc-input text-xs" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
      </div>
      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <input className="vc-input text-xs" value={routing} onChange={(e) => setRouting(e.target.value)} maxLength={9} placeholder="Routing" />
        <input
          className="vc-input text-xs"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder={tieneCuenta ? "•••• ya archivada" : "N.º de cuenta"}
        />
      </div>
      {error && <p className="mb-1.5 text-[11px] text-red">{error}</p>}
      {guardado && <p className="mb-1.5 text-[11px] text-teal">✓ Cuenta guardada.</p>}
      <button type="button" className="vc-btn-secondary w-full text-xs" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar cuenta bancaria"}
      </button>
    </div>
  );
}

// Botones de periodo — calcado 1:1 de PERIODOS en Reportes de Facturación
// (2 sept 2026, pedido de Joel: mantener el trimestre y añadirle "Rango" al
// lado, no reemplazarlo por un toggle de dos opciones).
const PERIODOS_PAGOS = [
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
  { value: "rango", label: "Rango" },
] as const;

function inicioPeriodoPagos(periodo: string, rangoDesde: string): string {
  const hoy = new Date();
  if (periodo === "mes") return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  if (periodo === "trimestre") {
    const inicioTrimestre = Math.floor(hoy.getMonth() / 3) * 3;
    return new Date(hoy.getFullYear(), inicioTrimestre, 1).toISOString().slice(0, 10);
  }
  if (periodo === "anio") return new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10);
  // "0001-01-01" y no "0000-01-01" (14 sept 2026, fix de raíz): Postgres
  // rechaza el año 0000 como fecha inválida — la query .gte("period_end",
  // desde) fallaba en silencio para "Todo" y el reporte salía en $0.
  if (periodo === "rango") return rangoDesde || "0001-01-01";
  return "0001-01-01";
}

function finPeriodoPagos(periodo: string, rangoHasta: string): string {
  if (periodo === "rango") return rangoHasta || hoyISO();
  return hoyISO();
}

// Combobox con búsqueda + "Todos" fijo adentro del scroll — calcado del
// ComboBuscable de Reportes en Facturación (2 sept 2026, pedido de Joel:
// "igual que clientes... por ejemplo si quiero saber cuanto pagué... por
// todos los vendors o por x vendor"). Duplicado aquí a propósito, mismo
// patrón que el resto del código (cada portal trae su propia copia).
function ComboBuscableVendor<T extends { id: string }>({
  items,
  valorId,
  onSeleccionar,
  etiqueta,
  etiquetaTodos,
  placeholder,
}: {
  items: T[];
  valorId: string;
  onSeleccionar: (id: string) => void;
  etiqueta: (item: T) => string;
  etiquetaTodos: string;
  placeholder: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const seleccionado = items.find((i) => i.id === valorId);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const filtrados = busqueda.trim()
    ? items.filter((i) => etiqueta(i).toLowerCase().includes(busqueda.trim().toLowerCase()))
    : items;

  return (
    <div className="relative" ref={ref}>
      <input
        className="vc-input"
        style={{ fontSize: 12 }}
        placeholder={placeholder}
        value={abierto ? busqueda : seleccionado ? etiqueta(seleccionado) : etiquetaTodos}
        onFocus={() => {
          setAbierto(true);
          setBusqueda("");
        }}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          <button
            type="button"
            className="block w-full border-b border-border px-3 py-2 text-left text-sm font-medium text-teal hover:bg-bg"
            onClick={() => {
              onSeleccionar("");
              setAbierto(false);
              setBusqueda("");
            }}
          >
            {etiquetaTodos}
          </button>
          {filtrados.length === 0 && <p className="p-3 text-xs text-muted">Sin resultados.</p>}
          {filtrados.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-bg"
              onClick={() => {
                onSeleccionar(item.id);
                setAbierto(false);
                setBusqueda("");
              }}
            >
              {etiqueta(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Reportes — resumen trimestral por contratista (lo que Joel necesita
// para llenar el Modelo 480.6SP) + export PDF/Excel.
// ============================================================================
function ReportesTab({
  vendors,
  retenciones,
  entidadId,
  vistaGlobal = false,
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
  vistaGlobal?: boolean;
}) {
  // Mismos botones de periodo que Reportes de Facturación (2 sept 2026,
  // pedido de Joel: "como estaba con trimestres pero que le añadieras un
  // rango" — o sea, no reemplazar el trimestre, añadir "Rango" al lado como
  // una quinta opción, igual que ya funciona allá).
  const [periodo, setPeriodo] = useState<(typeof PERIODOS_PAGOS)[number]["value"]>("trimestre");
  const [rangoDesde, setRangoDesde] = useState(hoyISO());
  const [rangoHasta, setRangoHasta] = useState(hoyISO());
  // Q1-Q4 dentro del botón "Trimestre" (como estaba antes de añadir el
  // botón "Rango", pedido de Joel: "en trimestre añademe un scrolldown de
  // Q1, Q2, Q3, Q4 como estaba").
  const [trimestre, setTrimestre] = useState(trimestreDe(hoyISO()));
  const [anioTrimestre, setAnioTrimestre] = useState(Number(hoyISO().slice(0, 4)));
  // panelAbierto (2 sept 2026, pedido de Joel: "todo lo que se pueda abrir
  // con un click debe cerrarse con otro click") — clic en el período YA
  // activo alterna abierto/cerrado; clic en un período distinto cambia y
  // abre. Sin esto el desplegable de Trimestre/Rango solo se ocultaba
  // cambiando a otro botón, nunca haciendo clic de nuevo en el mismo.
  const [panelAbierto, setPanelAbierto] = useState(true);
  // Filtro por contratista — combobox con búsqueda y "Todos" adentro del
  // scroll, calcado del de Cliente/Servicio en Reportes de Facturación
  // (pedido de Joel: "igual que clientes... por ejemplo si quiero saber
  // cuanto pagué y retuve la bisemana o el mes de agosto por todos los
  // vendors o por x vendor").
  const [vendorFiltro, setVendorFiltro] = useState("");
  // Calculadora de deducción en riesgo (ver import arriba) — estado propio,
  // independiente del filtro de período de los reportes de arriba. Empieza
  // vacío a propósito (3 oct 2026, mismo fix que la landing: un valor
  // precargado confunde — parece que la app "inventó" un número).
  const [calcGastoTexto, setCalcGastoTexto] = useState("");
  const [calcTipoNegocio, setCalcTipoNegocio] = useState<TasaContributivaId>("individuo");
  const calcGasto = parseFloat(calcGastoTexto.replace(/,/g, "")) || 0;
  const calcResultado = calcularImpuestoEnRiesgo(calcGasto, calcTipoNegocio);

  const { desde, hasta } =
    periodo === "trimestre"
      ? rangoTrimestre(anioTrimestre, trimestre)
      : { desde: inicioPeriodoPagos(periodo, rangoDesde), hasta: finPeriodoPagos(periodo, rangoHasta) };
  const vendorPorId = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const vendorsOrdenados = useMemo(() => [...vendors].sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  const enRango = useMemo(
    () =>
      retenciones.filter((r) => {
        if (!r.period_end || r.period_end < desde || r.period_end > hasta) return false;
        if (vendorFiltro && r.vendor_id !== vendorFiltro) return false;
        return true;
      }),
    [retenciones, desde, hasta, vendorFiltro]
  );

  const porContratista = useMemo(() => {
    const mapa = new Map<string, { nombre: string; taxId: string | null; bruto: number; retenido: number; neto: number; count: number }>();
    for (const r of enRango) {
      const v = vendorPorId.get(r.vendor_id);
      const nombre = v?.name ?? "Contratista eliminado";
      const actual = mapa.get(r.vendor_id) ?? { nombre, taxId: v?.tax_id ?? null, bruto: 0, retenido: 0, neto: 0, count: 0 };
      actual.bruto += Number(r.gross_amount);
      actual.retenido += Number(r.retention_amount);
      actual.neto += Number(r.net_paid);
      actual.count += 1;
      mapa.set(r.vendor_id, actual);
    }
    return [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
  }, [enRango, vendorPorId]);

  const totalBruto = porContratista.reduce((s, c) => s + c.bruto, 0);
  const totalRetenido = porContratista.reduce((s, c) => s + c.retenido, 0);
  const totalNeto = porContratista.reduce((s, c) => s + c.neto, 0);

  // Depósito 480.9A (30 sept 2026, tarea #742) — independiente del filtro de
  // período de arriba (Trimestre/Rango): siempre muestra el mes calendario
  // que le toca depositar a Joel AHORA mismo, no el rango que esté mirando.
  const deposito = useMemo(
    () => estadoDeposito480_9A(retenciones, entidadId, vistaGlobal, new Date()),
    [retenciones, entidadId, vistaGlobal]
  );

  // vistaGlobal: NUNCA mandar entityId — la lista de arriba (porContratista)
  // tampoco filtra por entidad en ese modo, así que el export tiene que
  // traer exactamente lo mismo que ya se ve en pantalla (ver comentario en
  // el prop vistaGlobal de PagosPortal, arriba).
  const paramsExport = `desde=${desde}&hasta=${hasta}${!vistaGlobal && entidadId ? `&entityId=${entidadId}` : ""}${vendorFiltro ? `&vendorIds=${vendorFiltro}` : ""}`;
  // 7 sept 2026, pedido de Joel: que todo reporte descargable lleve el logo
  // de la empresa + la marca victorcfo.com. El CSV no puede llevar logo, así
  // que se reemplaza el botón por el Excel nuevo (mismo patrón que ya se
  // hizo en Facturación) — el CSV route se deja intacto pero sin usar.
  const excelHref = `/api/pagos/reportes/excel?${paramsExport}`;
  const pdfHref = `/api/pagos/reportes/pdf?${paramsExport}`;
  // Exportación año-fiscal del 480.6SP (30 sept 2026, tarea #743) — siempre
  // el año calendario completo (no el rango de arriba), con SSN/EIN y la
  // casilla real de cada contratista, lo que Joel le entrega a su CPA.
  const anioActual480_6SP = Number(hoyISO().slice(0, 4));
  const paramsExport480_6SP = `anio=${anioActual480_6SP}${!vistaGlobal && entidadId ? `&entityId=${entidadId}` : ""}`;
  // 30 sept 2026, feedback de Joel: este export solo tenía CSV plano ("se ve
  // horrible, no está en el formato de los demás con logo y tablas... y
  // además debe estar en PDF también") — ahora tiene Excel branded y PDF
  // igual que el resto de los reportes de Pagos; el CSV original
  // (/api/pagos/reportes/480-6sp) se deja intacto pero deja de ser el botón
  // principal.
  const export480_6SPExcelHref = `/api/pagos/reportes/480-6sp/excel?${paramsExport480_6SP}`;
  const export480_6SPPdfHref = `/api/pagos/reportes/480-6sp/pdf?${paramsExport480_6SP}`;

  return (
    <>
      {/* 30 sept 2026, feedback de Joel: este aviso vivía DEBAJO del selector
          de período (Trimestre/Rango), pegado sin ningún separador — se veía
          como si fuera "la caja que abre" el trimestre, cuando en realidad
          es un dato fijo que NO cambia con el filtro de abajo (siempre es el
          mes calendario actual). Por eso se subió a la cima del tab, antes
          de cualquier filtro, y se le quitó cualquier relación visual con el
          selector de período. */}
      {deposito.totalDolares > 0 && (
        <div className={`vc-card mb-3 ${deposito.vencido ? "border-red/40 bg-red/5" : "border-amb/30 bg-amb/5"}`}>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Depósito mensual — Modelo 480.9A</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">
                Retenido en {MESES_ES[deposito.mes]} {deposito.anio}:{" "}
                <span className="font-medium">{formatMoney(deposito.totalDolares)}</span>
              </p>
              <p className={`text-xs ${deposito.vencido ? "text-red" : "text-muted"}`}>
                {deposito.vencido
                  ? `⚠️ Venció el ${formatFecha(deposito.vence.toISOString().slice(0, 10))} — deposítalo en SURI cuanto antes.`
                  : `Vence el ${formatFecha(deposito.vence.toISOString().slice(0, 10))} (día 15 del mes siguiente).`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* A partir de aquí todo cambia con el filtro de período — por eso
          lleva su propio encabezado, para dejar clarísimo que es una
          sección distinta del aviso fijo de arriba. */}
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Filtrar reporte por período</p>

      {/* El bloque entero (botones + lo que se despliega) vive dentro de UN
          mismo contenedor con borde/fondo teal — así "Trimestre"/"Rango" se
          ven visualmente pegados al Q1-Q4 o las fechas que abren debajo, en
          vez de sentirse como una caja suelta aparte (pedido de Joel, 2 sept
          2026: "delimitar con color lo que abre abajo... lo mismo en
          Facturas"). La flechita (ti-chevron-down) en el botón activo marca
          cuál opción es la que tiene algo desplegado. */}
      <div className="relative mb-3 rounded-xl border border-teal/30 bg-teal/[.05] p-2">
        <div className="flex gap-1.5">
          {PERIODOS_PAGOS.map((p, idx) => {
            const tieneDesplegable = p.value === "trimestre" || p.value === "rango";
            // 30 sept 2026, pedido de Joel: antes el Q1-Q4/Rango se abría
            // como una barra de ancho completo debajo de TODOS los botones
            // (se sentía como una caja suelta aparte). Ahora cada botón con
            // desplegable es su propio ancla (`relative`) y el panel cuelga
            // (`absolute`) justo debajo de ESE botón, como un popover real.
            const esUltimo = idx === PERIODOS_PAGOS.length - 1;
            return (
              <div key={p.value} className="relative flex-1">
                <button
                  onClick={() => {
                    if (periodo === p.value) {
                      setPanelAbierto((a) => !a);
                    } else {
                      setPeriodo(p.value);
                      setPanelAbierto(true);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium"
                  style={
                    periodo === p.value
                      ? { background: "#1D9E75", color: "#fff" }
                      : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
                  }
                >
                  {p.label}
                  {tieneDesplegable && (
                    <i
                      className="ti ti-chevron-down"
                      style={{ fontSize: 12, transform: periodo === p.value && panelAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                    />
                  )}
                </button>

                {p.value === "trimestre" && periodo === "trimestre" && panelAbierto && (
                  <div
                    className="absolute top-full z-20 mt-1.5 flex gap-1.5 rounded-lg border border-teal/30 bg-card p-2 shadow-lg"
                    style={{ left: 0, width: 230 }}
                  >
                    <select className="vc-input flex-1" value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}>
                      <option value={1}>Q1 — Ene a Mar</option>
                      <option value={2}>Q2 — Abr a Jun</option>
                      <option value={3}>Q3 — Jul a Sep</option>
                      <option value={4}>Q4 — Oct a Dic</option>
                    </select>
                    <input
                      className="vc-input flex-shrink-0"
                      style={{ width: 80 }}
                      type="number"
                      value={anioTrimestre}
                      onChange={(e) => setAnioTrimestre(Number(e.target.value))}
                    />
                  </div>
                )}

                {p.value === "rango" && periodo === "rango" && panelAbierto && (
                  <div
                    className="absolute top-full z-20 mt-1.5 flex gap-1.5 rounded-lg border border-teal/30 bg-card p-2 shadow-lg"
                    style={esUltimo ? { right: 0, width: 260 } : { left: 0, width: 260 }}
                  >
                    <input type="date" className="vc-input flex-1" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} />
                    <input type="date" className="vc-input flex-1" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Contratista</p>
        <ComboBuscableVendor
          items={vendorsOrdenados}
          valorId={vendorFiltro}
          onSeleccionar={setVendorFiltro}
          etiqueta={(v) => v.name}
          etiquetaTodos="Todos los contratistas"
          placeholder="Buscar contratista..."
        />
        <p className="mt-1.5 text-xs text-muted">
          {formatFecha(desde)} — {formatFecha(hasta)}
        </p>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Resumen — para el Modelo 480.6SP</p>
        <div className="flex justify-between py-0.5 text-sm">
          <span className="text-muted">Bruto pagado</span>
          <span>{formatMoney(totalBruto)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-sm">
          <span className="text-muted">Retenido (crédito para remesar)</span>
          <span className="font-medium text-amb">{formatMoney(totalRetenido)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-sm font-medium">
          <span>Neto pagado</span>
          <span>{formatMoney(totalNeto)}</span>
        </div>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Por contratista</p>
        {porContratista.length === 0 && <p className="text-xs text-muted">No hay pagos registrados con estos filtros.</p>}
        {porContratista.map((c) => (
          <div key={c.nombre} className="border-b border-border py-2 text-sm last:border-0">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate">
                {c.nombre} <span className="text-xs text-muted">({c.count})</span>
              </span>
              {/* 7 sept 2026, pedido de Joel (mandó screenshot marcando esta
                  columna): el número solo no dejaba claro a qué correspondía
                  — se podía confundir con el neto pagado. La etiqueta
                  "Retenido" arriba del monto lo deja explícito, igual que ya
                  dice la tarjeta de Resumen justo arriba de esta lista. */}
              <span className="flex-shrink-0 text-right">
                <span className="block text-[10px] uppercase tracking-wide text-muted">Retenido</span>
                <span className="font-medium">{formatMoney(c.retenido)}</span>
              </span>
            </div>
            <p className="text-xs text-muted">
              Bruto {formatMoney(c.bruto)} · Neto {formatMoney(c.neto)}
              {c.taxId ? ` · ${c.taxId}` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="vc-btn-secondary flex-1 text-center">
          Exportar PDF
        </a>
        <a href={excelHref} className="vc-btn-secondary flex-1 text-center">
          Exportar Excel
        </a>
      </div>

      {/* Exportación año-fiscal del 480.6SP para el CPA (tarea #743) —
          aparte de los botones de arriba porque siempre es el año completo,
          no el período que esté filtrado en pantalla. */}
      <div className="vc-card mt-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Para el CPA — año fiscal completo</p>
        <p className="mb-2 text-xs text-muted">
          Casilla (1-4), SSN/EIN y totales de {anioActual480_6SP} — solo contratistas que cruzaron los $500.
        </p>
        <div className="flex gap-2">
          <a href={export480_6SPPdfHref} target="_blank" rel="noopener noreferrer" className="vc-btn-secondary flex-1 text-center">
            Exportar PDF
          </a>
          <a href={export480_6SPExcelHref} className="vc-btn-secondary flex-1 text-center">
            Exportar Excel
          </a>
        </div>
      </div>

      {/* Calculadora de deducción en riesgo (tarea #848, 3 oct 2026) — para
          que quien esté presentando VICTOR CFO le muestre al prospecto, en
          vivo y con sus propios números, cuánto impuesto arriesga por no
          reportar un pago a contratista/suplidor/servicio profesional.
          Misma función y mismo texto que la calculadora pública de la
          landing (lib/calculadora-deduccion.ts) — nunca debe decir algo
          distinto. */}
      <div className="vc-card mt-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Calculadora — ahorro en impuestos</p>
        <p className="mb-3 text-xs text-muted">{CALCULADORA_EXPLICACION}</p>

        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Monto pagado en el año (si pasa de $500)</span>
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5">
              <span className="text-muted">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={calcGastoTexto}
                onChange={(e) => setCalcGastoTexto(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="5,500"
                className="w-full border-0 bg-transparent text-sm text-text outline-none"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>Tipo de negocio</span>
            <select
              value={calcTipoNegocio}
              onChange={(e) => setCalcTipoNegocio(e.target.value as TasaContributivaId)}
              className="rounded-md border border-border px-2 py-1.5 text-sm text-text"
            >
              {(Object.keys(TASA_CONTRIBUTIVA_LABEL) as TasaContributivaId[]).map((id) => (
                <option key={id} value={id}>
                  {TASA_CONTRIBUTIVA_LABEL[id]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-2 flex items-baseline justify-between rounded-lg border border-teal bg-teal/[.06] px-3 py-2">
          <span className="text-xs text-muted">Ahorro estimado en impuestos</span>
          <strong className="text-xl font-semibold text-teal">
            {calcResultado.impuestoEnRiesgo.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </strong>
        </div>

        <p className="text-[11px] italic text-muted">{CALCULADORA_DISCLAIMER}</p>
      </div>
    </>
  );
}
