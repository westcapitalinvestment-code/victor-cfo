-- ============================================================================
-- VICTOR CFO — 0197: Embudo/productividad del vendedor + correos automáticos
-- a contactos con permiso — 1 nov 2026
-- ============================================================================
-- Pedido de Joel:
--  1) Medir la productividad y el alcance: cuántas oficinas y negocios visita
--     cada vendedor, en qué estado queda cada uno (pendiente, visitado,
--     interesado, demo hecha, rechazó), cuántas personas "conocen VICTOR" y
--     cuántas "forman parte" (se registraron / pagan).
--  2) Cuando un vendedor recoge el email de un contable o de un negocio, que
--     VICTOR le escriba AUTOMÁTICAMENTE (sin depender de Joel) una secuencia
--     corta de correos, SOLO si la persona dio permiso en la visita, y con
--     enlace de baja en cada correo.
--
-- Requiere 0150 (socios_prospectos), 0161 (mkt_prospectos / mkt_config) y
-- 0163 (oficinas_contables). Sin políticas de RLS a propósito (mismo patrón
-- que socios/socios_prospectos): solo el service_role (APIs del portal del
-- vendedor, crons y panel del founder).
-- ============================================================================

-- ---- 1) Historial de cambios de estado (embudo) ---------------------------
CREATE TABLE IF NOT EXISTS public.socios_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('oficina', 'prospecto')),
  ref_id uuid NOT NULL,                      -- oficinas_contables.id o socios_prospectos.id (sin FK: el historial sobrevive si se borra la ficha)
  estado_anterior text,                      -- NULL = contacto nuevo para este vendedor
  estado_nuevo text NOT NULL
    CHECK (estado_nuevo IN ('pendiente', 'visitado', 'interesado', 'demo_hecha', 'rechazo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS socios_eventos_socio_fecha_idx ON public.socios_eventos (socio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS socios_eventos_ref_idx ON public.socios_eventos (tipo, ref_id);
ALTER TABLE public.socios_eventos ENABLE ROW LEVEL SECURITY;

-- Triggers: capturan TODO cambio de estado sin importar por qué ruta llegó.
CREATE OR REPLACE FUNCTION public.log_evento_oficina()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.socio_id IS NOT NULL THEN
      INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo)
      VALUES (NEW.socio_id, 'oficina', NEW.id, NULL, NEW.estado);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.socio_id IS NOT NULL
       AND (OLD.socio_id IS DISTINCT FROM NEW.socio_id OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
      INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo)
      VALUES (
        NEW.socio_id, 'oficina', NEW.id,
        CASE WHEN OLD.socio_id IS DISTINCT FROM NEW.socio_id THEN NULL ELSE OLD.estado END,
        NEW.estado
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_evento_oficina ON public.oficinas_contables;
CREATE TRIGGER trg_log_evento_oficina
  AFTER INSERT OR UPDATE OF estado, socio_id ON public.oficinas_contables
  FOR EACH ROW EXECUTE FUNCTION public.log_evento_oficina();

CREATE OR REPLACE FUNCTION public.log_evento_prospecto()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo)
    VALUES (NEW.socio_id, 'prospecto', NEW.id, NULL, NEW.seguimiento);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.seguimiento IS DISTINCT FROM NEW.seguimiento THEN
      INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo)
      VALUES (NEW.socio_id, 'prospecto', NEW.id, OLD.seguimiento, NEW.seguimiento);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_evento_prospecto ON public.socios_prospectos;
CREATE TRIGGER trg_log_evento_prospecto
  AFTER INSERT OR UPDATE OF seguimiento ON public.socios_prospectos
  FOR EACH ROW EXECUTE FUNCTION public.log_evento_prospecto();

-- Relleno inicial: un evento por cada oficina/prospecto que ya existe, con su
-- fecha de creación y su estado actual (el historial real empieza hoy).
INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo, created_at)
SELECT o.socio_id, 'oficina', o.id, NULL, o.estado, o.created_at
FROM public.oficinas_contables o
WHERE o.socio_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.socios_eventos e WHERE e.tipo = 'oficina' AND e.ref_id = o.id);

INSERT INTO public.socios_eventos (socio_id, tipo, ref_id, estado_anterior, estado_nuevo, created_at)
SELECT p.socio_id, 'prospecto', p.id, NULL, p.seguimiento, p.created_at
FROM public.socios_prospectos p
WHERE NOT EXISTS (SELECT 1 FROM public.socios_eventos e WHERE e.tipo = 'prospecto' AND e.ref_id = p.id);

-- ---- 2) Contactos con permiso para correos automáticos --------------------
CREATE TABLE IF NOT EXISTS public.socios_contactos_correo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,                       -- siempre en minúsculas
  nombre text,                               -- persona o negocio, para el saludo
  tipo text NOT NULL CHECK (tipo IN ('contable', 'negocio')),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,  -- vendedor que lo visitó (el primero que lo registra)
  origen text NOT NULL CHECK (origen IN ('oficina', 'prospecto')),
  ref_id uuid,
  permiso_at timestamptz NOT NULL DEFAULT now(),   -- cuándo el vendedor marcó que dio permiso
  baja_at timestamptz,                       -- darse de baja (enlace del correo, o el vendedor retira el permiso)
  detenido_razon text,                       -- es_usuario | tiene_portal | baja_previa | demasiados_errores
  paso integer NOT NULL DEFAULT 0,           -- cuántos correos de la secuencia ya salieron (0-3)
  ultimo_envio_at timestamptz,
  errores integer NOT NULL DEFAULT 0,
  ultimo_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS socios_contactos_correo_email_uq
  ON public.socios_contactos_correo (email);
CREATE INDEX IF NOT EXISTS socios_contactos_correo_socio_idx
  ON public.socios_contactos_correo (socio_id);
CREATE INDEX IF NOT EXISTS socios_contactos_correo_pendientes_idx
  ON public.socios_contactos_correo (permiso_at)
  WHERE baja_at IS NULL AND detenido_razon IS NULL;
ALTER TABLE public.socios_contactos_correo ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.socios_contactos_correo IS
  'Contactos (contables y negocios) que dieron permiso en la visita para recibir una secuencia corta de correos de VICTOR CFO. Cron: /api/cron/contactos-correo. Un correo = una fila; quien se da de baja no vuelve a recibir nada.';

-- ¿Ya es usuario de VICTOR? (sin comodines de ILIKE: compara en minúsculas)
CREATE OR REPLACE FUNCTION public.existe_usuario_por_email(p_email text)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(p_email));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
