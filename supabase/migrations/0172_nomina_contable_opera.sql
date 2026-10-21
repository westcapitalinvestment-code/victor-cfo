-- ============================================================================
-- VICTOR CFO — 0172: el contable (CPA) puede correr la nómina del cliente.
-- Pedido de Joel (oct. 2026). El DUEÑO decide con 2 interruptores por entidad:
--   cpa_puede_nomina    → el contable puede crear empleados y generar corridas.
--   cpa_aprueba_directo → la corrida del contable queda aprobada de una vez
--                         (sin autorización del dueño). Apagado = la corrida
--                         queda 'pendiente' hasta que el dueño la apruebe.
-- Las corridas pendientes NO cuentan en los acumulados del año hasta aprobarse.
-- Las escrituras del contable pasan por las rutas /api/nomina/* (que verifican
-- membresía de contable activa + interruptor); las políticas RLS no cambian.
-- Requiere 0167 y 0169.
-- ============================================================================
ALTER TABLE payroll_entity_config
  ADD COLUMN IF NOT EXISTS cpa_puede_nomina boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cpa_aprueba_directo boolean NOT NULL DEFAULT false;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS creada_por text,
  ADD COLUMN IF NOT EXISTS creada_por_rol text NOT NULL DEFAULT 'dueno',
  ADD COLUMN IF NOT EXISTS aprobada_por text,
  ADD COLUMN IF NOT EXISTS aprobada_en timestamptz;

-- Nuevo estado 'pendiente' (esperando la aprobación del dueño).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'payroll_runs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE payroll_runs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_estado_check CHECK (estado IN ('borrador', 'pendiente', 'aprobada'));

-- Bitácora: quién hizo qué en la nómina (dueño o contable).
CREATE TABLE IF NOT EXISTS payroll_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  actor_email text,
  actor_rol text NOT NULL CHECK (actor_rol IN ('dueno', 'contable')),
  accion text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_audit_log_entity_idx ON payroll_audit_log (entity_id, created_at DESC);

ALTER TABLE payroll_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_audit_log_owner ON payroll_audit_log;
CREATE POLICY payroll_audit_log_owner ON payroll_audit_log FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS payroll_audit_log_cpa_read ON payroll_audit_log;
CREATE POLICY payroll_audit_log_cpa_read ON payroll_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = payroll_audit_log.owner_id AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'));
GRANT SELECT ON payroll_audit_log TO authenticated;
GRANT ALL ON payroll_audit_log TO service_role;
