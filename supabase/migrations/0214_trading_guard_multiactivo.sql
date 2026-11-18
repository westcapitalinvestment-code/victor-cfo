-- VICTOR CFO — 0214: VictorGuard multi-activo.
-- guard_symbol ahora acepta "*" (todos los activos) o una lista separada por comas.
-- El stop se puede calcular en pips (un símbolo), % del precio o ATR (cualquier activo).
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_sl_mode text NOT NULL DEFAULT 'pips' CHECK (guard_sl_mode IN ('pips','porcentaje','atr'));
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_sl_pct numeric NOT NULL DEFAULT 0.5 CHECK (guard_sl_pct > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_atr_mult numeric NOT NULL DEFAULT 1.5 CHECK (guard_atr_mult > 0);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS guard_atr_tf text NOT NULL DEFAULT 'H1' CHECK (guard_atr_tf IN ('M5','M15','M30','H1','H4','D1'));
NOTIFY pgrst, 'reload schema';
