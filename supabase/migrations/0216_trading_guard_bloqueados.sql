-- VICTOR CFO — 0216: activos prohibidos del guardián (lista separada por comas; si se abren, se cierran).
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_blocked_symbols text NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';
