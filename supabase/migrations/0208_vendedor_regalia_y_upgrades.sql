-- ============================================================================
-- VICTOR CFO — 0208: Regalía mensual + comisión por diferencia en upgrades
-- de vendedores — 9 nov 2026
-- ============================================================================
-- Decisiones de Joel (5–9 nov 2026):
--
-- 1. REGALÍA (nueva, aparte de la comisión): desde el mes 7 de cada cliente
--    Pro o Business del vendedor que siga activo, el vendedor cobra cada mes
--    el 4% del precio MENSUAL del plan (solo el plan, sin add-ons):
--    $2.00 por Pro y $4.00 por Business. Igual si el cliente paga mensual o
--    anual (se paga mensual). Core NO genera regalía ("eso es lo que me gano").
--    La genera el cron /api/cron/regalia-vendedores (lib/regalia-vendedor.ts):
--    una fila tipo_comision='regalia' por cliente por mes, con
--    ciclo_numero = AAAAMM — el UNIQUE (referred_id, tipo_comision,
--    ciclo_numero) de la 0106 evita pagarla dos veces el mismo mes.
--
-- 2. UPGRADES: si un cliente del vendedor sube de plan (Core→Pro,
--    Core→Business, Pro→Business), el vendedor cobra la DIFERENCIA entre la
--    comisión del plan nuevo y la del plan ya comisionado (al cliente
--    también se le cobra la diferencia):
--      · Mensual: 70% con el cobro del upgrade + 30% cuando el cliente
--        llega a su 3er pago contando desde el upgrade.
--      · Anual: 20% de la diferencia, de una vez.
--    Se calcula solo sobre el plan (sin add-ons). La lógica vive en el
--    webhook de Stripe (procesarUpgradeVendedor / avanzarUpgradesVendedor).
--
-- La comisión base de Core ($15, 70/30) NO cambia.
-- ============================================================================

-- Nuevos tipos de comisión.
ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_tipo_comision_check,
  ADD CONSTRAINT socios_comisiones_tipo_comision_check
    CHECK (tipo_comision IN (
      'entrada', 'recurrente', 'setenta', 'treinta', 'unica',
      'upgrade_setenta', 'upgrade_treinta', 'upgrade_unica',
      'regalia'
    ));

-- Plan sobre el que ya se le pagó comisión al vendedor por este cliente.
-- Sube con cada upgrade; nunca baja (si el cliente baja y vuelve a subir,
-- no se paga dos veces la misma diferencia).
ALTER TABLE socios_vendedor_clientes
  ADD COLUMN IF NOT EXISTS plan_comisionado text;

UPDATE socios_vendedor_clientes svc
   SET plan_comisionado = u.plan
  FROM users u
 WHERE u.id = svc.referred_id
   AND svc.plan_comisionado IS NULL;

-- Una fila por upgrade comisionado. UNIQUE (referred_id, a_plan): si Stripe
-- reintenta el mismo evento, no se paga dos veces.
CREATE TABLE IF NOT EXISTS socios_vendedor_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  de_plan text NOT NULL,
  a_plan text NOT NULL,
  ciclo text NOT NULL CHECK (ciclo IN ('mensual', 'anual')),
  diferencia_centavos integer NOT NULL,
  setenta_centavos integer NOT NULL,
  treinta_centavos integer NOT NULL DEFAULT 0,
  -- El cobro del upgrade cuenta como el 1ro; el 30% se libera al 3ro.
  pagos_desde_upgrade integer NOT NULL DEFAULT 1,
  treinta_estado text NOT NULL DEFAULT 'pendiente' CHECK (treinta_estado IN ('pendiente', 'liberada', 'perdida')),
  treinta_liberada_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (referred_id, a_plan)
);

CREATE INDEX IF NOT EXISTS socios_vendedor_upgrades_socio_idx ON socios_vendedor_upgrades (socio_id);
CREATE INDEX IF NOT EXISTS socios_vendedor_upgrades_pendientes_idx
  ON socios_vendedor_upgrades (referred_id)
  WHERE treinta_estado = 'pendiente';

-- Mismo patrón que socios_vendedor_clientes: RLS encendido sin políticas →
-- solo el service_role (webhook, crons, rutas del portal) lee/escribe.
ALTER TABLE socios_vendedor_upgrades ENABLE ROW LEVEL SECURITY;
