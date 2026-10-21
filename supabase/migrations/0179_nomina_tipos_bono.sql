-- Tipos de bono con nombre + regla de bono de productividad (21 oct 2026).
-- bono_tipos: lista que el patrono configura (NULL = lista sugerida del código).
-- prod_*: regla del bono de productividad; NULL = sin regla (el patrono escribe el monto).
ALTER TABLE payroll_entity_config
  ADD COLUMN IF NOT EXISTS bono_tipos text[],
  ADD COLUMN IF NOT EXISTS prod_pct numeric CHECK (prod_pct IS NULL OR (prod_pct >= 0 AND prod_pct <= 1)),
  ADD COLUMN IF NOT EXISTS prod_meta numeric CHECK (prod_meta IS NULL OR prod_meta >= 0),
  ADD COLUMN IF NOT EXISTS prod_tope numeric CHECK (prod_tope IS NULL OR prod_tope >= 0);
