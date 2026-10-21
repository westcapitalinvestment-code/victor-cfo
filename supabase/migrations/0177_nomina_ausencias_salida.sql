-- Ausencias sin paga + salida del empleado (21 oct 2026).
-- 'ausencia' = día no trabajado sin pago (informativo / para calendario); no afecta saldos.
ALTER TABLE payroll_leave DROP CONSTRAINT IF EXISTS payroll_leave_tipo_check;
ALTER TABLE payroll_leave ADD CONSTRAINT payroll_leave_tipo_check CHECK (tipo IN ('vacaciones', 'enfermedad', 'ausencia'));

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS fecha_salida date,
  ADD COLUMN IF NOT EXISTS motivo_salida text;
