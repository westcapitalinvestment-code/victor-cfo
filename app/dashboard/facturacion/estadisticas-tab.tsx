"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

// Pantalla "Estadísticas" (icono propio en el nav de negocio; 3 nov 2026, pedido de
// Joel, a raíz del video de los 6 sistemas de un negocio): números del
// negocio estilo dashboard CFO, para ver cómo van las ventas y los clientes.
// REGLA DE JOEL: nada se escribe a mano. Todo sale de lo que ya existe:
// clientes, cotizaciones, facturas, seguimientos y los gastos categorizados
// como "Publicidad y mercadeo". Es orientación con los datos reales del
// usuario, no una meta ni una promesa de resultados.

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
};
type Nota = { monto: number; fecha: string; client_id: string | null; numero: string | null };
type Cot = { estado: string; total: number; fecha_emision: string; client_id: string | null };
type Seg = { estado: string; fecha_proximo: string; client_id: string | null };
// Fila de la lista de detalle que se abre al tocar una tarjeta.
type Fila = { nombre: string; extra?: string; href?: string };
type Detalle = { titulo: string; nota?: string; filas: Fila[] };

const PERIODOS = [
  { value: 30, label: "Últimos 30 días" },
  { value: 90, label: "Últimos 90 días" },
  { value: 365, label: "Últimos 12 meses" },
] as const;

const FUENTE_LABEL: Record<string, string> = {
  shopify: "Tienda en línea (Shopify)",
  api: "Integración (Zapier / API)",
  importacion: "Importado (CSV / otro sistema)",
  tecnico: "Creado por un técnico",
  stripe: "Stripe (cobro directo)",
};

