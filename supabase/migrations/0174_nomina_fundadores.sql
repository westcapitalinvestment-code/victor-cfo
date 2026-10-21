-- Nómina en Business: incluida solo para los primeros 100 clientes Business
-- ("fundadores"); después es el addon de $24.99/mes también para Business.
-- Los contables siempre pueden operar la nómina de sus clientes (sin addon).
ALTER TABLE users ADD COLUMN IF NOT EXISTS nomina_fundador boolean NOT NULL DEFAULT false;

-- Marca a los primeros 100 Business existentes (por fecha de alta).
UPDATE users SET nomina_fundador = true
WHERE id IN (
  SELECT id FROM users
  WHERE plan = 'proplus' AND nomina_fundador = false
  ORDER BY created_at ASC
  LIMIT GREATEST(0, 100 - (SELECT count(*) FROM users WHERE nomina_fundador))
);

-- Marca automáticamente a quien pase a Business mientras queden cupos.
CREATE OR REPLACE FUNCTION marcar_nomina_fundador() RETURNS trigger AS $$
BEGIN
  IF NEW.plan = 'proplus' AND NOT NEW.nomina_fundador
     AND (TG_OP = 'INSERT' OR OLD.plan IS DISTINCT FROM 'proplus')
     AND (SELECT count(*) FROM users WHERE nomina_fundador) < 100 THEN
    NEW.nomina_fundador := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_nomina_fundador ON users;
CREATE TRIGGER trg_marcar_nomina_fundador
  BEFORE INSERT OR UPDATE OF plan ON users
  FOR EACH ROW EXECUTE FUNCTION marcar_nomina_fundador();
