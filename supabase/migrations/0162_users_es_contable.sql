-- 18 oct 2026: marcar como "contable" a quien se registra por /registro/cpa
-- (cuenta_tipo='contable' en el metadata de auth) para que el Dashboard CFO no
-- lo cuente como cliente. Antes solo se detectaba a los invitados por
-- account_members.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS es_contable boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.marcar_contable_al_crear_usuario()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.id = NEW.id AND a.raw_user_meta_data->>'cuenta_tipo' = 'contable'
  ) THEN
    NEW.es_contable := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_marcar_contable ON public.users;
CREATE TRIGGER trg_marcar_contable
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.marcar_contable_al_crear_usuario();

-- Cuentas que ya existen
UPDATE public.users u
SET es_contable = true
WHERE EXISTS (
  SELECT 1 FROM auth.users a
  WHERE a.id = u.id AND a.raw_user_meta_data->>'cuenta_tipo' = 'contable'
);
