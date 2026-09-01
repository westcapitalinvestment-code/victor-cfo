-- ============================================================================
-- VICTOR CFO — 0031: plan "gratis" + referidos
-- ============================================================================
-- Decisión de Joel (30 agosto 2026): en vez de un "modo view" compartido
-- entre familiares, cada quien tiene su PROPIA cuenta independiente. Todos
-- los que se registran (por link de referido o por un QR público) caen en
-- un plan GRATIS con acceso completo a Bóveda, Metas, Citas, y categorizar
-- transacciones subidas por CSV — todo eso cuesta centavos de correr
-- (Vercel/Supabase, ya pagados como costo fijo). Lo único que se bloquea
-- es lo caro: conectar el banco por Plaid ($2/usuario/mes) y hablar con
-- VICTOR ($7.50/mes de tope de IA). Al intentar cualquiera de esas dos
-- cosas, se le ofrece upgrade a Core: $12.99/mes si vino de un link de
-- referido (recompensa a quien ya paga por traer gente), $14.99/mes (el
-- precio normal) si vino de un QR/link público sin referidor.
--
-- referred_by es NULLABLE y apunta a otro usuario — si esa persona se
-- borra, el registro de "quién refirió a quién" se pierde (SET NULL) en
-- vez de borrar en cascada la cuenta del referido, que sigue siendo una
-- cuenta real e independiente.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_referred_by_idx ON public.users (referred_by);

-- handle_new_user() (migración 0002) creaba SIEMPRE la fila con los
-- defaults de la columna (plan='core', plan_status='incomplete' desde la
-- 0025) — no había forma de que un registro naciera distinto. Ahora lee
-- dos campos opcionales del raw_user_meta_data que manda el cliente en
-- supabase.auth.signUp({ options: { data: {...} } }):
--   - signup_gratis: 'true' → nace en plan='gratis', plan_status='active'
--     (nunca pasa por Stripe; no hace falta "completar pago" para esto).
--   - ref_id: uuid del usuario que lo refirió (viene del query param ?ref=
--     de /registro). Se verifica que ese uuid sea de verdad un usuario
--     existente antes de guardarlo — nunca se confía a ciegas en un dato
--     que vino del navegador de un desconocido.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_ref_id uuid;
  v_es_gratis boolean;
BEGIN
  v_es_gratis := (NEW.raw_user_meta_data->>'signup_gratis') = 'true';

  BEGIN
    v_ref_id := (NEW.raw_user_meta_data->>'ref_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_ref_id := NULL;
  END;
  IF v_ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_ref_id) THEN
    v_ref_id := NULL;
  END IF;

  IF v_es_gratis THEN
    INSERT INTO public.users (id, email, full_name, plan, plan_status, referred_by)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'gratis', 'active', v_ref_id);
  ELSE
    INSERT INTO public.users (id, email, full_name, referred_by)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', v_ref_id);
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
