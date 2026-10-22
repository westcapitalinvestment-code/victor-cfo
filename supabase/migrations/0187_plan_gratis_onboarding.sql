-- VICTOR CFO — 0187: plan gratis — cuestionario "Tu plan" + aportes (Págate Primero)
--
-- 1) users.onboarding_gratis: respuestas del cuestionario de 4 preguntas y el
--    camino elegido (deudas | ordenar | probar). jsonb libre; solo se escribe
--    desde /api/onboarding-gratis (service role).
-- 2) aportes_gratis: movimientos de "Págate primero" del plan gratis — aportar
--    a ahorro, aportar a inversión o pagar una deuda. No son gastos: mueven
--    plata entre cuentas del propio usuario (efectivo -> ahorro/inversión, o
--    efectivo -> baja el saldo de una deuda). La regla 50/30/20 los cuenta en
--    "Ahorro y deudas". Se pueden deshacer (DELETE revierte los saldos).

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_gratis jsonb;

CREATE TABLE IF NOT EXISTS aportes_gratis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ahorro', 'inversion', 'deuda')),
  monto numeric NOT NULL CHECK (monto > 0),
  fecha date NOT NULL DEFAULT current_date,
  deuda_id uuid REFERENCES deudas_plan(id) ON DELETE SET NULL,
  deuda_nombre text,
  cuenta_destino_id uuid REFERENCES manual_accounts(id) ON DELETE SET NULL,
  cuenta_origen_id uuid REFERENCES manual_accounts(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aportes_gratis_owner_fecha_idx ON aportes_gratis (owner_id, fecha DESC);

ALTER TABLE aportes_gratis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aportes_gratis_owner ON aportes_gratis;
CREATE POLICY aportes_gratis_owner ON aportes_gratis FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT ALL ON aportes_gratis TO authenticated;
