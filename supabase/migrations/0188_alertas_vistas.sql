-- VICTOR CFO — 0188: alertas inteligentes "vistas" (plan gratis)
-- Lista de textos de alerta que la persona ya marcó como vista. Una alerta
-- cuyo texto cambia (otro monto, otro mes) cuenta como nueva. Se escribe solo
-- desde /api/alertas-vistas (service role).
ALTER TABLE users ADD COLUMN IF NOT EXISTS alertas_vistas jsonb DEFAULT '[]'::jsonb;
