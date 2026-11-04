import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatFecha } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";
import SubirDocumento from "./subir-documento";

// Portal en línea del contratista (4 nov 2026, migración 0207). Página PÚBLICA,
// sin login: el "password" es el portal_token del contratista. Solo lectura de
// SUS pagos y retenciones (nunca datos internos del negocio) + su copia del
// Modelo 480.6SP y envío de documentos que el dueño revisa antes de aplicar.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mis pagos",
  robots: { index: false, follow: false },
};

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pago = {
  id: string;
  gross_amount: number;
  retention_pct: number;
  retention_amount: number;
  net_paid: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  business_entities: { name: string } | { name: string }[] | null;
};

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>{titulo}</h1>
      <p style={{ fontSize: 14, color: "#666" }}>{texto}</p>
    </main>
  );
}

export default async function PortalContratistaPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { anio?: string };
}) {
  if (!TOKEN_RE.test(params.token)) return <Mensaje titulo="Enlace no válido" texto="Pídele a quien te paga que te reenvíe el enlace." />;

  const supabase = createAdminClient();
  const { data: v } = await supabase
    .from("vendors")
    .select("id, name, email, address, tax_id, relevo_r2_key, relevo_pct, relevo_fecha_expiracion, registro_comerciante_r2_key")
    .eq("portal_token", params.token)
    .maybeSingle();
  if (!v) return <Mensaje titulo="Enlace no válido" texto="Pídele a quien te paga que te reenvíe el enlace." />;
  const vendor = v as {
    id: string; name: string; email: string | null; address: string | null; tax_id: string | null;
    relevo_r2_key: string | null; relevo_pct: number | null; relevo_fecha_expiracion: string | null;
    registro_comerciante_r2_key: string | null;
  };

  const hoy = fechaHoyPR();
  const anioActual = Number(hoy.slice(0, 4));
  const anio = Number(searchParams.anio) >= 2000 && Number(searchParams.anio) <= anioActual ? Number(searchParams.anio) : anioActual;

  const { data: filas } = await supabase
    .from("vendor_retenciones")
    .select("id, gross_amount, retention_pct, retention_amount, net_paid, period_start, period_end, created_at, business_entities(name)")
    .eq("vendor_id", vendor.id)
    .gte("created_at", `${anio}-01-01`)
    .lt("created_at", `${anio + 1}-01-01`)
    .order("created_at", { ascending: false })
    .limit(500);
  const pagos = (filas ?? []) as unknown as Pago[];

  const bruto = pagos.reduce((s, p) => s + Number(p.gross_amount), 0);
  const retenido = pagos.reduce((s, p) => s + Number(p.retention_amount), 0);
  const neto = pagos.reduce((s, p) => s + Number(p.net_paid), 0);

  const { data: formasRaw } = await supabase
    .from("vendor_480_forms")
    .select("id, anio, created_at")
    .eq("vendor_id", vendor.id)
    .order("anio", { ascending: false });
  const formas = (formasRaw ?? []) as { id: string; anio: number; created_at: string }[];

  const { data: subidasRaw } = await supabase
    .from("vendor_portal_subidas")
    .select("id, tipo, estado, created_at")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const subidas = (subidasRaw ?? []) as { id: string; tipo: string; estado: string; created_at: string }[];

  const relevoVigente = !!vendor.relevo_r2_key && !!vendor.relevo_fecha_expiracion && vendor.relevo_fecha_expiracion >= hoy;
  const base = `/portal-contratista/${params.token}`;
  const anios = Array.from({ length: Math.min(5, anioActual - 2019) }, (_, i) => anioActual - i);
  const estadoTxt: Record<string, string> = { pendiente: "En revisión", aplicada: "Aceptado", rechazada: "Rechazado" };
  const tipoTxt: Record<string, string> = { relevo: "Certificado de Relevo", registro_comerciante: "Registro de Comerciante" };

  const caja = { border: "1px solid #d9e3df", borderRadius: 12, padding: 14 } as const;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Hola, {vendor.name}</h1>
      <p style={{ fontSize: 14, color: "#666", marginTop: 4 }}>Aquí ves lo que se te ha pagado, lo que se te retuvo y tus documentos.</p>

      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
        {anios.map((a) => (
          <a
            key={a}
            href={a === anioActual ? base : `${base}?anio=${a}`}
            style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13, textDecoration: "none", border: "1px solid #d9e3df", background: a === anio ? "#1D9E75" : "#fff", color: a === anio ? "#fff" : "#333" }}
          >
            {a}
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { t: `Pagado en ${anio} (bruto)`, v: formatMoney(bruto), c: "#1a1a1a" },
          { t: "Retenido", v: formatMoney(retenido), c: retenido > 0 ? "#c0392b" : "#1a1a1a" },
          { t: "Neto recibido", v: formatMoney(neto), c: "#1D9E75" },
        ].map((k) => (
          <div key={k.t} style={caja}>
            <div style={{ fontSize: 12, color: "#666" }}>{k.t}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Pagos de {anio}</h2>
      {pagos.length === 0 ? (
        <p style={{ fontSize: 14, color: "#666" }}>No hay pagos registrados en {anio}.</p>
      ) : (
        <div style={{ border: "1px solid #d9e3df", borderRadius: 12, overflow: "hidden" }}>
          {pagos.map((p) => {
            const ent = Array.isArray(p.business_entities) ? p.business_entities[0] : p.business_entities;
            return (
              <div key={p.id} style={{ padding: 14, borderBottom: "1px solid #eef3f1", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{formatFecha(p.created_at.slice(0, 10))}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {ent?.name ? `${ent.name} · ` : ""}
                    {p.period_start && p.period_end ? `Período ${formatFecha(p.period_start)} – ${formatFecha(p.period_end)}` : "Pago"}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{formatMoney(Number(p.gross_amount))}</div>
                  <div style={{ color: "#666" }}>
                    Retenido {Number(p.retention_pct)}% · {formatMoney(Number(p.retention_amount))}
                  </div>
                  <div style={{ color: "#1D9E75" }}>Neto {formatMoney(Number(p.net_paid))}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 style={{ fontSize: 15, margin: "24px 0 8px" }}>Modelo 480.6SP</h2>
      <div style={caja}>
        {formas.length === 0 ? (
          <p style={{ fontSize: 13, color: "#666", margin: 0 }}>Todavía no hay un 480.6SP disponible. Aparecerá aquí cuando el negocio lo prepare (normalmente a principios de año).</p>
        ) : (
          formas.map((f) => (
            <div key={f.id} style={{ fontSize: 14, padding: "4px 0" }}>
              <a href={`/api/portal-contratista/${params.token}/forma/${f.id}`} style={{ color: "#1D9E75" }}>
                Descargar 480.6SP del año {f.anio}
              </a>
            </div>
          ))
        )}
      </div>

      <h2 style={{ fontSize: 15, margin: "24px 0 8px" }}>Mis documentos y datos</h2>
      <div style={caja}>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div>Certificado de Relevo: <b>{relevoVigente ? `vigente hasta ${formatFecha(vendor.relevo_fecha_expiracion)} (${Number(vendor.relevo_pct)}%)` : vendor.relevo_r2_key ? "vencido" : "no entregado"}</b></div>
          <div>Registro de Comerciante: <b>{vendor.registro_comerciante_r2_key ? "entregado" : "no entregado"}</b></div>
          <div>Dirección postal: <b>{vendor.address || "no registrada"}</b></div>
          <div>Correo: <b>{vendor.email || "no registrado"}</b></div>
          {vendor.tax_id && <div>SSN/EIN: <b>•••• {vendor.tax_id.replace(/\D/g, "").slice(-4)}</b></div>}
        </div>
        <SubirDocumento token={params.token} direccion={vendor.address ?? ""} correo={vendor.email ?? ""} />
        {subidas.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            {subidas.map((s) => (
              <div key={s.id}>
                {tipoTxt[s.tipo]} · {formatFecha(s.created_at.slice(0, 10))} · {estadoTxt[s.estado]}
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "#999", marginTop: 24, lineHeight: 1.5 }}>
        Esta información es un resumen de los pagos registrados por el negocio. No es un documento oficial de Hacienda; consúltalo con tu contable para tu planilla.
      </p>
      <p style={{ fontSize: 11, color: "#bbb", textAlign: "center", marginTop: 8 }}>Enviado a través de VICTOR CFO · victorcfo.com</p>
    </main>
  );
}
