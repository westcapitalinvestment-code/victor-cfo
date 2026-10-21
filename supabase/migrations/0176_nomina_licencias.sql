-- Vacaciones y licencia por enfermedad configurables (21 oct 2026, pedido de Joel).
-- Reglas por entidad en payroll_entity_config (NULL = sugerencia del código, "por
-- confirmar"); movimientos en payroll_leave: 'tomado' (días que el empleado usó) y
-- 'ajuste' (saldo inicial o corrección, suma al saldo). El saldo se calcula:
--   acumulado (meses desde fecha_ingreso, después de la espera, × días/mes, con tope)
--   + ajustes − tomados.
ALTER TABLE payroll_entity_config
  ADD COLUMN IF NOT EXISTS vac_dias_mes numeric CHECK (vac_dias_mes IS NULL OR (vac_dias_mes >= 0 AND vac_dias_mes <= 10)),
  ADD COLUMN IF NOT EXISTS vac_meses_espera int CHECK (vac_meses_espera IS NULL OR (vac_meses_espera >= 0 AND vac_meses_espera <= 60)),
  ADD COLUMN IF NOT EXISTS vac_tope numeric CHECK (vac_tope IS NULL OR vac_tope >= 0),
  ADD COLUMN IF NOT EXISTS enf_dias_mes numeric CHECK (enf_dias_mes IS NULL OR (enf_dias_mes >= 0 AND enf_dias_mes <= 10)),
  ADD COLUMN IF NOT EXISTS enf_meses_espera int CHECK (enf_meses_espera IS NULL OR (enf_meses_espera >= 0 AND enf_meses_espera <= 60)),
  ADD COLUMN IF NOT EXISTS enf_tope numeric CHECK (enf_tope IS NULL OR enf_tope >= 0),
  ADD COLUMN IF NOT EXISTS horas_por_dia numeric CHECK (horas_por_dia IS NULL OR (horas_por_dia > 0 AND horas_por_dia <= 24));

CREATE TABLE IF NOT EXISTS payroll_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('vacaciones', 'enfermedad')),
  movimiento text NOT NULL DEFAULT 'tomado' CHECK (movimiento IN ('tomado', 'ajuste')),
  fecha date NOT NULL,
  dias numeric NOT NULL CHECK (dias > 0 AND dias <= 365),
  nota text,
  creado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_leave_emp_idx ON payroll_leave (employee_id, fecha);
CREATE INDEX IF NOT EXISTS payroll_leave_entity_idx ON payroll_leave (entity_id, fecha DESC);

ALTER TABLE payroll_leave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_leave_owner ON payroll_leave;
CREATE POLICY payroll_leave_owner ON payroll_leave FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_leave TO authenticated;
GRANT ALL ON payroll_leave TO service_role;
