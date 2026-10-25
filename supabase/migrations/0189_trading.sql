-- VICTOR CFO — 0189: módulo Trading (v1: bitácora + manejo de riesgo)
-- Organizador del "negocio de trading". NO da señales ni consejos.
-- Todo es personal: solo el dueño ve y edita sus filas (RLS por owner_id).

CREATE TABLE IF NOT EXISTS trading_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  plataforma text NOT NULL DEFAULT 'MT5',
  broker text,
  numero_cuenta text,
  tipo text NOT NULL DEFAULT 'demo' CHECK (tipo IN ('demo','real')),
  balance_inicial numeric NOT NULL DEFAULT 0 CHECK (balance_inicial >= 0),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_accounts_owner_idx ON trading_accounts (owner_id);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  ticket text NOT NULL,
  simbolo text NOT NULL,
  lado text NOT NULL CHECK (lado IN ('buy','sell')),
  volumen numeric NOT NULL,
  hora_apertura timestamp NOT NULL,   -- hora del servidor del broker (sin zona)
  precio_apertura numeric,
  sl numeric,
  tp numeric,
  hora_cierre timestamp,
  precio_cierre numeric,
  comision numeric NOT NULL DEFAULT 0,
  swap numeric NOT NULL DEFAULT 0,
  ganancia numeric NOT NULL DEFAULT 0,
  nota text,
  cumpli_plan boolean,
  created_at timestamptz DEFAULT now(),
  UNIQUE (account_id, ticket)
);
CREATE INDEX IF NOT EXISTS trades_owner_apertura_idx ON trades (owner_id, hora_apertura DESC);

CREATE TABLE IF NOT EXISTS risk_rules (
  owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  riesgo_por_trade_pct numeric NOT NULL DEFAULT 3 CHECK (riesgo_por_trade_pct > 0 AND riesgo_por_trade_pct <= 100),
  max_perdedores_dia int NOT NULL DEFAULT 3 CHECK (max_perdedores_dia >= 1),
  perdida_max_dia_pct numeric NOT NULL DEFAULT 9 CHECK (perdida_max_dia_pct > 0 AND perdida_max_dia_pct <= 100),
  max_trades_dia int NOT NULL DEFAULT 6 CHECK (max_trades_dia >= 1),
  espera_tras_perdida_min int NOT NULL DEFAULT 30 CHECK (espera_tras_perdida_min >= 0),
  duracion_min_seg int NOT NULL DEFAULT 300 CHECK (duracion_min_seg >= 0),
  sl_obligatorio boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trading_accounts_owner ON trading_accounts;
CREATE POLICY trading_accounts_owner ON trading_accounts FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS trades_owner ON trades;
CREATE POLICY trades_owner ON trades FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS risk_rules_owner ON risk_rules;
CREATE POLICY risk_rules_owner ON risk_rules FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

GRANT ALL ON trading_accounts, trades, risk_rules TO authenticated;
GRANT ALL ON trading_accounts, trades, risk_rules TO service_role;
