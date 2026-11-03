"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

// Pantalla "Estadísticas" (icono propio en el nav de negocio; 3 nov 2026,
// pedido de Joel). Rediseño "tentador": resumen con tendencia, avisos de
// VICTOR (reglas sobre los números del usuario, sin costo de IA), gráficas
// (barra de dependencia, anillo de retención, embudo, canales) y una hoja que
// sube desde abajo con la lista completa de quiénes son.
// REGLA DE JOEL: nada se escribe a mano. Todo sale de lo que ya existe:
// clientes, cotizaciones, facturas (incluidas las importadas de Stripe y
// Shopify), seguimientos y gasto en "Publicidad y mercadeo". Son referencias
// del propio negocio, no metas ni promesas de resultados.

type Cli = { id: string; name: string; fuente: string | null; created_at: string };
type Fac = {
  id: string;
  client_id: string | null;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_pago: string | null;
  origen: string | null;
  es_recurrente: boolean | null;
  frecuencia_recurrente: string | null;
  factura_padre_id: string | null;
  fecha_vencimiento: string | null;
};
type Nota = { monto: number; fecha: string; client_id: string | null; numero: string | null };
type Cot = { estado: string; total: number; fecha_emision: string; client_id: string | null };
type Seg = { estado: string; fecha_proximo: string; client_id: string | null };
type Fila = { nombre: string; extra?: string; href?: string };
type Detalle = { titulo: string; nota?: string; filas: Fila[] };

const PERIODOS = [
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
  { value: 365, label: "12 meses" },
] as const;

const FUENTE_LABEL: Record<string, string> = {
  shopify: "Tienda en línea (Shopify)",
  api: "Integración (Zapier / API)",
  importacion: "Importado (CSV / otro sistema)",
  tecnico: "Creado por un técnico",
  stripe: "Stripe (cobro directo)",
};

const SEGMENTOS = [
  { k: "activos", t: "Activos", d: "pagaron en los últimos 90 días", color: "#1D9E75" },
  { k: "riesgo", t: "En riesgo", d: "entre 90 y 180 días sin pagar", color: "#EF9F27" },
  { k: "inactivos", t: "Inactivos", d: "entre 6 y 12 meses sin pagar", color: "#D85A30" },
  { k: "perdidos", t: "Perdidos", d: "más de 12 meses sin pagar", color: "#888780" },
] as const;

const COLORES = ["#534AB7", "#7F77DD", "#1D9E75", "#AFA9EC", "#5DCAA5"];
const TEAL = "#1D9E75";
const VIOLETA = "#534AB7";

const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fFecha = (f: string) => f.slice(5, 7) + "/" + f.slice(8, 10) + "/" + f.slice(0, 4);

// Número que "sube" hasta su valor al cargar (se ve vivo, no cuesta nada).
function useContar(objetivo: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const ini = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - ini) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(objetivo * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [objetivo, ms]);
  return v;
}

