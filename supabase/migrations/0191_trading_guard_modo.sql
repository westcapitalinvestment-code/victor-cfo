-- VICTOR CFO — 0191: modo de bloqueo del stop/take profit del guardián
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_lock_mode text NOT NULL DEFAULT 'flexible' CHECK (guard_lock_mode IN ('total','flexible','ninguno'));
