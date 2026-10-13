-- ============================================================================
-- VICTOR CFO — 0150: Prospectos del vendedor (atribución por email/teléfono)
-- — 13 oct 2026
-- ============================================================================
-- Pedido de Joel: "lo que quiero es que el vendedor no me reclame porque
-- presentó algo y no lo cogió, y luego entró por la landing y compró pero no
-- le tocó comisión. Así también le da la herramienta al vendedor: como ya
-- tiene el contacto puede hacerle más presión. Se debe hacer por email +
-- teléfono por si se registra con otro email."
--
-- Hasta hoy la comisión solo se atribuía si el cliente entraba por el link
-- del vendedor (?socio=CODIGO). Ahora el vendedor registra a su prospecto
-- (email y/o teléfono) desde su portal; si esa persona se registra después
-- (por cualquier vía) dentro de la ventana de 60 días, se le atribuye al
-- vendedor — mismo campo de siempre (users.referido_por_socio_id), así que
-- todo el cálculo de comisión del webhook queda intacto.
--
-- Reglas:
--   * Gana el PRIMER vendedor que registró el contacto (un email o teléfono
--     solo puede estar vigente con un vendedor a la vez).
--   * No se puede registrar a alguien que ya es usuario (se rechaza en la
--     API) y el prospecto solo cuenta si se creó ANTES que la cuenta.
--   * Un código explícito (?socio=) siempre gana sobre un prospecto.
--   * Si el cliente ya vino por un referido peer-to-peer (referred_by), no se
--     le pisa con un vendedor (nunca deben activarse los dos programas).
--   * El teléfono se compara normalizado a 10 dígitos (sin +1, guiones, etc.).
-- ============================================================================

-- Teléfono que el usuario deja al registrarse (campo opcional "¿Te presentó
-- un vendedor?") — solo sirve para cruzar con socios_prospectos.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telefono_registro text;

CREATE OR REPLACE FUNCTION public.normalizar_telefono(p text)
RETURNS text AS $$
DECLARE
  d text;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  d := regexp_replace(p, '\D', '', 'g');
  IF length(d) = 11 AND left(d, 1) = '1' THEN
    d := substr(d, 2);
  END IF;
  IF length(d) <> 10 THEN
    RETURN NULL;
  END IF;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE public.socios_prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,            -- siempre en minúsculas
  telefono text,         -- siempre normalizado a 10 dígitos
  notas text,
  estado text NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('vigente', 'convertido', 'vencido', 'otro_vendedor')),
  expira_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  convertido_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  convertido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT socios_prospectos_contacto_check CHECK (email IS NOT NULL OR telefono IS NOT NULL)
);

CREATE INDEX socios_prospectos_socio_idx ON public.socios_prospectos (socio_id, created_at DESC);
-- Un contacto solo puede estar VIGENTE con un vendedor a la vez (el primero
-- en registrarlo gana). La API marca como 'vencido' los que ya pasaron de
-- fecha antes de insertar, para liberar el cupo.
CREATE UNIQUE INDEX socios_prospectos_email_vigente_idx
  ON public.socios_prospectos (email) WHERE estado = 'vigente' AND email IS NOT NULL;
CREATE UNIQUE INDEX socios_prospectos_telefono_vigente_idx
  ON public.socios_prospectos (telefono) WHERE estado = 'vigente' AND telefono IS NOT NULL;

-- Sin políticas de RLS a propósito (mismo patrón que socios/socios_comisiones):
-- solo la tocan el service_role (portal del vendedor, panel del founder) y las
-- funciones SECURITY DEFINER de abajo.
ALTER TABLE public.socios_prospectos ENABLE ROW LEVEL SECURITY;

-- Libera el cupo de los prospectos que ya pasaron de su fecha.
CREATE OR REPLACE FUNCTION public.vencer_prospectos()
RETURNS void AS $$
  UPDATE public.socios_prospectos
  SET estado = 'vencido'
  WHERE estado = 'vigente' AND expira_at < now();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Cruza a un usuario con los prospectos vigentes (por email o teléfono) y le
