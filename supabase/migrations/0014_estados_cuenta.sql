-- ============================================================================
-- VICTOR CFO — 0014: subir estados de cuenta (CSV/QuickBooks/PDF) a
-- CUALQUIER cuenta, no solo a las manuales
-- ============================================================================
-- Motivación (caso real de Joel): Plaid solo entrega ~45 días de historial
-- en algunos bancos (ej. BPPR), aunque el banco tenga el año completo
-- disponible en su portal. Para armar un reporte contable completo (ene 1
-- en adelante, para las planillas) el usuario necesita poder rellenar ese
-- hueco subiendo el estado de cuenta directo — de un banco/tarjeta YA
-- conectado por Plaid, no solo de una cuenta manual como Apple Card.
--
-- La tabla transactions ya soporta esto sin cambios de columnas: sigue
-- usando plaid_account_id (texto, ya existe desde 0010) para asociar la
-- fila a la cuenta correcta. Solo falta el índice de dedup — el que ya
-- existe (0013) es específico de manual_account_id.
-- ============================================================================

-- Dedup (seguro de última instancia) para estados subidos a mano en una
-- cuenta de Plaid: mismo criterio que en cuentas manuales (cuenta + fecha +
-- descripción + monto). NOTA IMPORTANTE sobre cómo se usa este índice: el
-- código de importación (app/api/cuentas/estado/*) NO depende de este
-- índice vía "ON CONFLICT" — Postgres no permite usar un índice único
-- PARCIAL como árbitro de ON CONFLICT a menos que el predicado se
-- especifique explícitamente en el propio INSERT, y el cliente de Supabase
-- no deja pasar eso. En su lugar, el código revisa manualmente qué ya
-- existe antes de insertar. Este índice queda como red de seguridad real a
-- nivel de base de datos (si por lo que sea la revisión manual fallara, el
-- INSERT truena en vez de crear un duplicado silencioso).
--
-- Se limita a origen <> 'plaid' a propósito — las transacciones que SÍ
-- llegan solas por transactionsSync (lib/plaid-sync.ts) ya tienen su propio
-- dedup real por plaid_transaction_id (constraint distinta), y no queremos
-- que este índice nuevo les afecte si dos transacciones legítimas de Plaid
-- llegan con el mismo monto/fecha/descripción (pasa — ej. dos cafés de
-- $4.50 el mismo día en el mismo Starbucks).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_backfill_dedup_key
  ON transactions (plaid_account_id, fecha, description_raw, amount)
  WHERE plaid_account_id IS NOT NULL AND origen <> 'plaid';

COMMENT ON COLUMN transactions.origen IS
  'plaid = llegó sola por transactionsSync. manual = cuenta manual sin transacciones reales todavía. csv = importado de un CSV/QuickBooks (puede ser de una cuenta Plaid o manual). pdf = extraído de un PDF de estado de cuenta con Claude (puede ser de una cuenta Plaid o manual).';