export default function EstadisticasTab({ entidadId }: { entidadId: string | null }) {
  const supabase = createClient();
  const [periodo, setPeriodo] = useState<number>(90);
  const [cargando, setCargando] = useState(true);
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [facturas, setFacturas] = useState<Fac[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cot[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seg[]>([]);
  const [gastoMercadeo, setGastoMercadeo] = useState(0);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [subida, setSubida] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      const desde = dias(periodo * 2); // período actual + anterior, para comparar
      const filtrar = (q: any) => (entidadId ? q.eq("entity_id", entidadId) : q);
      const [c, f, q, s, t, n] = await Promise.all([
        filtrar(supabase.from("clients").select("id, name, fuente, created_at")),
        filtrar(
          supabase
            .from("invoices")
            .select("id, client_id, total, estado, fecha_emision, fecha_pago, origen, es_recurrente, frecuencia_recurrente, factura_padre_id, fecha_vencimiento")
        ),
        filtrar(supabase.from("cotizaciones").select("estado, total, fecha_emision, client_id").gte("fecha_emision", desde)),
        filtrar(supabase.from("seguimientos_clientes").select("estado, fecha_proximo, client_id")),
        filtrar(
          supabase.from("transactions").select("amount").eq("category", "Publicidad y mercadeo").eq("tipo_flujo", "gasto").gte("fecha", dias(periodo))
        ),
        filtrar(supabase.from("notas_credito").select("monto, fecha, client_id, numero").gte("fecha", dias(periodo))),
      ]);
      if (!activo) return;
      setClientes((c.data as any) ?? []);
      setFacturas((f.data as any) ?? []);
      setCotizaciones((q.data as any) ?? []);
      setSeguimientos((s.data as any) ?? []);
      setNotas((n.data as any) ?? []);
      setGastoMercadeo(((t.data as any[]) ?? []).reduce((a, x) => a + Math.abs(Number(x.amount) || 0), 0));
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [entidadId, periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => {
    const ini = dias(periodo);
    const iniPrev = dias(periodo * 2);
    const fechaCobro = (x: Fac) => x.fecha_pago ?? x.fecha_emision;
    const pagadas = facturas.filter((x) => x.estado === "pagada");
    const pagadasPer = pagadas.filter((x) => fechaCobro(x) >= ini);
    const pagadasPrev = pagadas.filter((x) => fechaCobro(x) >= iniPrev && fechaCobro(x) < ini);
    const cobrado = pagadasPer.reduce((a, x) => a + Number(x.total || 0), 0);
    const cobradoPrev = pagadasPrev.reduce((a, x) => a + Number(x.total || 0), 0);

    // Serie para la línea de tendencia: 12 tramos iguales del período.
    const N = 12;
    const serie = Array.from({ length: N }, () => 0);
    const t0 = new Date(ini + "T00:00:00Z").getTime();
    const tramo = (periodo * 86400000) / N;
    pagadasPer.forEach((x) => {
      const i = Math.min(N - 1, Math.max(0, Math.floor((new Date(fechaCobro(x) + "T00:00:00Z").getTime() - t0) / tramo)));
      serie[i] += Number(x.total || 0);
    });

    // "Cliente desde": la fecha más antigua entre cuándo se creó y su primera
    // factura, para que clientes importados (Stripe, CSV) con facturas viejas
    // no cuenten como nuevos solo porque se importaron hoy.
    const primeraFactura = new Map<string, string>();
    facturas.forEach((x) => {
      if (!x.client_id) return;
      const p = primeraFactura.get(x.client_id);
      if (!p || x.fecha_emision < p) primeraFactura.set(x.client_id, x.fecha_emision);
    });
    const desdeCliente = (x: Cli) => {
      const c = x.created_at.slice(0, 10);
      const p = primeraFactura.get(x.id);
      return p && p < c ? p : c;
    };
    const nuevos = clientes.filter((x) => desdeCliente(x) >= ini);
    const nuevosPrev = clientes.filter((x) => desdeCliente(x) >= iniPrev && desdeCliente(x) < ini);

    const primeraConOrigen = new Map<string, string>();
    [...facturas]
      .filter((x) => x.client_id && x.origen)
      .sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision))
      .forEach((x) => {
        if (!primeraConOrigen.has(x.client_id as string)) primeraConOrigen.set(x.client_id as string, x.origen as string);
      });
    const canalDeCliente = (x: Cli) =>
      primeraConOrigen.get(x.id) ?? (x.fuente ? FUENTE_LABEL[x.fuente] ?? x.fuente : "Manual / sin identificar");
    const porFuente = new Map<string, number>();
    nuevos.forEach((x) => porFuente.set(canalDeCliente(x), (porFuente.get(canalDeCliente(x)) ?? 0) + 1));

    const canalVenta = (x: Fac) => x.origen ?? (x.factura_padre_id ? "Recurrente (automática)" : "Factura directa");
    const ventasCanal = new Map<string, { n: number; monto: number }>();
    pagadasPer.forEach((x) => {
      const k = canalVenta(x);
      const v = ventasCanal.get(k) ?? { n: 0, monto: 0 };
      ventasCanal.set(k, { n: v.n + 1, monto: v.monto + Number(x.total || 0) });
    });

    const factorMes = (f: string | null) => (f === "semanal" ? 52 / 12 : f === "quincenal" ? 2 : 1);
    const plantillas = facturas.filter((x) => x.es_recurrente && x.estado !== "borrador");
    const mrr = plantillas.reduce((a, x) => a + Number(x.total || 0) * factorMes(x.frecuencia_recurrente), 0);
    const padresConHijas = new Set(facturas.filter((x) => x.factura_padre_id).map((x) => x.factura_padre_id as string));
    const detenidasFacs = facturas.filter((x) => !x.es_recurrente && padresConHijas.has(x.id));

    const reembolsado = notas.reduce((a, x) => a + Number(x.monto || 0), 0);

    const cots = cotizaciones.filter((x) => x.fecha_emision >= ini);
    const ganadas = cots.filter((x) => x.estado === "aprobada" || x.estado === "convertida");
    const perdidas = cots.filter((x) => x.estado === "rechazada");
    const abiertas = cots.filter((x) => x.estado === "enviada");
    const abiertasViejas = abiertas.filter((x) => x.fecha_emision <= dias(7));

    const pagosPorCliente = new Map<string, Fac[]>();
    pagadas.forEach((x) => {
      if (!x.client_id) return;
      pagosPorCliente.set(x.client_id, [...(pagosPorCliente.get(x.client_id) ?? []), x]);
    });
    const conPago = pagosPorCliente.size;
    const ultimoPago = (l: Fac[]) => l.reduce((mx, x) => (fechaCobro(x) > mx ? fechaCobro(x) : mx), "");
    const limiteDormido = dias(180);
    const repiten = [...pagosPorCliente.entries()].filter(([, l]) => l.length >= 2);
    const dormidos = [...pagosPorCliente.entries()].filter(([, l]) => ultimoPago(l) < limiteDormido);

    const cobradoPorCliente = new Map<string, number>();
    pagadasPer.forEach((x) => {
      if (!x.client_id) return;
      cobradoPorCliente.set(x.client_id, (cobradoPorCliente.get(x.client_id) ?? 0) + Number(x.total || 0));
    });
    const top = [...cobradoPorCliente.entries()].sort((a, b) => b[1] - a[1]);
    const top3Monto = top.slice(0, 3).reduce((a, x) => a + x[1], 0);

    const hoy = dias(0);
    const segVenc = seguimientos.filter((x) => x.estado === "pendiente" && x.fecha_proximo < hoy);

    const nombre = (id: string | null) => (id ? clientes.find((x) => x.id === id)?.name ?? "Cliente" : "Sin cliente");
    const hrefCli = (id: string | null) => (id ? `/dashboard/clientes/${id}/editar` : undefined);
    const fila = (id: string | null, extra?: string): Fila => ({ nombre: nombre(id), extra, href: hrefCli(id) });
    const fm = (n: number) => formatMoney(n);
    const parte = (v: number) => `${fm(v)} · ${cobrado > 0 ? Math.round((v / cobrado) * 100) : 0}%`;

    // ── Salud de la cartera: segmentos por tiempo desde el último pago.
    const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T00:00:00Z").getTime()) / 86400000);
    const segs = { activos: [] as [string, string][], riesgo: [] as [string, string][], inactivos: [] as [string, string][], perdidos: [] as [string, string][] };
    pagosPorCliente.forEach((l, id) => {
      const u = ultimoPago(l);
      const d = diasDesde(u);
      const k = d <= 90 ? "activos" : d <= 180 ? "riesgo" : d <= 365 ? "inactivos" : "perdidos";
      segs[k].push([id, u]);
    });
    const filaUlt = ([id, u]: [string, string]) => fila(id, `último pago ${fFecha(u)} · hace ${diasDesde(u)} días`);

    // ── Churn de clientes: de los que pagaron en los 180 días previos al período,
    //    cuántos no han vuelto a pagar dentro del período.
    const base = [...pagosPorCliente.entries()].filter(([, l]) => l.some((x) => fechaCobro(x) >= dias(periodo + 180) && fechaCobro(x) < ini));
    const idsChurn = base.filter(([, l]) => !l.some((x) => fechaCobro(x) >= ini));
    const churnPct = pct(idsChurn.length, base.length);

    // ── Cuentas por cobrar.
    const pendientes = facturas.filter((x) => ["enviada", "vista", "vencida"].includes(x.estado));
    const porCobrar = pendientes.reduce((a, x) => a + Number(x.total || 0), 0);
    const vencidas = pendientes.filter((x) => x.fecha_vencimiento && x.fecha_vencimiento < hoy);
    const montoVencido = vencidas.reduce((a, x) => a + Number(x.total || 0), 0);
    const conDias = pagadasPer.filter((x) => x.fecha_pago);
    const dso = conDias.length
      ? Math.round(
          conDias.reduce((a, x) => a + Math.max(0, (new Date((x.fecha_pago as string) + "T00:00:00Z").getTime() - new Date(x.fecha_emision + "T00:00:00Z").getTime()) / 86400000), 0) /
            conDias.length
        )
      : null;
    const facturadoPer = facturas.filter((x) => !["borrador", "anulada"].includes(x.estado) && x.fecha_emision >= ini);
    const facturadoMonto = facturadoPer.reduce((a, x) => a + Number(x.total || 0), 0);
    const cobradoDeFacturado = facturadoPer.filter((x) => x.estado === "pagada").reduce((a, x) => a + Number(x.total || 0), 0);

    // ── Ingreso de clientes nuevos vs. existentes, y valor por cliente.
    const idsNuevos = new Set(nuevos.map((x) => x.id));
    const cobradoNuevos = pagadasPer.filter((x) => x.client_id && idsNuevos.has(x.client_id)).reduce((a, x) => a + Number(x.total || 0), 0);
    const totalHistorico = pagadas.filter((x) => x.client_id).reduce((a, x) => a + Number(x.total || 0), 0);
    const nPagosConCliente = pagadas.filter((x) => x.client_id).length;

    const extra = {
      activos: segs.activos.map(filaUlt),
      riesgo: segs.riesgo.map(filaUlt),
      inactivos: segs.inactivos.map(filaUlt),
      perdidos: segs.perdidos.map(filaUlt),
      churn: idsChurn.map(([id, l]) => fila(id, `último pago ${fFecha(ultimoPago(l))}`)),
      vencidas: vencidas.map((x) =>
        fila(x.client_id, `${fm(Number(x.total || 0))} · ${diasDesde(x.fecha_vencimiento as string)} días de atraso`)
      ),
      porCobrar: pendientes.map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} · vence ${x.fecha_vencimiento ? fFecha(x.fecha_vencimiento) : "—"}`)),
      ingresoNuevos: pagadasPer.filter((x) => x.client_id && idsNuevos.has(x.client_id)).map((x) => fila(x.client_id, fm(Number(x.total || 0)))),
    };

    const listas = {
      nuevos: nuevos.map((x) => fila(x.id, canalDeCliente(x))),
      top: top.slice(0, 15).map(([id, v]) => fila(id, parte(v))),
      top3: top.slice(0, 3).map(([id, v]) => fila(id, parte(v))),
      repiten: repiten.map(([id, l]) => fila(id, `${l.length} pagos`)),
      dormidos: dormidos.map(([id, l]) => fila(id, `último pago ${fFecha(ultimoPago(l))}`)),
      segVencidos: segVenc.map((x) => fila(x.client_id, `le tocaba ${fFecha(x.fecha_proximo)}`)),
      abiertas: abiertas.map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} · ${fFecha(x.fecha_emision)}`)),
      cierre: [...ganadas, ...perdidas].map((x) =>
        fila(x.client_id, `${x.estado === "rechazada" ? "rechazada" : "aprobada"} · ${fm(Number(x.total || 0))}`)
      ),
      recurrentes: plantillas.map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} / ${x.frecuencia_recurrente ?? "mensual"}`)),
      detenidas: detenidasFacs.map((x) => fila(x.client_id)),
      reembolsos: notas.map((x) => fila(x.client_id, `${fm(Number(x.monto || 0))} · ${x.numero ?? ""}`)),
      porCanalClientes: (canal: string) => nuevos.filter((x) => canalDeCliente(x) === canal).map((x) => fila(x.id)),
      porCanalVentas: (canal: string) =>
        pagadasPer.filter((x) => canalVenta(x) === canal).map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} · ${fFecha(fechaCobro(x))}`)),
    };

    // Segmentos de la barra de dependencia: los 4 mayores.
    const seg = top.slice(0, 4).map(([id, v], i) => ({ id, nombre: nombre(id), v, color: COLORES[i] }));

    return {
      cobrado,
      cobradoPrev,
      serie,
      nPagadas: pagadasPer.length,
      ticket: pagadasPer.length ? cobrado / pagadasPer.length : 0,
      nuevos: nuevos.length,
      nuevosPrev: nuevosPrev.length,
      porFuente: [...porFuente.entries()].sort((a, b) => b[1] - a[1]),
      ventasCanal: [...ventasCanal.entries()].sort((a, b) => b[1].monto - a[1].monto),
      mrr,
      nRecurrentes: plantillas.length,
      nDetenidas: detenidasFacs.length,
      reembolsado,
      nNotas: notas.length,
      cots: cots.length,
      ganadas: ganadas.length,
      perdidas: perdidas.length,
      abiertas: abiertas.length,
      abiertasViejas: abiertasViejas.length,
      conPago,
      nRepiten: repiten.length,
      nDormidos: dormidos.length,
      nSegVenc: segVenc.length,
      costoPorNuevo: nuevos.length > 0 && gastoMercadeo > 0 ? gastoMercadeo / nuevos.length : null,
      top3Share: cobrado > 0 ? top3Monto / cobrado : 0,
      top1Share: top[0] && cobrado > 0 ? top[0][1] / cobrado : 0,
      seg,
      segCounts: { activos: segs.activos.length, riesgo: segs.riesgo.length, inactivos: segs.inactivos.length, perdidos: segs.perdidos.length },
      nBase: base.length,
      nChurn: idsChurn.length,
      churnPct,
      porCobrar,
      nPendientes: pendientes.length,
      montoVencido,
      nVencidas: vencidas.length,
      dso,
      tasaCobro: pct(cobradoDeFacturado, facturadoMonto),
      facturadoMonto,
      cobradoNuevos,
      ltv: conPago > 0 ? totalHistorico / conPago : 0,
      pagosPorCliente: conPago > 0 ? nPagosConCliente / conPago : 0,
      listas: { ...listas, ...extra },
    };
  }, [clientes, facturas, cotizaciones, seguimientos, gastoMercadeo, notas, periodo]);

  function abrir(d: Detalle) {
    if (!d.filas.length) return;
    setDetalle(d);
    setSubida(false);
    setTimeout(() => setSubida(true), 20);
  }
  function cerrar() {
    setSubida(false);
    setTimeout(() => setDetalle(null), 220);
  }

  const cobradoAnim = useContar(m.cobrado);
  const nuevosAnim = useContar(m.nuevos, 700);

  if (cargando) return <p className="text-sm text-muted">Calculando estadísticas…</p>;

  const delta = m.cobradoPrev > 0 ? Math.round(((m.cobrado - m.cobradoPrev) / m.cobradoPrev) * 100) : null;

  // Avisos de VICTOR: reglas simples sobre los números del propio usuario.
  const avisos: { icono: string; texto: string; color: "warn" | "info" | "ok"; detalle: Detalle }[] = [];
  if (m.top3Share >= 0.5 && m.cobrado > 0)
    avisos.push({
      icono: "ti-alert-triangle",
      texto: `3 clientes aportan ${Math.round(m.top3Share * 100)}% de lo cobrado`,
      color: "warn",
      detalle: { titulo: `Tus 3 mejores clientes · ${Math.round(m.top3Share * 100)}%`, filas: m.listas.top3 },
    });
  else if (m.top1Share >= 0.35)
    avisos.push({
      icono: "ti-alert-triangle",
      texto: `Un solo cliente aporta ${Math.round(m.top1Share * 100)}% de lo cobrado`,
      color: "warn",
      detalle: { titulo: "Cliente que más aporta", filas: m.listas.top.slice(0, 1) },
    });
  if (m.nVencidas > 0)
    avisos.push({
      icono: "ti-clock-exclamation",
      texto: `${formatMoney(m.montoVencido)} vencido en ${m.nVencidas} factura${m.nVencidas > 1 ? "s" : ""}: cobrar a tiempo es parte del servicio`,
      color: "warn",
      detalle: { titulo: "Facturas vencidas", filas: m.listas.vencidas },
    });
  if (m.nChurn > 0)
    avisos.push({
      icono: "ti-user-minus",
      texto: `${m.nChurn} cliente${m.nChurn > 1 ? "s" : ""} que pagaba${m.nChurn > 1 ? "n" : ""} no ha vuelto en este período`,
      color: "info",
      detalle: { titulo: "Clientes que se fueron (churn)", nota: "Pagaron en los 6 meses previos al período y no han vuelto.", filas: m.listas.churn },
    });
  if (m.nSegVenc > 0)
    avisos.push({
      icono: "ti-bell-ringing",
      texto: `${m.nSegVenc} seguimiento${m.nSegVenc > 1 ? "s" : ""} vencido${m.nSegVenc > 1 ? "s" : ""}: ya les tocaba volver`,
      color: "warn",
      detalle: { titulo: "Seguimientos vencidos", filas: m.listas.segVencidos },
    });
  if (m.abiertasViejas > 0)
    avisos.push({
      icono: "ti-file-description",
      texto: `${m.abiertasViejas} cotización${m.abiertasViejas > 1 ? "es" : ""} sin respuesta hace más de 7 días`,
      color: "info",
      detalle: { titulo: "Cotizaciones sin respuesta", filas: m.listas.abiertas },
    });
  if (m.nDormidos > 0)
    avisos.push({
      icono: "ti-moon",
      texto: `${m.nDormidos} cliente${m.nDormidos > 1 ? "s" : ""} llevan más de 6 meses sin volver`,
      color: "info",
      detalle: { titulo: "Clientes dormidos", nota: "Pagaron antes, pero llevan más de 6 meses sin volver.", filas: m.listas.dormidos },
    });
  if (m.nDetenidas > 0)
    avisos.push({
      icono: "ti-repeat-off",
      texto: `${m.nDetenidas} cobro${m.nDetenidas > 1 ? "s" : ""} recurrente${m.nDetenidas > 1 ? "s" : ""} detenido${m.nDetenidas > 1 ? "s" : ""}`,
      color: "info",
      detalle: { titulo: "Recurrentes detenidos", filas: m.listas.detenidas },
    });
  if (avisos.length === 0)
    avisos.push({
      icono: "ti-circle-check",
      texto: "Sin alertas por ahora. Tus números se ven tranquilos.",
      color: "ok",
      detalle: { titulo: "", filas: [] },
    });

  const colorAviso = (c: "warn" | "info" | "ok") =>
    c === "warn"
      ? { bg: "rgba(239,159,39,.14)", fg: "#854F0B", bd: "rgba(239,159,39,.35)" }
      : c === "ok"
      ? { bg: "rgba(29,158,117,.12)", fg: "#0F6E56", bd: "rgba(29,158,117,.3)" }
      : { bg: "rgba(83,74,183,.10)", fg: "#534AB7", bd: "rgba(83,74,183,.28)" };

  // Línea de tendencia.
  const W = 300;
  const H = 64;
  const maxS = Math.max(1, ...m.serie);
  const pts = m.serie.map((v, i) => [(i / (m.serie.length - 1)) * W, H - 6 - (v / maxS) * (H - 14)] as const);
  const linea = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${linea} L${W} ${H} L0 ${H} Z`;

  const card: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  };
  const tocable: React.CSSProperties = { cursor: "pointer" };
  const etiqueta: React.CSSProperties = { fontSize: 11, color: "var(--muted)", margin: 0 };

  const anillo = pct(m.nRepiten, m.conPago);
  const circ = 2 * Math.PI * 30;

  return (
    <div>
      <style>{`
        @keyframes vc-st-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .vc-st > * { animation: vc-st-in .45s ease both; }
        .vc-st > *:nth-child(2) { animation-delay: .06s; } .vc-st > *:nth-child(3) { animation-delay: .12s; }
        .vc-st > *:nth-child(4) { animation-delay: .18s; } .vc-st > *:nth-child(5) { animation-delay: .24s; }
        .vc-st > *:nth-child(6) { animation-delay: .3s; } .vc-st > *:nth-child(7) { animation-delay: .36s; }
        .vc-st-tap:active { transform: scale(.985); }
        @keyframes vc-st-draw { from { stroke-dashoffset: 700; } to { stroke-dashoffset: 0; } }
      `}</style>

      {/* Selector de período */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 99, padding: 4 }}>
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              background: periodo === p.value ? TEAL : "transparent",
              color: periodo === p.value ? "#fff" : "var(--muted)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="vc-st">
        {/* Resumen */}
        <div style={{ ...card, background: "linear-gradient(135deg, rgba(29,158,117,.18), rgba(83,74,183,.16))", borderColor: "rgba(29,158,117,.35)", padding: 18 }}>
          <p style={etiqueta}>Cobrado · {PERIODOS.find((p) => p.value === periodo)?.label}</p>
          <p style={{ fontSize: 34, fontWeight: 600, margin: "2px 0 6px", letterSpacing: "-0.5px" }}>{formatMoney(cobradoAnim)}</p>
          {delta !== null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 9px",
                borderRadius: 99,
                background: delta >= 0 ? "rgba(29,158,117,.18)" : "rgba(226,75,74,.16)",
                color: delta >= 0 ? "#0F6E56" : "#A32D2D",
              }}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs. el período anterior
            </span>
          )}
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 10, display: "block" }} role="img" aria-label="Cobrado por tramo del período">
            <defs>
              <linearGradient id="vc-st-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity="0.35" />
                <stop offset="100%" stopColor={TEAL} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#vc-st-g)" />
            <path d={linea} fill="none" stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="700" style={{ animation: "vc-st-draw 1.2s ease-out both" }} />
            {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={TEAL} />}
          </svg>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {[
              { t: "Facturas", v: String(m.nPagadas), f: m.listas.top, d: "Cobrado por cliente" },
              { t: "Ticket promedio", v: m.nPagadas ? formatMoney(m.ticket) : "—", f: [] as Fila[], d: "" },
              { t: "Clientes nuevos", v: String(Math.round(nuevosAnim)), f: m.listas.nuevos, d: "Clientes nuevos" },
            ].map((k) => (
              <div
                key={k.t}
                className="vc-st-tap"
                onClick={k.f.length ? () => abrir({ titulo: k.d, filas: k.f }) : undefined}
                style={{ flex: 1, background: "rgba(255,255,255,.35)", borderRadius: 14, padding: "8px 10px", cursor: k.f.length ? "pointer" : "default" }}
              >
                <p style={etiqueta}>{k.t}</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{k.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Avisos de VICTOR */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ ...etiqueta, margin: "0 0 6px 4px", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-sparkles" style={{ fontSize: 14, color: VIOLETA }} /> VICTOR nota esto
          </p>
          {avisos.map((a, i) => {
            const c = colorAviso(a.color);
            return (
              <div
                key={i}
                className="vc-st-tap"
                onClick={() => abrir(a.detalle)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px",
                  borderRadius: 14,
                  background: c.bg,
                  border: `1px solid ${c.bd}`,
                  color: c.fg,
                  fontSize: 13,
                  marginBottom: 6,
                  cursor: a.detalle.filas.length ? "pointer" : "default",
                }}
              >
                <i className={`ti ${a.icono}`} style={{ fontSize: 18 }} />
                <span style={{ flex: 1 }}>{a.texto}</span>
                {a.detalle.filas.length > 0 && <i className="ti ti-chevron-right" style={{ fontSize: 16 }} />}
              </div>
            );
          })}
        </div>

        {/* Dependencia */}
        {m.cobrado > 0 && m.seg.length > 0 && (
          <div className="vc-st-tap" style={{ ...card, ...tocable }} onClick={() => abrir({ titulo: "Quién aporta más", nota: "Porcentaje de lo cobrado en el período.", filas: m.listas.top })}>
            <p style={etiqueta}>Dependencia de clientes</p>
            <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", margin: "10px 0", background: "var(--border)" }}>
              {m.seg.map((s) => (
                <div key={s.id} style={{ width: `${(s.v / m.cobrado) * 100}%`, background: s.color }} />
              ))}
              <div style={{ flex: 1 }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
              {m.seg.map((s) => (
                <span key={s.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                  {s.nombre.length > 24 ? s.nombre.slice(0, 23) + "…" : s.nombre} <b style={{ fontWeight: 600 }}>{Math.round((s.v / m.cobrado) * 100)}%</b>
                </span>
              ))}
            </div>
            <p style={{ ...etiqueta, marginTop: 8, color: "#0F6E56" }}>Toca para ver la lista completa →</p>
          </div>
        )}

        {/* Retención + Embudo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="vc-st-tap" style={{ ...card, marginBottom: 0, ...tocable }} onClick={() => abrir({ titulo: "Clientes que repiten", filas: m.listas.repiten })}>
            <p style={etiqueta}>Clientes que repiten</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <svg viewBox="0 0 80 80" width="68" height="68">
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--border)" strokeWidth="9" />
                <circle
                  cx="40"
                  cy="40"
                  r="30"
                  fill="none"
                  stroke={TEAL}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(anillo / 100) * circ} ${circ}`}
                  transform="rotate(-90 40 40)"
                  style={{ transition: "stroke-dasharray 1s ease" }}
                />
                <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="600" fill="currentColor">
                  {anillo}%
                </text>
              </svg>
              <p style={{ ...etiqueta, flex: 1 }}>
                {m.nRepiten} de {m.conPago} han pagado más de una vez
              </p>
            </div>
          </div>

          {m.cots > 0 ? (
            <div className="vc-st-tap" style={{ ...card, marginBottom: 0, ...tocable }} onClick={() => abrir({ titulo: "Cotizaciones del período", filas: m.listas.cierre.length ? m.listas.cierre : m.listas.abiertas })}>
              <p style={etiqueta}>Embudo de cotizaciones</p>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 500 }}>
                <div style={{ background: "#CECBF6", color: "#3C3489", borderRadius: 8, padding: "4px 8px", marginBottom: 4 }}>Enviadas {m.cots}</div>
                <div style={{ background: "#AFA9EC", color: "#26215C", borderRadius: 8, padding: "4px 8px", marginBottom: 4, width: `${Math.max(30, pct(m.ganadas + m.perdidas, m.cots))}%` }}>
                  Respondidas {m.ganadas + m.perdidas}
                </div>
                <div style={{ background: TEAL, color: "#fff", borderRadius: 8, padding: "4px 8px", width: `${Math.max(25, pct(m.ganadas, m.cots))}%` }}>Aprobadas {m.ganadas}</div>
              </div>
              <p style={{ ...etiqueta, marginTop: 6 }}>Cierre: {pct(m.ganadas, m.cots)}%</p>
            </div>
          ) : (
            <div className="vc-st-tap" style={{ ...card, marginBottom: 0, ...tocable }} onClick={() => abrir({ titulo: "Cobros recurrentes", filas: m.listas.recurrentes })}>
              <p style={etiqueta}>Ingreso mensual recurrente</p>
              <p style={{ fontSize: 22, fontWeight: 600, margin: "8px 0 2px" }}>{formatMoney(m.mrr)}</p>
              <p style={etiqueta}>{m.nRecurrentes} cobros activos</p>
            </div>
          )}
        </div>

        {/* Salud de la cartera de clientes */}
        {m.conPago > 0 && (
          <div style={card}>
            <p style={etiqueta}>Salud de tu cartera de clientes</p>
            <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", margin: "10px 0", background: "var(--border)" }}>
              {SEGMENTOS.map((sg) => (
                <div key={sg.k} style={{ width: `${(m.segCounts[sg.k] / m.conPago) * 100}%`, background: sg.color }} />
              ))}
            </div>
            {SEGMENTOS.map((sg) => (
              <div
                key={sg.k}
                className="vc-st-tap"
                onClick={() => abrir({ titulo: sg.t, nota: sg.d, filas: (m.listas as any)[sg.k] })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid var(--border)", cursor: m.segCounts[sg.k] ? "pointer" : "default" }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 99, background: sg.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>
                  {sg.t} <span style={{ fontSize: 11, color: "var(--muted)" }}>· {sg.d}</span>
                </span>
                <b style={{ fontWeight: 600 }}>{m.segCounts[sg.k]}</b>
                {m.segCounts[sg.k] > 0 && <i className="ti ti-chevron-right" style={{ fontSize: 14, color: "var(--muted)" }} />}
              </div>
            ))}
          </div>
        )}

        {/* Churn y valor del cliente */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="vc-st-tap" style={{ ...card, marginBottom: 0, ...(m.nChurn ? tocable : {}) }} onClick={m.nChurn ? () => abrir({ titulo: "Clientes que se fueron (churn)", nota: "Pagaron en los 6 meses previos al período y no han vuelto.", filas: m.listas.churn }) : undefined}>
            <p style={etiqueta}>Churn de clientes</p>
            <p style={{ fontSize: 26, fontWeight: 600, margin: "4px 0 2px", color: m.churnPct >= 30 ? "#A32D2D" : "inherit" }}>{m.nBase > 0 ? `${m.churnPct}%` : "—"}</p>
            <p style={etiqueta}>{m.nBase > 0 ? `${m.nChurn} de ${m.nBase} no volvieron · retención ${100 - m.churnPct}%` : "Aparece cuando hay clientes con pagos previos."}</p>
          </div>
          <div style={{ ...card, marginBottom: 0 }}>
            <p style={etiqueta}>Valor por cliente</p>
            <p style={{ fontSize: 26, fontWeight: 600, margin: "4px 0 2px" }}>{m.conPago > 0 ? formatMoney(m.ltv) : "—"}</p>
            <p style={etiqueta}>{m.conPago > 0 ? `${m.pagosPorCliente.toFixed(1)} pagos por cliente en promedio` : ""}</p>
          </div>
        </div>

        {/* Por cobrar */}
        {(m.nPendientes > 0 || m.dso !== null) && (
          <div style={card}>
            <p style={etiqueta}>Cuentas por cobrar</p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div className="vc-st-tap" onClick={() => abrir({ titulo: "Por cobrar", filas: m.listas.porCobrar })} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: "9px 11px", cursor: m.nPendientes ? "pointer" : "default" }}>
                <p style={etiqueta}>Te deben</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 17 }}>{formatMoney(m.porCobrar)}</p>
                <p style={etiqueta}>{m.nPendientes} facturas</p>
              </div>
              <div className="vc-st-tap" onClick={() => abrir({ titulo: "Facturas vencidas", filas: m.listas.vencidas })} style={{ flex: 1, background: m.nVencidas ? "rgba(226,75,74,.10)" : "var(--bg)", border: `1px solid ${m.nVencidas ? "rgba(226,75,74,.35)" : "var(--border)"}`, borderRadius: 14, padding: "9px 11px", cursor: m.nVencidas ? "pointer" : "default" }}>
                <p style={etiqueta}>Vencido</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 17, color: m.nVencidas ? "#A32D2D" : "inherit" }}>{formatMoney(m.montoVencido)}</p>
                <p style={etiqueta}>{m.nVencidas} facturas</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
              <span>
                Cobras en promedio en <b style={{ fontWeight: 600 }}>{m.dso !== null ? `${m.dso} días` : "—"}</b>
              </span>
              <span>
                Cobrado de lo facturado <b style={{ fontWeight: 600 }}>{m.facturadoMonto > 0 ? `${m.tasaCobro}%` : "—"}</b>
              </span>
            </div>
          </div>
        )}

        {/* Ingreso de clientes nuevos vs existentes */}
        {m.cobrado > 0 && (
          <div className="vc-st-tap" style={{ ...card, ...(m.cobradoNuevos ? tocable : {}) }} onClick={m.cobradoNuevos ? () => abrir({ titulo: "Ingreso de clientes nuevos", filas: m.listas.ingresoNuevos }) : undefined}>
            <p style={etiqueta}>De dónde viene lo cobrado</p>
            <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", margin: "10px 0 8px", background: "var(--border)" }}>
              <div style={{ width: `${(m.cobradoNuevos / m.cobrado) * 100}%`, background: VIOLETA }} />
              <div style={{ flex: 1, background: TEAL }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: VIOLETA }} />
                Clientes nuevos <b style={{ fontWeight: 600 }}>{formatMoney(m.cobradoNuevos)}</b>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: TEAL }} />
                Clientes existentes <b style={{ fontWeight: 600 }}>{formatMoney(m.cobrado - m.cobradoNuevos)}</b>
              </span>
            </div>
          </div>
        )}

        {/* Clientes nuevos y canales */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={etiqueta}>Por dónde entraron los clientes nuevos</p>
              <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 18 }}>
                {m.nuevos} nuevos{" "}
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>
                  ({m.nuevos - m.nuevosPrev >= 0 ? "+" : ""}
                  {m.nuevos - m.nuevosPrev} vs. antes)
                </span>
              </p>
            </div>
            {m.costoPorNuevo !== null && (
              <div style={{ textAlign: "right" }}>
                <p style={etiqueta}>Costo por cliente nuevo</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{formatMoney(m.costoPorNuevo)}</p>
              </div>
            )}
          </div>
          {m.porFuente.length === 0 ? (
            <p style={{ ...etiqueta, marginTop: 8 }}>Sin clientes nuevos en este período.</p>
          ) : (
            m.porFuente.map(([k, n]) => (
              <div key={k} className="vc-st-tap" style={{ ...tocable, marginTop: 10 }} onClick={() => abrir({ titulo: `Clientes nuevos: ${k}`, filas: m.listas.porCanalClientes(k) })}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span>{k}</span>
                  <b style={{ fontWeight: 600 }}>{n}</b>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(n / m.nuevos) * 100}%`, background: `linear-gradient(90deg, ${VIOLETA}, ${TEAL})`, borderRadius: 4 }} />
                </div>
              </div>
            ))
          )}
          <p style={{ ...etiqueta, marginTop: 10 }}>
            El canal sale solo de Stripe, tu tienda Shopify o el campo "origen" de tu Zap. Lo creado a mano aparece como "Manual / sin identificar".
          </p>
        </div>

        {m.ventasCanal.length > 0 && (
          <div style={card}>
            <p style={etiqueta}>Cobrado por canal</p>
            {m.ventasCanal.map(([k, v]) => (
              <div key={k} className="vc-st-tap" style={{ ...tocable, marginTop: 10 }} onClick={() => abrir({ titulo: `Cobrado: ${k}`, filas: m.listas.porCanalVentas(k) })}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span>
                    {k} <span style={{ color: "var(--muted)" }}>({v.n})</span>
                  </span>
                  <b style={{ fontWeight: 600 }}>{formatMoney(v.monto)}</b>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.cobrado > 0 ? (v.monto / m.cobrado) * 100 : 0}%`, background: `linear-gradient(90deg, ${TEAL}, ${VIOLETA})`, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Más indicadores */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          {[
            m.nRecurrentes > 0 || m.nDetenidas > 0
              ? { t: "Ingreso recurrente", v: formatMoney(m.mrr), n: `${m.nRecurrentes} activos · ${m.nDetenidas} detenidos`, f: m.listas.recurrentes }
              : null,
            m.nNotas > 0 ? { t: "Reembolsos y créditos", v: formatMoney(m.reembolsado), n: `${pct(m.reembolsado, m.cobrado)}% de lo cobrado`, f: m.listas.reembolsos } : null,
            { t: "Clientes dormidos", v: String(m.nDormidos), n: "Más de 6 meses sin volver", f: m.listas.dormidos },
            { t: "Seguimientos vencidos", v: String(m.nSegVenc), n: "Ya les tocaba volver", f: m.listas.segVencidos },
          ]
            .filter(Boolean)
            .map((k: any) => (
              <div key={k.t} className="vc-st-tap" style={{ ...card, marginBottom: 0, ...(k.f.length ? tocable : {}) }} onClick={k.f.length ? () => abrir({ titulo: k.t, filas: k.f }) : undefined}>
                <p style={etiqueta}>{k.t}</p>
                <p style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 2px" }}>{k.v}</p>
                <p style={etiqueta}>{k.n}</p>
              </div>
            ))}
        </div>

        <p style={{ ...etiqueta, textAlign: "center", marginTop: 8 }}>
          Son referencias de tu propio negocio, no metas. Coméntalo con tu contador o con alguien de tu industria con resultados.
        </p>
      </div>

      {/* Hoja de detalle: sube desde abajo con la lista completa */}
      {detalle && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120 }}>
          <div onClick={cerrar} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", opacity: subida ? 1 : 0, transition: "opacity .22s" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "82vh",
              overflowY: "auto",
              background: "var(--card)",
              borderRadius: "22px 22px 0 0",
              padding: "10px 18px 28px",
              transform: subida ? "translateY(0)" : "translateY(100%)",
              transition: "transform .24s ease-out",
              maxWidth: 640,
              margin: "0 auto",
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--border)", margin: "0 auto 12px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{detalle.titulo}</p>
                {detalle.nota && <p style={{ ...etiqueta, marginTop: 2 }}>{detalle.nota}</p>}
              </div>
              <button onClick={cerrar} aria-label="Cerrar" style={{ border: "none", background: "none", fontSize: 20, color: "var(--muted)" }}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              {detalle.filas.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "11px 0", borderTop: "1px solid var(--border)", fontSize: 14 }}>
                  {f.href ? (
                    <Link href={f.href} style={{ color: TEAL, textDecoration: "underline" }}>
                      {f.nombre}
                    </Link>
                  ) : (
                    <span>{f.nombre}</span>
                  )}
                  {f.extra && <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>{f.extra}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
