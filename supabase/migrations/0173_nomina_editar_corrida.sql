-- ============================================================================
-- VICTOR CFO — 0173: corregir una corrida de nómina ya guardada.
-- Una corrida es solo el CÁLCULO (VICTOR no paga ni deposita), así que se puede
-- corregir: se recalcula con las entradas nuevas y reemplaza a la anterior.
-- Aquí solo se anota quién la corrigió y cuándo. Requiere 0172.
-- ============================================================================
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS editada_por text,
  ADD COLUMN IF NOT EXISTS editada_en timestamptz;