-- atribuye el vendedor que lo registró primero. Idempotente. Devuelve el
-- socio_id al que quedó atribuido (o NULL).
CREATE OR REPLACE FUNCTION public.atribuir_prospecto_a_usuario(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_user record;
  v_tel text;
  v_target uuid;
  v_primero uuid;
BEGIN
  SELECT id, email, telefono_registro, created_at, referido_por_socio_id, referred_by
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_tel := public.normalizar_telefono(v_user.telefono_registro);

  -- Vendedor del prospecto más antiguo que aplica (primero en registrar gana).
  SELECT p.socio_id INTO v_primero
  FROM public.socios_prospectos p
  JOIN public.socios s ON s.id = p.socio_id AND s.estado = 'aprobado' AND s.tipo = 'vendedor'
  WHERE p.estado = 'vigente'
    AND p.created_at <= v_user.created_at
    AND p.expira_at >= v_user.created_at
    AND (
      (p.email IS NOT NULL AND p.email = lower(v_user.email))
      OR (p.telefono IS NOT NULL AND v_tel IS NOT NULL AND p.telefono = v_tel)
    )
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF v_primero IS NULL THEN
    RETURN v_user.referido_por_socio_id;
  END IF;

  v_target := v_user.referido_por_socio_id;

  -- Sin código explícito y sin referido peer-to-peer: se le atribuye al
  -- vendedor del prospecto.
  IF v_target IS NULL AND v_user.referred_by IS NULL THEN
    v_target := v_primero;
    UPDATE public.users SET referido_por_socio_id = v_target WHERE id = p_user_id;
  END IF;

  IF v_target IS NOT NULL THEN
    UPDATE public.socios_prospectos p
    SET estado = CASE WHEN p.socio_id = v_target THEN 'convertido' ELSE 'otro_vendedor' END,
        convertido_user_id = p_user_id,
        convertido_at = now()
    WHERE p.estado = 'vigente'
      AND p.created_at <= v_user.created_at
      AND p.expira_at >= v_user.created_at
      AND (
        (p.email IS NOT NULL AND p.email = lower(v_user.email))
        OR (p.telefono IS NOT NULL AND v_tel IS NOT NULL AND p.telefono = v_tel)
      );
  END IF;

  RETURN v_target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.vencer_prospectos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atribuir_prospecto_a_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vencer_prospectos() TO service_role;
GRANT EXECUTE ON FUNCTION public.atribuir_prospecto_a_usuario(uuid) TO service_role;

-- handle_new_user() (0002/0031/0070): guarda el teléfono opcional del
-- registro con email/contraseña (raw_user_meta_data->>'telefono') y cruza al
-- usuario nuevo con los prospectos de vendedores.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_ref_id uuid;
  v_es_gratis boolean;
  v_socio_id uuid;
  v_tel text;
BEGIN
  v_es_gratis := (NEW.raw_user_meta_data->>'signup_gratis') = 'true';
  v_tel := public.normalizar_telefono(NEW.raw_user_meta_data->>'telefono');

  BEGIN
    v_ref_id := (NEW.raw_user_meta_data->>'ref_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_ref_id := NULL;
  END;
  IF v_ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_ref_id) THEN
    v_ref_id := NULL;
  END IF;

  SELECT id INTO v_socio_id
  FROM public.socios
  WHERE codigo = upper(NEW.raw_user_meta_data->>'socio_codigo') AND estado = 'aprobado';

  IF v_es_gratis THEN
    INSERT INTO public.users (id, email, full_name, plan, plan_status, referred_by, referido_por_socio_id, telefono_registro)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'gratis', 'active', v_ref_id, v_socio_id, v_tel);
  ELSE
    INSERT INTO public.users (id, email, full_name, referred_by, referido_por_socio_id, telefono_registro)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', v_ref_id, v_socio_id, v_tel);
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);

  -- Cruce con prospectos de vendedores (si no hay match no hace nada). Nunca
  -- debe tumbar el registro: cualquier error aquí se ignora.
  BEGIN
    PERFORM public.atribuir_prospecto_a_usuario(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Registro por OAuth (0083): ahora acepta el teléfono opcional y SIEMPRE
-- intenta el cruce con prospectos (aunque no venga ningún código en la URL —
-- el caso típico: el vendedor presentó VICTOR y el cliente entró por la
-- landing con Google). Reemplaza la firma vieja de 3 parámetros.
DROP FUNCTION IF EXISTS public.aplicar_datos_registro_oauth(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.aplicar_datos_registro_oauth(
  p_ref_id uuid DEFAULT NULL,
  p_socio_codigo text DEFAULT NULL,
  p_gratis boolean DEFAULT false,
  p_telefono text DEFAULT NULL
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

  IF v_aplicable IS TRUE THEN
    IF p_ref_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_ref_id) THEN
      v_ref_valido := p_ref_id;
    END IF;

    IF p_socio_codigo IS NOT NULL THEN
      SELECT id INTO v_socio_id FROM public.socios WHERE codigo = upper(p_socio_codigo) AND estado = 'aprobado';
    END IF;

    IF p_gratis THEN
      UPDATE public.users
      SET plan = 'gratis', plan_status = 'active', referred_by = v_ref_valido, referido_por_socio_id = v_socio_id,
          telefono_registro = COALESCE(public.normalizar_telefono(p_telefono), telefono_registro)
      WHERE id = v_uid;
    ELSE
      UPDATE public.users
      SET referred_by = v_ref_valido, referido_por_socio_id = v_socio_id,
          telefono_registro = COALESCE(public.normalizar_telefono(p_telefono), telefono_registro)
      WHERE id = v_uid;
    END IF;
  END IF;

  -- Cruce con prospectos: la propia función valida que el prospecto se haya
  -- creado antes que la cuenta y que siga vigente, así que es seguro correrla
  -- siempre (también para cuentas viejas: no encuentra nada).
  PERFORM public.atribuir_prospecto_a_usuario(v_uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.aplicar_datos_registro_oauth(uuid, text, boolean, text) TO authenticated;
