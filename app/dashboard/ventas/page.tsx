import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { esFounder } from "@/lib/founder";
import SociosPanel from "../cfo/socios-panel";

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

  return (
    <div className="vc-shell">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-lg font-medium">Ventas</h1>
        <span className="rounded-pill border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">Ops</span>
      </div>
      <p className="mb-4 text-xs text-muted">Vendedores, socios y contables en un solo lugar.</p>

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
      <div className="vc-card mt-3">
        <p className="mb-1 text-sm font-medium">Contables — VICTOR Accountant ({(firmas ?? []).length})</p>
        <p className="mb-3 text-[11px] text-muted">
          Business a $60/mes (40% menos) por cada cliente que invitan. Los addons se facturan aparte al cliente.
        </p>
        {(firmas ?? []).length === 0 ? (
          <p className="py-2 text-center text-sm text-muted">Ningún contable activado todavía.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(firmas ?? []).map((f) => {
              const c = clientesPorFirma.get(f.id) ?? { total: 0, activos: 0 };
              const seats = Number(f.firma_seats_activos ?? 0);
              return (
                <div key={f.id} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.full_name || f.email}</p>
                      <p className="truncate text-[11px] text-muted">
                        {f.email}
                        {f.firma_registro_comerciante ? ` · Reg. Comerciante ${f.firma_registro_comerciante}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-muted">
                      <p>{c.activos} clientes activos ({c.total} invitados)</p>
                      <p>
                        Facturado al contable (est. a $60):<span className="font-medium text-white">{fmt(seats * 6000)}/mes</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
