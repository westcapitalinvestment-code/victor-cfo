-- ============================================================================
-- VICTOR CFO — 0010: distinguir cuentas de negocio dentro de un mismo login
-- ============================================================================
-- Plaid devuelve TODAS las cuentas que existan bajo las credenciales que el
-- usuario conectó — si su banco tiene checking personal Y checking de
-- negocio bajo el mismo login (muy común), las dos llegan juntas. Sin esto,
-- un usuario Core podía "colarse" y ver/usar datos de negocio gratis con
-- solo conectar su banco.
--
-- es_negocio se calcula con una heurística (nombre/subtipo de la cuenta,
-- ver lib/plaid.ts) al momento de guardar la cuenta — no es perfecto, pero
-- cubre el caso común (cuentas que dicen "Business", "Comercial", etc.).
-- El código de lectura (dashboard, cuentas, sync de transacciones) filtra
-- por esta columna cuando el plan del usuario es Core.
-- ============================================================================

ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS es_negocio boolean NOT NULL DEFAULT false;

-- Para poder saber de qué cuenta viene cada transacción sincronizada y así
-- aplicar el mismo filtro a nivel de transacción, no solo de balance.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_account_id text;
