-- ============================================================================
-- VICTOR CFO — 0070: Programa de Socios (CPAs / influencers) — 5 sept 2026
-- ============================================================================
-- Canal de crecimiento aparte del referido peer-to-peer (migraciones
-- 0031/0062): aquí el "socio" NO tiene por qué ser cliente de VICTOR CFO
-- (un influencer puede aplicar sin haberse registrado nunca), y la
-- recompensa es EFECTIVO real por transferencia/ATH Business (decisión de
-- Joel, 5 sept 2026), no un crédito en el saldo de Stripe — por eso
-- necesita su propia tabla en vez de reusar referral_rewards/referred_by.
--
-- Mecánica: 1-a-1 con el plan del referido (mismo principio autofinanciado
-- que el crédito peer-to-peer — el monto nunca excede lo que esa factura
-- específica acaba de cobrar), UNA sola vez por cliente traído, SIN tope
-- anual (a diferencia del programa peer-to-peer: un socio aprobado es una
-- relación de negocio deliberada, no un usuario cualquiera compartiendo un
-- link — decisión de Joel: "mientras más traiga, más cobra"). El pago es
-- MANUAL: Joel aprueba la solicitud, transfiere por fuera de la app, y
-- marca "pagada" desde el Dashboard de Operaciones — no hay automatización
-- de payout todavía.
--
-- Ojo con Hacienda: como es efectivo de verdad (no un descuento en cuenta
-- como el peer-to-peer), aquí SÍ aplica de lleno la retención de la
-- 1062.03 pasados los primeros $1,500/año a un mismo socio. Fuera de
-- alcance de este v1: no se guarda SSN/EIN todavía (no vale la pena cifrar
-- y proteger un dato tan sensible antes de que haga falta de verdad) — el
-- panel de admin solo avisa con una alerta cuando un socio cruza ese
-- umbral en el año calendario, y Joel resuelve la recolección de datos
-- contributivos y la 480.6 por fuera de la app en ese momento.
-- ============================================================================

CREATE TABLE socios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'otro' CHECK (tipo IN ('cpa', 'influencer', 'otro')),
  nombre text NOT NULL,
  email text NOT NULL,
  telefono text,
  como_promociona text,
  -- Código corto para compartir (ej. "ANA-CPA") — a diferencia del link
  -- peer-to-peer (que usa el uuid real de users.id), aquí se genera uno
  -- legible al aprobar la solicitud. NULL mientras está pendiente: nadie
  -- puede compartir un link que todavía no fue aprobado.
  codigo text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'suspendido')),
  -- Si el socio también es cliente de VICTOR CFO (ej. un CPA con cuenta
  -- propia), esto lo conecta a su fila en users — opcional, un influencer
  -- externo nunca tiene cuenta.
  owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

CREATE UNIQUE INDEX socios_codigo_idx ON socios (codigo) WHERE codigo IS NOT NULL;

-- Quién refirió a este usuario vía el Programa de Socios — separado de
-- users.referred_by (que es el sistema peer-to-peer con crédito en cuenta,
-- migración 0031) porque son dos programas con recompensas y reglas
-- distintas; un mismo usuario nunca debería activar los dos a la vez, pero
-- se guardan aparte para que nunca se puedan confundir en el código.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referido_por_socio_id uuid REFERENCES public.socios(id) ON DELETE SET NULL;

CREATE TABLE socios_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  comision_centavos integer NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada')),
  fecha_pago timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX socios_comisiones_socio_id_idx ON socios_comisiones (socio_id);

-- Tablas de bookkeeping interno (solo las toca el webhook y el Dashboard de
-- Operaciones, ambos con el cliente admin/service_role) — sin políticas de
-- RLS con USING, así que con RLS encendido quedan bloqueadas para
-- cualquier otro rol. Mismo patrón que referral_rewards (migración 0062).
ALTER TABLE socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios_comisiones ENABLE ROW LEVEL SECURITY;

-- handle_new_user() (0002, extendida en 0031) — se añade un tercer campo
-- opcional del raw_user_meta_data: socio_codigo, del query param ?socio=
-- de /registro. Se valida contra la tabla socios (código existente Y
-- estado='aprobado') antes de guardar — mismo criterio defensivo que
-- ref_id: nunca se confía a ciegas en un dato que vino del navegador de un
-- desconocido, y un código de una solicitud todavía pendiente no cuenta.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_ref_id uuid;
  v_es_gratis boolean;
  v_socio_id uuid;
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

  SELECT id INTO v_socio_id
  FROM public.socios
  WHERE codigo = NEW.raw_user_meta_data->>'socio_codigo' AND estado = 'aprobado';

  IF v_es_gratis THEN
    INSERT INTO public.users (id, email, full_name, plan, plan_status, referred_by, referido_por_socio_id)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'gratis', 'active', v_ref_id, v_socio_id);
  ELSE
    INSERT INTO public.users (id, email, full_name, referred_by, referido_por_socio_id)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', v_ref_id, v_socio_id);
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
