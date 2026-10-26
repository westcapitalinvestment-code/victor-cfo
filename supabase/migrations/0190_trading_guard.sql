-- VICTOR CFO — 0190: parámetros del guardián de MT5 (editables por el usuario)
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_symbol text NOT NULL DEFAULT 'XAUUSD';
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_sl_distance numeric NOT NULL DEFAULT 6 CHECK (guard_sl_distance > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_reward_ratio numeric NOT NULL DEFAULT 2 CHECK (guard_reward_ratio > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_max_open int NOT NULL DEFAULT 1 CHECK (guard_max_open >= 1);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_daily_loss_usd numeric CHECK (guard_daily_loss_usd > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_min_equity_usd numeric CHECK (guard_min_equity_usd >= 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_lock_sltp boolean NOT NULL DEFAULT true;
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_block_manual_close boolean NOT NULL DEFAULT true;
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_sl_pips numeric NOT NULL DEFAULT 60 CHECK (guard_sl_pips > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_pip_size numeric NOT NULL DEFAULT 0.1 CHECK (guard_pip_size > 0);
