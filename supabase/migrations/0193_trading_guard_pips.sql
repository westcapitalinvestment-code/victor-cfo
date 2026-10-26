-- VICTOR CFO — 0193: columnas del guardián en pips (por si 0190 se corrió antes de agregarlas).
-- Es idempotente: se puede correr aunque ya existan.
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_symbol text NOT NULL DEFAULT 'XAUUSD';
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_reward_ratio numeric NOT NULL DEFAULT 2 CHECK (guard_reward_ratio >= 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_max_open int NOT NULL DEFAULT 1 CHECK (guard_max_open >= 1);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_daily_loss_usd numeric CHECK (guard_daily_loss_usd > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_min_equity_usd numeric CHECK (guard_min_equity_usd >= 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_block_manual_close boolean NOT NULL DEFAULT true;
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_sl_pips numeric NOT NULL DEFAULT 60 CHECK (guard_sl_pips > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_pip_size numeric NOT NULL DEFAULT 0.1 CHECK (guard_pip_size > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_lock_mode text NOT NULL DEFAULT 'flexible' CHECK (guard_lock_mode IN ('total','flexible','ninguno'));
-- El take profit puede ser 0 (sin TP al abrir): se afloja la regla original (> 0).
ALTER TABLE risk_rules DROP CONSTRAINT IF EXISTS risk_rules_guard_reward_ratio_check;
ALTER TABLE risk_rules ADD CONSTRAINT risk_rules_guard_reward_ratio_check CHECK (guard_reward_ratio >= 0);
NOTIFY pgrst, 'reload schema';
