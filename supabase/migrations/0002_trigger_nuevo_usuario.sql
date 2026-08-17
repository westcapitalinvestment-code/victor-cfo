-- ============================================================================
-- VICTOR CFO — 0002: trigger para crear fila en public.users automáticamente
-- cuando alguien se registra con Supabase Auth.
--
-- Sin esto, cuando un usuario se registra (auth.users), la tabla users
-- (la que usa VICTOR para el plan, nombre, etc.) se queda vacía para esa
-- persona, y todo lo demás (business_entities, invoices...) depende de que
-- exista esa fila.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
