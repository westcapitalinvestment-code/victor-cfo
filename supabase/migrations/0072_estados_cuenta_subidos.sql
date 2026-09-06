-- ============================================================================
-- VICTOR CFO — 0072: registro de cada subida de estado de cuenta (CSV/PDF)
-- ============================================================================
-- Caso real de Joel (6 sept 2026): subió un estado de cuenta a la cuenta
-- equivocada y no había forma de deshacerlo — lo único que existía era
-- transactions.origen ('csv'|'pdf'), que dice DE DÓNDE vino una fila, pero
-- no identifica UNA subida específica. Si subes dos estados distintos a la
-- misma cuenta, ambas tandas comparten el mismo origen + cuenta_id, sin
-- ninguna forma exacta de aislar "solo esta subida" para borrarla.
--
-- Esta migración agrega esa identidad: cada vez que se importa un CSV o PDF
-- (app/api/cuentas/estado/csv/importar y .../pdf/importar) se crea UNA fila
-- en statement_uploads, y cada transacción resultante queda enlazada a ella
-- vía transactions.statement_upload_id. Borrar la fila de statement_uploads
-- borra en cascada TODAS sus transacciones — deshace la subida completa, de
-- forma exacta, sin tocar nada más de esa cuenta.
--
-- De paso, guarda el archivo original en R2 (r2_key) — hasta ahora el CSV/PDF
-- nunca se persistía, se procesaba en memoria y se descartaba. Guardarlo
-- permite: (a) auditar/re-revisar la subida más adelante, y (b) que VICTOR
-- pueda leer estados de tarjetas de crédito ya subidos para analizar balance
-- e intereses (pedido explícito de Joel el mismo día) — para eso, PDF además
-- guarda en metadata_extraida lo que Claude ya lee del propio documento al
-- extraer transacciones: tasa de interés (APR), balance nuevo, pago mínimo,
-- límite de crédito y período del estado, cuando el documento los muestra.
-- ============================================================================

CREATE TABLE IF NOT EXISTS statement_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origen_cuenta text NOT NULL CHECK (origen_cuenta IN ('plaid', 'manual')),
  -- Igual que transactions: plaid_account_id es texto suelto (sin FK real,
  -- viene de Plaid, no de una tabla nuestra); manual_account_id sí es FK
  -- real a manual_accounts. Exactamente uno de los dos debe venir lleno,
  -- según origen_cuenta.
  plaid_account_id text,
  manual_account_id uuid REFERENCES manual_accounts(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('csv', 'pdf')),
  nombre_archivo text,
  -- Bytes originales del CSV/PDF en Cloudflare R2 (mismo bucket que la
  -- Bóveda, ver lib/r2.ts) — null en subidas viejas de antes de esta
  -- migración, o si por lo que sea falla la subida a R2 (no debe tumbar la
  -- importación de transacciones, que es lo importante para el usuario).
  r2_key text,
  total_importadas int NOT NULL DEFAULT 0,
  total_duplicadas int NOT NULL DEFAULT 0,
  -- Solo se llena en origen='pdf', cuando el propio estado de cuenta trae
  -- estos datos (tarjetas de crédito casi siempre; cuentas de banco casi
  -- nunca). Forma esperada (todas las claves opcionales):
  -- {"apr": "24.99%", "balance_nuevo": 1234.56, "pago_minimo": 35.00,
  --  "limite_credito": 5000.00, "periodo": "08/09/2026 - 09/08/2026"}
  metadata_extraida jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (origen_cuenta = 'plaid' AND plaid_account_id IS NOT NULL AND manual_account_id IS NULL) OR
    (origen_cuenta = 'manual' AND manual_account_id IS NOT NULL AND plaid_account_id IS NULL)
  )
);

ALTER TABLE statement_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY statement_uploads_all ON statement_uploads
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON statement_uploads TO authenticated;

CREATE INDEX IF NOT EXISTS statement_uploads_owner_idx ON statement_uploads (owner_id);
CREATE INDEX IF NOT EXISTS statement_uploads_plaid_idx ON statement_uploads (plaid_account_id) WHERE plaid_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statement_uploads_manual_idx ON statement_uploads (manual_account_id) WHERE manual_account_id IS NOT NULL;

-- ON DELETE CASCADE a propósito: borrar una subida debe borrar TODAS sus
-- transacciones — es exactamente el "deshacer" que Joel pidió. Nullable
-- porque las filas ya existentes (y las que siguen llegando de Plaid solo,
-- origen='plaid') no vienen de ninguna subida.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_upload_id uuid REFERENCES statement_uploads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS transactions_statement_upload_idx ON transactions (statement_upload_id) WHERE statement_upload_id IS NOT NULL;

COMMENT ON TABLE statement_uploads IS
  'Un registro por cada CSV/PDF de estado de cuenta subido (app/api/cuentas/estado/*). Permite deshacer una subida completa (borra en cascada sus transacciones) y le da a VICTOR visibilidad de balances/intereses ya extraídos del documento.';
COMMENT ON COLUMN transactions.statement_upload_id IS
  'A qué subida de estado de cuenta pertenece esta fila (null si vino sola por Plaid, o es de antes de esta migración). Borrar la fila de statement_uploads borra esta transacción en cascada.';