const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

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
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      const desde = dias(periodo * 2); // el período actual + el anterior, para comparar
      const filtrar = (q: any) => (entidadId ? q.eq("entity_id", entidadId) : q);
      const [c, f, q, s, t, n] = await Promise.all([
        filtrar(supabase.from("clients").select("id, name, fuente, created_at")),
        filtrar(supabase
            .from("invoices")
            .select("id, client_id, total, estado, fecha_emision, fecha_pago, origen, es_recurrente, frecuencia_recurrente, factura_padre_id")),
        filtrar(supabase.from("cotizaciones").select("estado, total, fecha_emision, client_id").gte("fecha_emision", desde)),
        filtrar(supabase.from("seguimientos_clientes").select("estado, fecha_proximo, client_id")),
        filtrar(
          supabase
            .from("transactions")
            .select("amount")
            .eq("category", "Publicidad y mercadeo")
            .eq("tipo_flujo", "gasto")
            .gte("fecha", dias(periodo))
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

    const nuevos = clientes.filter((x) => x.created_at.slice(0, 10) >= ini);
    const nuevosPrev = clientes.filter((x) => x.created_at.slice(0, 10) >= iniPrev && x.created_at.slice(0, 10) < ini);

    // Origen de cada cliente nuevo: el canal de su primera factura con origen
    // (Shopify/Zapier), o si no, cómo entró al sistema (importado, técnico…).
    const primeraConOrigen = new Map<string, string>();
    [...facturas]
      .filter((x) => x.client_id && x.origen)
      .sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision))
      .forEach((x) => {
        if (!primeraConOrigen.has(x.client_id as string)) primeraConOrigen.set(x.client_id as string, x.origen as string);
      });
    const porFuente = new Map<string, number>();
    nuevos.forEach((x) => {
      const k = primeraConOrigen.get(x.id) ?? (x.fuente ? FUENTE_LABEL[x.fuente] ?? x.fuente : "Manual / sin identificar");
      porFuente.set(k, (porFuente.get(k) ?? 0) + 1);
    });

    // Ventas por canal (cobrado en el período).
    const ventasCanal = new Map<string, { n: number; monto: number }>();
    pagadasPer.forEach((x) => {
      const k = x.origen ?? (x.factura_padre_id ? "Recurrente (automática)" : "Factura directa");
      const v = ventasCanal.get(k) ?? { n: 0, monto: 0 };
      ventasCanal.set(k, { n: v.n + 1, monto: v.monto + Number(x.total || 0) });
    });

    // Ingreso recurrente: plantillas activas (es_recurrente) llevadas a mes.
    const factorMes = (f: string | null) => (f === "semanal" ? 52 / 12 : f === "quincenal" ? 2 : 1);
    const plantillas = facturas.filter((x) => x.es_recurrente && x.estado !== "borrador");
    const mrr = plantillas.reduce((a, x) => a + Number(x.total || 0) * factorMes(x.frecuencia_recurrente), 0);
    const padresConHijas = new Set(facturas.filter((x) => x.factura_padre_id).map((x) => x.factura_padre_id as string));
    const detenidas = facturas.filter((x) => !x.es_recurrente && padresConHijas.has(x.id)).length;

    // Reembolsos / notas de crédito del período.
    const reembolsado = notas.reduce((a, x) => a + Number(x.monto || 0), 0);

    const cots = cotizaciones.filter((x) => x.fecha_emision >= ini);
    const ganadas = cots.filter((x) => x.estado === "aprobada" || x.estado === "convertida");
    const perdidas = cots.filter((x) => x.estado === "rechazada");
    const abiertas = cots.filter((x) => x.estado === "enviada");

    const cobrado = pagadasPer.reduce((a, x) => a + Number(x.total || 0), 0);

    // Retención: de los clientes que han pagado alguna vez, cuántos han vuelto a pagar.
    const pagosPorCliente = new Map<string, Fac[]>();
    pagadas.forEach((x) => {
      if (!x.client_id) return;
      pagosPorCliente.set(x.client_id, [...(pagosPorCliente.get(x.client_id) ?? []), x]);
    });
    const conPago = pagosPorCliente.size;
    const repiten = [...pagosPorCliente.values()].filter((l) => l.length >= 2).length;
    const limiteDormido = dias(180);
    const dormidos = [...pagosPorCliente.values()].filter(
      (l) => l.reduce((mx, x) => (fechaCobro(x) > mx ? fechaCobro(x) : mx), "") < limiteDormido
    ).length;

    // Concentración: cuánto del cobrado del período depende de pocos clientes.
    const cobradoPorCliente = new Map<string, number>();
    pagadasPer.forEach((x) => {
      if (!x.client_id) return;
      cobradoPorCliente.set(x.client_id, (cobradoPorCliente.get(x.client_id) ?? 0) + Number(x.total || 0));
    });
    const top = [...cobradoPorCliente.entries()].sort((a, b) => b[1] - a[1]);
    const nombre = (id: string | null) => (id ? clientes.find((x) => x.id === id)?.name ?? "Cliente" : "Sin cliente");
    const hrefCli = (id: string | null) => (id ? `/dashboard/clientes/${id}/editar` : undefined);
    const fila = (id: string | null, extra?: string): Fila => ({ nombre: nombre(id), extra, href: hrefCli(id) });
    const fm = (n: number) => formatMoney(n);
    const fFecha = (f: string) => f.slice(5, 7) + "/" + f.slice(8, 10) + "/" + f.slice(0, 4);

    const hoy = dias(0);
    const segVenc = seguimientos.filter((x) => x.estado === "pendiente" && x.fecha_proximo < hoy);
    const segVencidos = segVenc.length;

    // Listas de detalle (se abren al tocar cada tarjeta).
    const ultimoPago = (l: Fac[]) => l.reduce((mx, x) => (fechaCobro(x) > mx ? fechaCobro(x) : mx), "");
    const listas = {
      nuevos: nuevos.map((x) =>
        fila(x.id, primeraConOrigen.get(x.id) ?? (x.fuente ? FUENTE_LABEL[x.fuente] ?? x.fuente : "Manual / sin identificar"))
      ),
      top: top.slice(0, 10).map(([id, v], i) => fila(id, `${fm(v)} · ${cobrado > 0 ? Math.round((v / cobrado) * 100) : 0}%`)),
      top3: top.slice(0, 3).map(([id, v]) => fila(id, `${fm(v)} · ${cobrado > 0 ? Math.round((v / cobrado) * 100) : 0}%`)),
      top1: top.slice(0, 1).map(([id, v]) => fila(id, `${fm(v)} · ${cobrado > 0 ? Math.round((v / cobrado) * 100) : 0}%`)),
      repiten: [...pagosPorCliente.entries()].filter(([, l]) => l.length >= 2).map(([id, l]) => fila(id, `${l.length} pagos`)),
      dormidos: [...pagosPorCliente.entries()]
        .filter(([, l]) => ultimoPago(l) < limiteDormido)
        .map(([id, l]) => fila(id, `último pago ${fFecha(ultimoPago(l))}`)),
      segVencidos: segVenc.map((x) => fila(x.client_id, `le tocaba ${fFecha(x.fecha_proximo)}`)),
      abiertas: abiertas.map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} · ${fFecha(x.fecha_emision)}`)),
      cierre: [...ganadas, ...perdidas].map((x) =>
        fila(x.client_id, `${x.estado === "rechazada" ? "rechazada" : "aprobada"} · ${fm(Number(x.total || 0))}`)
      ),
      recurrentes: plantillas.map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} / ${x.frecuencia_recurrente ?? "mensual"}`)),
      detenidas: facturas.filter((x) => !x.es_recurrente && padresConHijas.has(x.id)).map((x) => fila(x.client_id)),
      reembolsos: notas.map((x) => fila(x.client_id, `${fm(Number(x.monto || 0))} · ${x.numero ?? ""}`)),
      porCanalClientes: (canal: string) =>
        nuevos
          .filter((x) => (primeraConOrigen.get(x.id) ?? (x.fuente ? FUENTE_LABEL[x.fuente] ?? x.fuente : "Manual / sin identificar")) === canal)
          .map((x) => fila(x.id)),
      porCanalVentas: (canal: string) =>
        pagadasPer
          .filter((x) => (x.origen ?? (x.factura_padre_id ? "Recurrente (automática)" : "Factura directa")) === canal)
          .map((x) => fila(x.client_id, `${fm(Number(x.total || 0))} · ${fFecha(fechaCobro(x))}`)),
    };

    return {
      nuevos: nuevos.length,
      nuevosPrev: nuevosPrev.length,
      porFuente: [...porFuente.entries()].sort((a, b) => b[1] - a[1]),
      ventasCanal: [...ventasCanal.entries()].sort((a, b) => b[1].monto - a[1].monto),
      mrr,
      nRecurrentes: plantillas.length,
      detenidas,
      reembolsado,
      nNotas: notas.length,
      cots: cots.length,
      ganadas: ganadas.length,
      perdidas: perdidas.length,
      abiertas: abiertas.length,
      montoGanado: ganadas.reduce((a, x) => a + Number(x.total || 0), 0),
      cobrado,
      nPagadas: pagadasPer.length,
      ticket: pagadasPer.length ? cobrado / pagadasPer.length : 0,
      conPago,
      repiten,
      dormidos,
      segVencidos,
      costoPorNuevo: nuevos.length > 0 && gastoMercadeo > 0 ? gastoMercadeo / nuevos.length : null,
      top1: top[0] ? { nombre: nombre(top[0][0]), share: cobrado > 0 ? top[0][1] / cobrado : 0 } : null,
      top3Share: cobrado > 0 ? top.slice(0, 3).reduce((a, x) => a + x[1], 0) / cobrado : 0,
      listas,
    };
  }, [clientes, facturas, cotizaciones, seguimientos, gastoMercadeo, notas, periodo]);

  function abrir(d: Detalle) {
    setDetalle(d);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  if (cargando) return <p className="text-sm text-muted">Calculando estadísticas…</p>;

  const dif = m.nuevos - m.nuevosPrev;
  // Tarjeta tocable: abre la lista de quiénes son (clientes, cotizaciones…).
  const Kpi = ({ titulo, valor, nota, filas }: { titulo: string; valor: string; nota?: string; filas?: Fila[] }) => {
    const tocable = !!filas && filas.length > 0;
    return (
      <div
        className="vc-card"
        onClick={tocable ? () => abrir({ titulo, nota, filas: filas as Fila[] }) : undefined}
        style={tocable ? { cursor: "pointer" } : undefined}
      >
        <p className="text-xs text-muted">{titulo}</p>
        <p className="mt-1 text-xl font-semibold">{valor}</p>
        {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
        {tocable && <p className="mt-1 text-[11px] text-teal">Toca para ver quiénes →</p>}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Calculado solo con lo que ya está en tu cuenta. Nada que escribir a mano.</p>
        <select className="vc-input" style={{ width: "auto" }} value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
          {PERIODOS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div ref={panelRef}>
        {detalle && (
          <div className="vc-card mb-4" style={{ borderColor: "#1D9E75" }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{detalle.titulo}</p>
                {detalle.nota && <p className="text-xs text-muted">{detalle.nota}</p>}
              </div>
              <button onClick={() => setDetalle(null)} className="text-xs text-muted">
                Cerrar ✕
              </button>
            </div>
            <div className="mt-2">
              {detalle.filas.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
                  {f.href ? (
                    <Link href={f.href} className="text-teal underline">
                      {f.nombre}
                    </Link>
                  ) : (
                    <span>{f.nombre}</span>
                  )}
                  {f.extra && <span className="text-xs text-muted text-right">{f.extra}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h3 className="mb-2 text-sm font-semibold">Clientes nuevos</h3>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Kpi
          titulo="Clientes nuevos"
          valor={String(m.nuevos)}
          nota={m.nuevosPrev || m.nuevos ? `${dif >= 0 ? "+" : ""}${dif} vs. el período anterior (${m.nuevosPrev})` : undefined}
          filas={m.listas.nuevos}
        />
        <Kpi
          titulo="Costo por cliente nuevo"
          valor={m.costoPorNuevo !== null ? formatMoney(m.costoPorNuevo) : "—"}
          nota={
            m.costoPorNuevo !== null
              ? `Gasto en "Publicidad y mercadeo": ${formatMoney(gastoMercadeo)}`
              : 'Aparece cuando hay gastos categorizados como "Publicidad y mercadeo" y clientes nuevos.'
          }
        />
      </div>
      <div className="vc-card mb-5">
        <p className="mb-2 text-xs text-muted">Por dónde entraron los clientes nuevos</p>
        {m.porFuente.length === 0 ? (
          <p className="text-sm">Sin clientes nuevos en este período.</p>
        ) : (
          m.porFuente.map(([k, n]) => (
            <div
              key={k}
              className="flex justify-between py-1 text-sm"
              style={{ cursor: "pointer" }}
              onClick={() => abrir({ titulo: `Clientes nuevos: ${k}`, filas: m.listas.porCanalClientes(k) })}
            >
              <span>{k}</span>
              <span className="font-medium">{n}</span>
            </div>
          ))
        )}
        <p className="mt-2 text-xs text-muted">
          El canal se toma solo de tu tienda Shopify (red social, buscador, directo) o de lo que envíe tu Zap con el campo "origen". Los
          clientes creados a mano aparecen como "Manual / sin identificar".
        </p>
      </div>

      <h3 className="mb-2 text-sm font-semibold">Ventas</h3>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Kpi titulo="Cobrado" valor={formatMoney(m.cobrado)} nota={`${m.nPagadas} facturas pagadas`} filas={m.listas.top} />
        <Kpi titulo="Ticket promedio" valor={m.nPagadas ? formatMoney(m.ticket) : "—"} />
        {m.cots > 0 && (
          <>
            <Kpi titulo="Cotizaciones enviadas" valor={String(m.cots)} nota={`${m.abiertas} sin respuesta (toca para ver las abiertas)`} filas={m.listas.abiertas} />
            <Kpi
              titulo="Tasa de cierre"
              valor={pct(m.ganadas, m.cots)}
              nota={`${m.ganadas} aprobadas · ${m.perdidas} rechazadas · ${formatMoney(m.montoGanado)} aprobado`}
              filas={m.listas.cierre}
            />
          </>
        )}
      </div>
      {m.ventasCanal.length > 0 && (
        <div className="vc-card mb-5">
          <p className="mb-2 text-xs text-muted">Cobrado por canal</p>
          {m.ventasCanal.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between py-1 text-sm"
              style={{ cursor: "pointer" }}
              onClick={() => abrir({ titulo: `Cobrado: ${k}`, filas: m.listas.porCanalVentas(k) })}
            >
              <span>
                {k} <span className="text-xs text-muted">({v.n})</span>
              </span>
              <span className="font-medium">{formatMoney(v.monto)}</span>
            </div>
          ))}
        </div>
      )}
      {m.nNotas > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Kpi
            titulo="Reembolsos y créditos"
            valor={formatMoney(m.reembolsado)}
            nota={`${m.nNotas} en el período · ${pct(m.reembolsado, m.cobrado)} de lo cobrado`}
            filas={m.listas.reembolsos}
          />
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold">Retención</h3>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Kpi titulo="Clientes que repiten" valor={pct(m.repiten, m.conPago)} nota={`${m.repiten} de ${m.conPago} clientes que han pagado`} filas={m.listas.repiten} />
        <Kpi titulo="Clientes dormidos" valor={String(m.dormidos)} nota="Pagaron antes, pero llevan más de 6 meses sin volver." filas={m.listas.dormidos} />
        {(m.nRecurrentes > 0 || m.detenidas > 0) && (
          <>
            <Kpi titulo="Ingreso mensual recurrente" valor={formatMoney(m.mrr)} nota={`${m.nRecurrentes} cobros recurrentes activos`} filas={m.listas.recurrentes} />
            <Kpi titulo="Recurrentes detenidos" valor={String(m.detenidas)} nota="Cobros recurrentes que ya se apagaron (cancelaciones)." filas={m.listas.detenidas} />
          </>
        )}
        <Kpi titulo="Seguimientos vencidos" valor={String(m.segVencidos)} nota="Clientes a quienes ya les tocaba volver y no se les ha contactado." filas={m.listas.segVencidos} />
      </div>

      <h3 className="mb-2 text-sm font-semibold">Dependencia de clientes</h3>
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          titulo="Cliente que más aporta"
          valor={m.top1 ? `${Math.round(m.top1.share * 100)}%` : "—"}
          nota={m.top1 ? m.top1.nombre : "Sin cobros en el período."}
          filas={m.listas.top1}
        />
        <Kpi titulo="Tus 3 mejores clientes" valor={m.cobrado > 0 ? `${Math.round(m.top3Share * 100)}%` : "—"} nota="Del total cobrado en el período." filas={m.listas.top3} />
      </div>

      <p className="mt-4 text-xs text-muted">
        Son referencias de tu propio negocio, no metas. Cada negocio es distinto: coméntalo con tu contador o con alguien de tu industria con
        resultados.
      </p>
    </div>
  );
}
