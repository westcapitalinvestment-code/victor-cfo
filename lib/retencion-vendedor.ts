import { createAdminClient } from "@/lib/supabase/admin";

// Retención Sección 1062.03 sobre las comisiones del vendedor (migración
// 0138, 3 oct 2026). Extraída del webhook de Stripe el 18 oct 2026 para que
// los bonos de oficinas (migración 0164) usen exactamente la misma regla.
// Mismo umbral y misma mecánica MARGINAL que Pagos: los primeros $500
// acumulados en el año calendario no retienen nada; de ahí en adelante 10%
// salvo que el vendedor tenga un Certificado de Relevo vigente.
const UMBRAL_DECLARAR_CENTAVOS_VENDEDOR = 50_000; // $500

export async function registrarRetencionVendedor(
  admin: ReturnType<typeof createAdminClient>,
  socio: { id: string; relevo_r2_key?: string | null; relevo_pct?: number | null; relevo_fecha_expiracion?: string | null },
  comisionId: string | null,
  grossCentavos: number
) {
  if (grossCentavos <= 0) return;

  const anio = new Date().getFullYear();

  const { data: previas } = await admin
    .from("socios_vendedor_retenciones")
    .select("gross_centavos")
    .eq("socio_id", socio.id)
    .eq("anio", anio);
  const acumuladoPrevio = (previas ?? []).reduce((sum, r) => sum + Number(r.gross_centavos), 0);

  const hoyISO = new Date().toISOString().slice(0, 10);
  const relevoVigente =
    !!socio.relevo_r2_key && (!socio.relevo_fecha_expiracion || socio.relevo_fecha_expiracion >= hoyISO);
  const pct = relevoVigente ? Number(socio.relevo_pct ?? 0) : 10;

  const excesoPrevio = Math.max(0, acumuladoPrevio - UMBRAL_DECLARAR_CENTAVOS_VENDEDOR);
  const excesoNuevo = Math.max(0, acumuladoPrevio + grossCentavos - UMBRAL_DECLARAR_CENTAVOS_VENDEDOR);
  const baseTributableCentavos = excesoNuevo - excesoPrevio;
  const retentionCentavos = pct > 0 ? Math.round(baseTributableCentavos * (pct / 100)) : 0;

  const { error } = await admin.from("socios_vendedor_retenciones").insert({
    socio_id: socio.id,
    comision_id: comisionId,
    anio,
    gross_centavos: grossCentavos,
    retention_pct: pct,
    retention_centavos: retentionCentavos,
  });
  if (error) {
    // No relanzamos — perder el registro de retención no debe tumbar el
    // webhook ni la comisión ya insertada; Joel puede corregirlo a mano si
    // hace falta, pero el pago del vendedor no se bloquea por esto.
    console.error("No se pudo registrar la retención del vendedor:", error);
  }
}

