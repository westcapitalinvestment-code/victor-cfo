-- ============================================================================
-- VICTOR CFO — 0031: plan "gratis" + referidos
-- ============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_referred_by_idx ON public.users (referred_by);

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
