import { fechaHoyPR } from "@/lib/hora-pr";

// Calcula la CLAVE de ciclo de facturación que usan tanto el tope de gasto
// de IA (app/api/victor/route.ts) como los créditos comprables (migración
// 0064, app/api/stripe/checkout-creditos-ia/route.ts) — extraído a un solo
// lugar el 3 sept 2026 para que los dos SIEMPRE calculen la misma clave; si
// divergieran, un crédito comprado podría terminar aplicado a un ciclo
// distinto al que el chequeo de presupuesto está mirando.
//
// Se ancla al ciclo de facturación REAL de Stripe (ciclo_inicio/ciclo_fin,
// guardados por el webhook en cada activación o renovación), no al mes
// calendario — ver migración 0026 para el porqué completo. Cuentas sin
// ciclo de Stripe todavía (ej. antes de conectar el checkout) caen al mes
// calendario como respaldo.
export function claveCicloUso(perfil: { ciclo_inicio?: string | null; ciclo_fin?: string | null } | null | undefined): string {
  if (perfil?.ciclo_inicio) {
    return perfil.ciclo_inicio; // ej. '2026-08-23' — único por ciclo real
  }
  return fechaHoyPR().slice(0, 7); // 'YYYY-MM' — respaldo para cuentas sin Stripe
}

// Devuelve en qué día del ciclo actual estamos y cuántos días dura el
// ciclo — usado por el ritmo-parejo del tope de gasto (no aplica a los
// créditos comprados, que están disponibles completos de inmediato).
export function progresoCicloUso(perfil: { ciclo_inicio?: string | null; ciclo_fin?: string | null } | null | undefined): {
  diaDelPeriodo: number;
  diasEnElPeriodo: number;
} {
  const hoyPR = fechaHoyPR();
  const [anioActualStr, mesActualStr, diaActualStr] = hoyPR.split("-");
  const diasEnElMesCalendario = new Date(Number(anioActualStr), Number(mesActualStr), 0).getDate();

  if (perfil?.ciclo_inicio && perfil?.ciclo_fin) {
    const inicio = new Date(`${perfil.ciclo_inicio}T00:00:00Z`);
    const fin = new Date(`${perfil.ciclo_fin}T00:00:00Z`);
    const hoy = new Date(`${hoyPR}T00:00:00Z`);
    const MS_POR_DIA = 24 * 60 * 60 * 1000;
    const diasEnElPeriodo = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / MS_POR_DIA));
    const diaDelPeriodo = Math.min(
      diasEnElPeriodo,
      Math.max(1, Math.round((hoy.getTime() - inicio.getTime()) / MS_POR_DIA) + 1)
    );
    return { diaDelPeriodo, diasEnElPeriodo };
  }

  return { diaDelPeriodo: Number(diaActualStr), diasEnElPeriodo: diasEnElMesCalendario };
}
