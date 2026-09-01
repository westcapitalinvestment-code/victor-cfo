-- ============================================================================
-- VICTOR CFO — 0024: nickname para cuentas de Plaid
-- ============================================================================
-- Motivación (caso real de Joel, 23 agosto 2026): dos cuentas del mismo
-- banco (ej. dos "checking") llegan de Plaid con el mismo nombre genérico
-- o uno muy parecido — no hay forma de saber cuál es cuál sin adivinar por
-- el balance. plaid_accounts.name viene tal cual lo manda el banco vía
-- Plaid y no se debe sobreescribir (se necesita tal cual para comparar
-- contra futuras sincronizaciones) — nickname es un campo aparte, opcional,
-- que el usuario pone a mano y que la app prefiere mostrar cuando existe.
-- ============================================================================

ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS nickname text;
