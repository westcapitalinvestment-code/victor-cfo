-- ============================================================================
-- 0078 — Sincronizar auth.users.email -> public.users.email cuando cambia.
-- ============================================================================
-- 8 sept 2026 — hasta hoy solo existía el trigger on_auth_user_created
-- (migración 0002), que copia el email UNA vez al registrarse. Nada
-- mantenía public.users.email al día si el usuario cambiaba su email
-- desde Supabase Auth — quedaría "congelado" con el valor viejo para
-- siempre. Necesario para el nuevo botón "Editar" en Configuración
-- (app/dashboard/editar-cuenta.tsx), que deja cambiar el email vía
-- supabase.auth.updateUser({ email }). Ese cambio de auth.users.email NO
-- ocurre al instante (Supabase pide confirmar desde el correo viejo y el
-- nuevo primero) — este trigger corre justo cuando Supabase aplica el
-- cambio ya confirmado, así que public.users.email se actualiza en el
-- momento correcto, nunca antes de que el cambio sea real.
CREATE OR REPLACE FUNCTION handle_updated_user_email()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_updated_user_email();
