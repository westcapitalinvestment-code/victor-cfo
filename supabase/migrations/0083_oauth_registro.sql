-- ============================================================================
-- VICTOR CFO — 0083: aplicar referido/socio/plan-gratis en registro por OAuth
-- (10 sept 2026, pedido de Joel: login/registro con Google y Apple).
-- ============================================================================
-- Con email/password, /registro manda ref_id/socio_codigo/signup_gratis
-- dentro de supabase.auth.signUp({ options: { data: {...} } }) y el trigger
-- handle_new_user() (migraciones 0002/0031/0070) los lee de
-- raw_user_meta_data ANTES de que exista la fila en public.users.
--
-- signInWithOAuth() no tiene un `options.data` equivalente — los metadatos
-- del usuario los define el proveedor (Google/Apple), no nosotros — así que
-- para el flujo OAuth esa información viaja como query params en el
-- redirectTo (ver /registro/page.tsx) y se aplica DESPUÉS de que la cuenta
-- ya existe (con los defaults del trigger: referred_by/socio en null), desde
-- app/auth/callback/route.ts.
--
-- Esta función es la versión "post-hoc" de esa misma lógica — con las
-- mismas validaciones defensivas del trigger (nunca confía a ciegas en lo
-- que vino del navegador), más una ventana de tiempo: solo aplica si la
-- cuenta se acaba de crear (< 15 minutos) y todavía no tiene referred_by ni
-- referido_por_socio_id — así nadie puede, meses después, volver a llamarla
-- para reclamar un referido/mes gratis retroactivo.
CREATE OR REPLACE FUNCTION aplicar_datos_registro_oauth(
  p_ref_id uuid DEFAULT NULL,
  p_socio_codigo text DEFAULT NULL,
  p_gratis boolean DEFAULT false
)
RETURNS void AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aplicable boolean;
  v_ref_valido uuid;
  v_socio_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT (referred_by IS NULL AND referido_por_socio_id IS NULL AND created_at > now() - interval '15 minutes')
  INTO v_aplicable
  FROM public.users
  WHERE id = v_uid;

  IF v_aplicable IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_ref_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_ref_id) THEN
    v_ref_valido := p_ref_id;
  END IF;

  IF p_socio_codigo IS NOT NULL THEN
    SELECT id INTO v_socio_id FROM public.socios WHERE codigo = p_socio_codigo AND estado = 'aprobado';
  END IF;

  IF p_gratis THEN
    UPDATE public.users
    SET plan = 'gratis', plan_status = 'active', referred_by = v_ref_valido, referido_por_socio_id = v_socio_id
    WHERE id = v_uid;
  ELSE
    UPDATE public.users
    SET referred_by = v_ref_valido, referido_por_socio_id = v_socio_id
    WHERE id = v_uid;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION aplicar_datos_registro_oauth(uuid, text, boolean) TO authenticated;
