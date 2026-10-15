import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatFecha } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";

// Portal en línea del cliente (15 oct 2026, auditoría vs FreshBooks — #302).
// Página PÚBLICA, sin login: el "password" es el portal_token del cliente
// (UUID de 122 bits, migración 0157). Solo muestra las facturas de ESE
// cliente — nunca datos internos del dueño — con link al PDF y, si la
// entidad cobra con tarjeta, al pago. Filtros por query string para que sea
// un server component simple y sin JS.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mis facturas",
  robots: { index: false, follow: false },
};

type Fila = {
  id: string;
  numero: string;
  total: number;
  estado: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  business_entities: { name: string; stripe_connect_charges_enabled: boolean | null } | { name: string; stripe_connect_charges_enabled: boolean | null }[] | null;
};

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>{titulo}</h1>
      <p style={{ fontSize: 14, color: "#666" }}>{texto}</p>
    </main>
  );
}

export default async function PortalClientePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { ver?: string };
}) {
  if (!TOKEN_RE.test(params.token)) return <Mensaje titulo="Enlace no válido" texto="Pídele a tu proveedor que te reenvíe el enlace." />;

  const supabase = createAdminClient();
  const { data: cliente } = await supabase.from("clients").select("id, name").eq("portal_token", params.token).maybeSingle();
  if (!cliente) return <Mensaje titulo="Enlace no válido" texto="Pídele a tu proveedor que te reenvíe el enlace." />;

  const { data: filas } = await supabase
    .from("invoices")
    .select(
      "id, numero, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, business_entities(name, stripe_connect_charges_enabled)"
    )
    .eq("client_id", cliente.id)
    .not("estado", "in", "(borrador,anulada)")
    .order("fecha_emision", { ascending: false })
    .limit(300);

  const facturas = (filas ?? []) as unknown as Fila[];
  const hoy = fechaHoyPR();
  const vencida = (f: Fila) => f.estado !== "pagada" && !!f.fecha_vencimiento && f.fecha_vencimiento < hoy;

  const pendientes = facturas.filter((f) => f.estado !== "pagada" && Number(f.total) > 0);
  const saldo = pendientes.reduce((s, f) => s + Number(f.total), 0);
  const saldoVencido = pendientes.filter(vencida).reduce((s, f) => s + Number(f.total), 0);
  const pagadas = facturas.filter((f) => f.estado === "pagada");
  const totalPagado = pagadas.reduce((s, f) => s + Number(f.total), 0);
  const anioActual = hoy.slice(0, 4);
  const pagadoEsteAnio = pagadas
    .filter((f) => (f.fecha_pago ?? f.fecha_emision ?? "").startsWith(anioActual))
    .reduce((s, f) => s + Number(f.total), 0);

  const ver = searchParams.ver === "pagadas" || searchParams.ver === "pendientes" ? searchParams.ver : "todas";
  const mostrar = facturas.filter((f) => (ver === "pagadas" ? f.estado === "pagada" : ver === "pendientes" ? f.estado !== "pagada" : true));

  const base = `/portal-cliente/${params.token}`;
  const tab = (id: string, label: string) => (
    <a
      key={id}
      href={id === "todas" ? base : `${base}?ver=${id}`}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 13,
        textDecoration: "none",
        border: "1px solid #d9e3df",
        background: ver === id ? "#1D9E75" : "#fff",
        color: ver === id ? "#fff" : "#333",
      }}
    >
      {label}
    </a>
  );

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Hola, {cliente.name}</h1>
      <p style={{ fontSize: 14, color: "#666", marginTop: 4 }}>Aquí puedes ver y pagar tus facturas.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, margin: "20px 0" }}>
        {[
          { t: "Saldo pendiente", v: formatMoney(saldo), sub: `${pendientes.length} factura${pendientes.length === 1 ? "" : "s"}`, c: "#1a1a1a" },
          { t: "De eso, vencido", v: formatMoney(saldoVencido), sub: "", c: saldoVencido > 0 ? "#c0392b" : "#1a1a1a" },
          { t: `Pagado en ${anioActual}`, v: formatMoney(pagadoEsteAnio), sub: "", c: "#1D9E75" },
          { t: "Pagado en total", v: formatMoney(totalPagado), sub: `${pagadas.length} factura${pagadas.length === 1 ? "" : "s"}`, c: "#1D9E75" },
        ].map((k) => (
          <div key={k.t} style={{ border: "1px solid #d9e3df", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#666" }}>{k.t}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: k.c }}>{k.v}</div>
            {k.sub && <div style={{ fontSize: 11, color: "#999" }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tab("todas", "Todas")}
        {tab("pendientes", "Pendientes")}
        {tab("pagadas", "Pagadas")}
      </div>

      {mostrar.length === 0 ? (
        <p style={{ fontSize: 14, color: "#666" }}>No hay facturas en esta vista.</p>
      ) : (
        <div style={{ border: "1px solid #d9e3df", borderRadius: 12, overflow: "hidden" }}>
          {mostrar.map((f) => {
            const ent = Array.isArray(f.business_entities) ? f.business_entities[0] : f.business_entities;
            const pagada = f.estado === "pagada";
            const esVencida = vencida(f);
            return (
              <div key={f.id} style={{ padding: 14, borderBottom: "1px solid #eef3f1", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{f.numero}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {ent?.name ? `${ent.name} · ` : ""}Emitida {formatFecha(f.fecha_emision)}
                    {pagada && f.fecha_pago ? ` · Pagada ${formatFecha(f.fecha_pago)}` : f.fecha_vencimiento ? ` · Vence ${formatFecha(f.fecha_vencimiento)}` : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 12, fontSize: 13 }}>
                    <a href={`/api/facturas/${f.id}/pdf`} style={{ color: "#1D9E75" }}>
                      Ver factura
                    </a>
                    {!pagada && ent?.stripe_connect_charges_enabled && (
                      <a href={`/api/facturas/${f.id}/pagar`} style={{ color: "#1D9E75", fontWeight: 600 }}>
                        💳 Pagar con tarjeta
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 600 }}>{formatMoney(Number(f.total))}</div>
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 4,
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                      background: pagada ? "#1D9E75" : esVencida ? "#fdecea" : "#e8f5f0",
                      color: pagada ? "#fff" : esVencida ? "#c0392b" : "#1D9E75",
                    }}
                  >
                    {pagada ? "Pagada" : esVencida ? "Vencida" : "Pendiente"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "#bbb", textAlign: "center", marginTop: 28 }}>Enviado a través de VICTOR CFO · victorcfo.com</p>
    </main>
  );
}
