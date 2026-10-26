-- VICTOR CFO — 0192: sincronización en vivo con MT5 (el guardián envía los trades cerrados y el balance)
-- El token identifica UNA cuenta de trading; solo permite enviar trades y balance a esa cuenta.
CREATE TABLE IF NOT EXISTS trading_sync_tokens (
  account_id uuid PRIMARY KEY REFERENCES trading_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (char_length(token) >= 32),
  created_at timestamptz DEFAULT now(),
  last_sync_at timestamptz
);
ALTER TABLE trading_sync_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trading_sync_tokens_owner ON trading_sync_tokens;
CREATE POLICY trading_sync_tokens_owner ON trading_sync_tokens FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT ALL ON trading_sync_tokens TO authenticated;
GRANT ALL ON trading_sync_tokens TO service_role;

ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS balance_actual numeric;
ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS equity_actual numeric;
ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
