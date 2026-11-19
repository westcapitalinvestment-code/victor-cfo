-- VICTOR CFO — 0217: activo al que aplican los pips del guardián (los demás usan sus pips de forex o el ATR).
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_pip_symbol text NOT NULL DEFAULT 'XAUUSD';
NOTIFY pgrst, 'reload schema';
