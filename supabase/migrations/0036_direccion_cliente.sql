-- Dirección del cliente — para armar su expediente (pedido por Joel).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
