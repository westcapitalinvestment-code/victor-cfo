import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { esFounder } from "@/lib/founder";
import SociosPanel from "../cfo/socios-panel";
import ContablesPanel from "./contables-panel";

// Ventas (13 oct 2026, pedido de Joel: "sácalo de CFO y ponme Ventas como
// penúltimo; ahí va todo lo que tenga que ver con ventas, socios y
// contables"). Antes el Programa de Socios vivía dentro del dashboard CFO
// (app/dashboard/cfo/page.tsx). Se mudó aquí junto con VICTOR Accountant
// (contables que invitan clientes con 40% de descuento en Business). Solo
// visible para el founder — usa service_role porque estas tablas no tienen
// políticas de RLS para usuarios normales.
function fmt(centavos: number) {
  return `$${(centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="vc-card">
      <p className="text-[10px] uppercase tracking-wide text-muted">{titulo}</p>
      <p className="mt-1 text-lg font-medium">{valor}</p>
      {nota && <p className="text-[10px] text-muted">{nota}</p>}
    </div>
  );
}

export default async function VentasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!esFounder(user.email)) redirect("/dashboard");

  const admin = createAdminClient();

  const [
    { data: socios },
    { data: comisionesSocios },
    { data: vendedorClientes },
    { data: retencionesVendedor },
    { data: prospectosVendedor },
    { data: firmas },
    { data: clientesDeFirmas },
  ] = await Promise.all([
    admin
      .from("socios")
      .select(
        "id, tipo, nombre, email, telefono, como_promociona, codigo, estado, created_at, payment_token, datos_pago_completados_at, bank_name, account_last4"
      )
      .order("created_at", { ascending: false }),
    admin.from("socios_comisiones").select("id, socio_id, plan, comision_centavos, estado, created_at"),
    admin
      .from("socios_vendedor_clientes")
      .select(
        "id, socio_id, referred_id, ciclo, modelo, primer_pago_at, setenta_centavos, treinta_centavos, treinta_estado, monto_base_centavos"
      ),
    admin.from("socios_vendedor_retenciones").select("comision_id, retention_centavos"),
    // Si la migración 0150 aún no corrió, data viene null y el panel muestra ceros.
    admin.from("socios_prospectos").select("socio_id, estado"),
    // VICTOR Accountant (migración 0139): contadores con Firma activa.
    admin
      .from("users")
      .select("id, full_name, email, firma_seats_activos, firma_registro_comerciante")
      .eq("es_firma_accountant", true),
    admin.from("users").select("billed_by_firma_id, plan_status").not("billed_by_firma_id", "is", null),
  ]);

  const clientesPorFirma = new Map<string, { total: number; activos: number }>();
  for (const c of clientesDeFirmas ?? []) {
    const id = c.billed_by_firma_id as string;
    const actual = clientesPorFirma.get(id) ?? { total: 0, activos: 0 };
    actual.total += 1;
    if (c.plan_status === "active") actual.activos += 1;
    clientesPorFirma.set(id, actual);
  }

  // ---- Tarjetas de producción (vendedores) ----
  // Solo cuentan clientes cuyo usuario sigue con plan activo (en prueba
  // también cuenta como activo, igual que el resto del dashboard).
  const vendedoresIds = new Set((socios ?? []).filter((s) => s.tipo === "vendedor" && s.estado === "aprobado").map((s) => s.id));
  const filasVendedor = (vendedorClientes ?? []).filter((v) => vendedoresIds.has(v.socio_id));
  const referidosIds = filasVendedor.map((v) => v.referred_id).filter(Boolean) as string[];
  const { data: usuariosReferidos } = referidosIds.length
    ? await admin.from("users").select("id, plan_status").in("id", referidosIds)
    : { data: [] as { id: string; plan_status: string | null }[] };
  const activosSet = new Set((usuariosReferidos ?? []).filter((u) => u.plan_status === "active").map((u) => u.id));

  const ingresoMensualFila = (v: (typeof filasVendedor)[number]) => {
    const setenta = Number(v.setenta_centavos);
    const treinta = Number(v.treinta_centavos);
    if (v.modelo === "unico") {
      const real = v.monto_base_centavos != null ? Number(v.monto_base_centavos) : setenta;
      return v.ciclo === "anual" ? Math.round(real / 12) : real;
    }
    return setenta + treinta;
  };

  const clientesActivosVendedores = filasVendedor.filter((v) => activosSet.has(v.referred_id as string));
  const mrrVendedores = clientesActivosVendedores.reduce((sum, v) => sum + ingresoMensualFila(v), 0);
  const treintaPorDeber = filasVendedor
    .filter((v) => v.treinta_estado === "pendiente")
    .reduce((sum, v) => sum + Number(v.treinta_centavos), 0);

  const comisionesVendedor = (comisionesSocios ?? []).filter((c) => vendedoresIds.has(c.socio_id));
  const retencionDe = (comisionId: string) =>
    Number((retencionesVendedor ?? []).find((r) => r.comision_id === comisionId)?.retention_centavos ?? 0);
  const comisionNeto = (c: (typeof comisionesVendedor)[number]) => Number(c.comision_centavos) - retencionDe(c.id);
  const pagadoVendedores = comisionesVendedor.filter((c) => c.estado === "pagada").reduce((sum, c) => sum + comisionNeto(c), 0);
  const porPagarVendedores = comisionesVendedor.filter((c) => c.estado === "pendiente").reduce((sum, c) => sum + comisionNeto(c), 0);

  const prospectosDeVendedores = (prospectosVendedor ?? []).filter((p) => vendedoresIds.has(p.socio_id as string));
  const prosVigentes = prospectosDeVendedores.filter((p) => p.estado === "vigente").length;
  const prosConvertidos = prospectosDeVendedores.filter((p) => p.estado === "convertido").length;

  // ---- Tarjetas de producción (contables) ----
  const PRECIO_FIRMA_CENTAVOS = 6000; // $60/mes (40% menos que $99.99), ver lib/stripe.ts
  const contablesFilas = (firmas ?? []).map((f) => {
    const c = clientesPorFirma.get(f.id) ?? { total: 0, activos: 0 };
    return {
      id: f.id as string,
      nombre: (f.full_name || f.email || "Contable") as string,
      email: (f.email || "") as string,
      registroComerciante: (f.firma_registro_comerciante as string | null) ?? null,
      clientesActivos: c.activos,
      clientesInvitados: c.total,
      seats: Number(f.firma_seats_activos ?? 0),
      ingresoMensualCentavos: c.activos * PRECIO_FIRMA_CENTAVOS,
    };
  });
  const clientesActivosContables = contablesFilas.reduce((sum, c) => sum + c.clientesActivos, 0);
  const mrrContables = clientesActivosContables * PRECIO_FIRMA_CENTAVOS;

  return (
    <div className="vc-shell">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-lg font-medium">Ventas</h1>
        <span className="rounded-pill border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">Ops</span>
      </div>
      <p className="mb-3 text-xs text-muted">Vendedores, socios y contables en un solo lugar.</p>

      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Producción — Vendedores</p>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tarjeta titulo="Ingreso mensual generado" valor={fmt(mrrVendedores)} nota="MRR de clientes activos" />
        <Tarjeta titulo="Clientes activos" valor={String(clientesActivosVendedores.length)} nota={`${filasVendedor.length} traídos en total`} />
        <Tarjeta titulo="Comisión pagada (neto)" valor={fmt(pagadoVendedores)} nota="a la fecha" />
        <Tarjeta titulo="Por pagar ahora (neto)" valor={fmt(porPagarVendedores)} nota="comisiones pendientes" />
        <Tarjeta titulo="30% por deber" valor={fmt(treintaPorDeber)} nota="si llegan al 3er pago" />
        <Tarjeta titulo="Vendedores activos" valor={String(vendedoresIds.size)} nota="aprobados" />
        <Tarjeta titulo="Prospectos vigentes" valor={String(prosVigentes)} nota="en ventana de 60 días" />
        <Tarjeta titulo="Prospectos convertidos" valor={String(prosConvertidos)} nota="se hicieron clientes" />
      </div>

      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Producción — Contables</p>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tarjeta titulo="Ingreso mensual generado" valor={fmt(mrrContables)} nota="est. a $60 por cliente" />
        <Tarjeta titulo="Clientes activos" valor={String(clientesActivosContables)} nota="invitados por contables" />
        <Tarjeta titulo="Contables activados" valor={String(contablesFilas.length)} nota="VICTOR Accountant" />
        <Tarjeta titulo="Ingreso total ventas" valor={fmt(mrrVendedores + mrrContables)} nota="vendedores + contables / mes" />
      </div>

      {/* Programa de Socios: solicitudes, vendedores, comisiones, prospectos y pagos */}
      <SociosPanel
        socios={(socios ?? []).map((s) => ({
          id: s.id,
          tipo: s.tipo,
          nombre: s.nombre,
          email: s.email,
          telefono: s.telefono,
          comoPromociona: s.como_promociona,
          codigo: s.codigo,
          estado: s.estado as "pendiente" | "aprobado" | "suspendido",
          createdAt: s.created_at,
          paymentToken: s.payment_token,
          datosPagoCompletados: !!s.datos_pago_completados_at,
          bankName: s.bank_name,
          accountLast4: s.account_last4,
        }))}
        comisiones={(comisionesSocios ?? []).map((c) => {
          const retencion = (retencionesVendedor ?? []).find((r) => r.comision_id === c.id);
          return {
            id: c.id,
            socioId: c.socio_id,
            plan: c.plan,
            comisionCentavos: Number(c.comision_centavos),
            estado: c.estado as "pendiente" | "pagada",
            createdAt: c.created_at,
            retenidoCentavos: retencion ? Number(retencion.retention_centavos) : 0,
          };
        })}
        vendedorClientes={(vendedorClientes ?? []).map((v) => ({
          id: v.id,
          socioId: v.socio_id,
          ciclo: v.ciclo as "mensual" | "anual",
          modelo: (v.modelo ?? "setenta_treinta") as "setenta_treinta" | "unico",
          primerPagoAt: v.primer_pago_at,
          setentaCentavos: Number(v.setenta_centavos),
          treintaCentavos: Number(v.treinta_centavos),
          treintaEstado: v.treinta_estado as "pendiente" | "liberada" | "perdida",
          montoBaseCentavos: v.monto_base_centavos != null ? Number(v.monto_base_centavos) : null,
        }))}
        prospectos={(prospectosVendedor ?? []).map((p) => ({
          socioId: p.socio_id as string,
          estado: p.estado as string,
        }))}
      />

      {/* Contables: VICTOR Accountant (40% menos en Business para clientes que invitan) */}
      <ContablesPanel contables={contablesFilas} />
    </div>
  );
}
