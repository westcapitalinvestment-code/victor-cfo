-- VICTOR CFO — 0186: deudas para la calculadora "bola de nieve" (plan gratis)
-- Lista simple que el usuario escribe a mano: nombre, saldo, tasa anual (APR)
-- y pago mínimo. Es personal (sin entidad); solo el dueño la ve y edita.

CREATE TABLE IF NOT EXISTS deudas_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  saldo numeric NOT NULL CHECK (saldo >= 0),
  apr numeric NOT NULL DEFAULT 0 CHECK (apr >= 0 AND apr <= 100),
  pago_minimo numeric NOT NULL DEFAULT 0 CHECK (pago_minimo >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deudas_plan_owner_idx ON deudas_plan (owner_id);

ALTER TABLE deudas_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deudas_plan_owner ON deudas_plan;
CREATE POLICY deudas_plan_owner ON deudas_plan FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT ALL ON deudas_plan TO authenticated;
