-- VICTOR CFO — 0215: riesgo en dinero de cada trade al abrir, enviado por VictorGuard.
-- Permite marcar "riesgo alto" en cualquier activo (acciones, cripto, futuros), no solo en los símbolos conocidos.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS riesgo_usd numeric CHECK (riesgo_usd IS NULL OR riesgo_usd >= 0);
NOTIFY pgrst, 'reload schema';
