-- ============================================================================
-- 0012 — Arregla el índice único de transactions.plaid_transaction_id para
-- que el upsert de /api/plaid/sync-transactions funcione.
--
-- 0009 creó un índice ÚNICO PARCIAL (con WHERE plaid_transaction_id IS NOT
-- NULL). Postgres no lo acepta como "arbiter" de un ON CONFLICT a menos que
-- el ON CONFLICT también incluya ese mismo WHERE — y el .upsert() de
-- Supabase no lo manda, así que el guardado fallaba con:
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Esto hacía que /transactions/sync trajera datos de Plaid
-- pero nunca se guardaran en la tabla transactions (0 nuevas siempre).
--
-- No hacía falta que el índice fuera parcial: un índice/constraint único
-- normal en Postgres ya permite múltiples filas con NULL sin chocar entre
-- sí (NULL nunca es igual a NULL), así que el comportamiento no cambia —
-- pero ahora sí sirve como arbiter del ON CONFLICT.
-- ============================================================================

DROP INDEX IF EXISTS transactions_plaid_transaction_id_key;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_plaid_transaction_id_key UNIQUE (plaid_transaction_id);
