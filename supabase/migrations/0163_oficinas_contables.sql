-- Requiere haber corrido 0162 (users.es_contable).
-- ============================================================================
-- VICTOR CFO — 0163: Oficinas de contables (registro compartido de vendedores
-- + directorio para clientes) y seguimiento de prospectos — 18 oct 2026
-- ============================================================================
-- Pedido de Joel:
--  1) Que los vendedores registren las oficinas de contables que visitan para
--     no repetirlas: el vendedor que la registra es "dueño" del seguimiento 60
--     días (se renueva con cada actualización); los demás ven solo que ya fue
--     visitada y su estado, sin quién ni los datos de contacto.
--  2) Cuando el contable se registra en el portal, la ficha pasa a ser suya y
--     aparece automáticamente en el directorio de contables para los clientes
--     de VICTOR que no tienen uno (cuando su perfil está completo).
--  3) Que el vendedor pueda guardar sus prospectos (clientes) con estado de
--     seguimiento (pendiente / visitado / interesado / demo hecha / rechazó) y
--     filtrarlos.
-- ============================================================================

-- ---- 3) Seguimiento en prospectos del vendedor ----------------------------
ALTER TABLE public.socios_prospectos
  ADD COLUMN IF NOT EXISTS seguimiento text NOT NULL DEFAULT 'pendiente'
    CHECK (seguimiento IN ('pendiente', 'visitado', 'interesado', 'demo_hecha', 'rechazo')),
  ADD COLUMN IF NOT EXISTS pueblo text,
  ADD COLUMN IF NOT EXISTS seguimiento_at timestamptz NOT NULL DEFAULT now();

-- ---- 1/2) Oficinas de contables -------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficinas_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  nombre_norm text NOT NULL,                       -- minúsculas, sin acentos ni símbolos (lo calcula la API)
  -- Dueño del seguimiento (vendedor). NULL = nadie la registró (el contable
  -- se registró solo) o se liberó.
  socio_id uuid REFERENCES public.socios(id) ON DELETE SET NULL,
  owner_expira_at timestamptz,
  estado text NOT NULL DEFAULT 'visitado'
    CHECK (estado IN ('pendiente', 'visitado', 'interesado', 'demo_hecha', 'rechazo')),
  notas_vendedor text,                             -- interno, nunca se muestra a clientes
  descripcion_vendedor text,                       -- interno hasta que el contable escribe la suya
  -- Datos de la ficha (los llena el vendedor y luego los corrige el contable)
  contacto_nombre text,
  email text,                                      -- siempre en minúsculas
  telefono text,                                   -- normalizado a 10 dígitos
  pueblo text,
  web text,
  instagram text,
  facebook text,
  sectores text[] NOT NULL DEFAULT '{}',
  especialidades text[] NOT NULL DEFAULT '{}',
  remoto boolean NOT NULL DEFAULT false,
  -- Lo que escribe el contable y se muestra a los clientes en el directorio.
  descripcion text,
  -- Contable dueño de la ficha (portal). Si no es NULL => "tiene el portal".
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  publicar boolean NOT NULL DEFAULT true,          -- interruptor del contable
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS oficinas_contables_email_idx
  ON public.oficinas_contables (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oficinas_contables_telefono_idx
  ON public.oficinas_contables (telefono) WHERE telefono IS NOT NULL;
CREATE INDEX IF NOT EXISTS oficinas_contables_nombre_idx ON public.oficinas_contables (nombre_norm);
CREATE INDEX IF NOT EXISTS oficinas_contables_socio_idx ON public.oficinas_contables (socio_id);

-- Solo service_role (APIs del portal del vendedor, portal CPA y directorio).
ALTER TABLE public.oficinas_contables ENABLE ROW LEVEL SECURITY;

-- Une cada ficha con el contable ya registrado (mismo email) => "tiene el
-- portal". Idempotente; se llama desde las APIs antes de listar.
CREATE OR REPLACE FUNCTION public.sincronizar_oficinas_contables()
RETURNS void AS $$
  UPDATE public.oficinas_contables o
  SET user_id = u.id, updated_at = now()
  FROM public.users u
  WHERE o.user_id IS NULL
    AND o.email IS NOT NULL
    AND lower(u.email) = o.email
    AND (
      u.es_contable
      OR u.es_firma_accountant
      OR EXISTS (
        SELECT 1 FROM public.account_members m
        WHERE lower(m.member_email) = lower(u.email) AND m.role = 'cpa'
      )
    )
    AND NOT EXISTS (SELECT 1 FROM public.oficinas_contables o2 WHERE o2.user_id = u.id);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ---- Solicitudes de contacto cliente -> contable --------------------------
CREATE TABLE IF NOT EXISTS public.contable_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id uuid NOT NULL REFERENCES public.oficinas_contables(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nombre_cliente text NOT NULL,
  email_cliente text NOT NULL,
  telefono_cliente text,
  mensaje text,
  autorizo_compartir boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contable_solicitudes_oficina_idx ON public.contable_solicitudes (oficina_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contable_solicitudes_cliente_idx ON public.contable_solicitudes (cliente_id, oficina_id, created_at DESC);

ALTER TABLE public.contable_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY contable_solicitudes_cliente_read ON public.contable_solicitudes
  FOR SELECT USING (cliente_id = auth.uid());
-- (El contable no lee esta tabla directo: se entera por correo; las APIs usan service_role.)
