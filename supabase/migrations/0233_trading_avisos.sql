-- VICTOR CFO — 0233: avisos al celular del guardián (25 nov 2026, pedido de Joel).
-- Cada aviso (trade abierto, trade cerrado, bloqueo del día) se marca aquí una sola
-- vez para no repetirlo en cada sincronización (cada ~30 s).
CREATE TABLE IF NOT EXISTS trading_avisos (
  account_id uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  clave text NOT NULL CHECK (char_length(clave) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, clave)
);
ALTER TABLE trading_avisos ENABLE ROW LEVEL SECURITY;
-- Solo el servidor (service role) escribe y lee; no hay políticas para usuarios.
GRANT ALL ON trading_avisos TO service_role;
NOTIFY pgrst, 'reload schema';
