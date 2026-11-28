-- Guardián 4.0 (28 nov 2026): las reglas también se cambian desde el panel "Reglas"
-- en MT5. Se guardan con origen 'mt5' (apretar = ya; aflojar = desde mañana) y
-- "trades máximos al día" acepta 0 = sin límite (el código ya lo trataba así).
ALTER TABLE trading_reglas_cambios DROP CONSTRAINT IF EXISTS trading_reglas_cambios_origen_check;
ALTER TABLE trading_reglas_cambios ADD CONSTRAINT trading_reglas_cambios_origen_check CHECK (origen IN ('web','chat','plan','mt5'));
ALTER TABLE risk_rules DROP CONSTRAINT IF EXISTS risk_rules_max_trades_dia_check;
ALTER TABLE risk_rules ADD CONSTRAINT risk_rules_max_trades_dia_check CHECK (max_trades_dia >= 0);
NOTIFY pgrst, 'reload schema';
