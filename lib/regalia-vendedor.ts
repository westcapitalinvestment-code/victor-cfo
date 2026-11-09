import { createAdminClient } from "@/lib/supabase/admin";
import { registrarRetencionVendedor } from "@/lib/retencion-vendedor";

// Regalía mensual de vendedores (migración 0208, 9 nov 2026, decisión de Joel).
// Es APARTE de la comisión (70/30 o 20% anual):
//   - Solo clientes Pro y Business del vendedor (Core no genera regalía).
//   - Empieza en el mes 7 del cliente (6 meses después de su primer pago real).
//   - 4% del precio MENSUAL del plan, solo el plan (sin add-ons): $2 Pro, $4 Business.
//   - Se paga mensual, igual si el cliente paga mensual o anual.
//   - Mientras el cliente siga activo y el vendedor siga aprobado.

export const PORCENTAJE_REGALIA_VENDEDOR = 0.04;
export const MESES_ANTES_DE_REGALIA = 6;

// Precio mensual de lista de cada plan. Si cambian los precios en Stripe,
// actualizar aquí también.
const PRECIO_MENSUAL_LISTA_CENTAVOS = { pro: 4_999, proplus: 9_999 } as const;

export type PlanConRegalia = keyof typeof PRECIO_MENSUAL_LISTA_CENTAVOS;

export function planGeneraRegalia(plan: string | null | undefined): plan is PlanConRegalia {
  return plan === "pro" || plan === "proplus";
}

export function regaliaMensualCentavos(plan: PlanConRegalia): number {
  return Math.round(PRECIO_MENSUAL_LISTA_CENTAVOS[plan] * PORCENTAJE_REGALIA_VENDEDOR);
}

// Fecha en que el cliente entra a su mes 7.
export function inicioRegalia(primerPagoAt: string): Date {
  const f = new Date(primerPagoAt);
  f.setMonth(f.getMonth() + MESES_ANTES_DE_REGALIA);
  return f;
}

export function yaGeneraRegalia(primerPagoAt: string | null | undefined, hoy: Date = new Date()): boolean {
  if (!primerPagoAt) return false;
  return inicioRegalia(primerPagoAt) <= hoy;
}

// Periodo AAAAMM en hora de Puerto Rico — es el ciclo_numero de la fila de regalía.
export function periodoRegaliaPR(fecha: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Puerto_Rico",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(fecha);
  const anio = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return anio * 100 + mes;
}

// Crea la regalía del mes en curso para cada cliente que ya la genera. Es
// idempotente: corre a diario y el UNIQUE (referred_id, tipo_comision,
// ciclo_numero) impide crear dos filas el mismo mes para el mismo cliente.
export async function procesarRegaliasVendedores(admin: ReturnType<typeof createAdminClient>) {
  const periodo = periodoRegaliaPR();
  const hoy = new Date();

  const { data: clientesVendedor, error } = await admin
    .from("socios_vendedor_clientes")
    .select("socio_id, referred_id, primer_pago_at");
  if (error) throw error;

  const candidatos = (clientesVendedor ?? []).filter((c) => yaGeneraRegalia(c.primer_pago_at as string, hoy));
  if (candidatos.length === 0) return { periodo, creadas: 0 };

  const idsClientes = Array.from(new Set(candidatos.map((c) => c.referred_id as string)));
  const idsSocios = Array.from(new Set(candidatos.map((c) => c.socio_id as string)));

  const [{ data: usuarios }, { data: socios }, { data: yaCreadas }] = await Promise.all([
    admin.from("users").select("id, plan, plan_status").in("id", idsClientes),
    admin
      .from("socios")
      .select("id, tipo, estado, relevo_r2_key, relevo_pct, relevo_fecha_expiracion")
      .in("id", idsSocios),
    admin
      .from("socios_comisiones")
      .select("referred_id")
      .eq("tipo_comision", "regalia")
      .eq("ciclo_numero", periodo)
      .in("referred_id", idsClientes),
  ]);

  const usuarioPorId = new Map((usuarios ?? []).map((u) => [u.id as string, u]));
  const socioPorId = new Map((socios ?? []).map((s) => [s.id as string, s]));
  const yaTienen = new Set((yaCreadas ?? []).map((r) => r.referred_id as string));

  let creadas = 0;
  for (const c of candidatos) {
    const referidoId = c.referred_id as string;
    if (yaTienen.has(referidoId)) continue;

    const usuario = usuarioPorId.get(referidoId);
    const socio = socioPorId.get(c.socio_id as string);
    if (!usuario || !socio) continue;
    if (usuario.plan_status !== "active" || !planGeneraRegalia(usuario.plan as string)) continue;
    if (socio.tipo === "cpa" || socio.estado !== "aprobado") continue;

    const monto = regaliaMensualCentavos(usuario.plan as PlanConRegalia);
    const { data: fila, error: errorFila } = await admin
      .from("socios_comisiones")
      .insert({
        socio_id: socio.id,
        referred_id: referidoId,
        plan: usuario.plan,
        comision_centavos: monto,
        tipo_comision: "regalia",
        ciclo_numero: periodo,
      })
      .select("id")
      .single();
    // Duplicado (otra corrida ya la creó) u otro error: no se paga dos veces.
    if (errorFila) continue;

    await registrarRetencionVendedor(admin, socio as Parameters<typeof registrarRetencionVendedor>[1], fila?.id ?? null, monto);
    creadas += 1;
  }

  return { periodo, creadas };
}
