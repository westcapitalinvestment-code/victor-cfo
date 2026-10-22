-- VICTOR CFO — 0185: acceso del contable POR ENTIDAD (21 oct 2026)
--
-- Hasta ahora una fila account_members(role='cpa') con entity_id = una entidad
-- era solo cosmética: las políticas RLS del contable miran únicamente
-- (owner_id + email + active), así que cualquier contable de un dueño veía
-- TODAS sus entidades. Esta migración lo cierra en la base de datos:
--
--   * cpa_bloqueado(entidad): true si quien consulta es contable de ese dueño
--     pero NINGUNA de sus filas activas cubre esa entidad (entity_id NULL =
--     todas, o entity_id = esa entidad). No afecta al dueño, al admin ni a
--     filas sin entidad (lo personal sigue regido por share_personal).
--   * Política RESTRICTIVE (se combina con AND con las existentes) en toda
--     tabla pública con columna entity_id, y en las tablas hijas que cuelgan
--     de una fila con entidad (items/adjuntos de facturas, cotizaciones, etc.).
--
-- Idempotente. También agrega cpa_invitations.entity_ids para invitar a UN
-- contable a varias entidades con un solo correo.

ALTER TABLE cpa_invitations ADD COLUMN IF NOT EXISTS entity_ids uuid[];

CREATE OR REPLACE FUNCTION public.cpa_bloqueado(p_entity uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_email text := lower(coalesce(auth.email(), ''));
BEGIN
  IF p_entity IS NULL OR auth.uid() IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;
  SELECT owner_id INTO v_owner FROM business_entities WHERE id = p_entity;
  IF v_owner IS NULL OR v_owner = auth.uid() THEN
    RETURN false;
  END IF;
  -- Admin/secretaria: otras políticas los gobiernan.
  IF EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = v_owner AND am.role = 'admin' AND am.active = true
      AND lower(am.member_email) = v_email
  ) THEN
    RETURN false;
  END IF;
  -- Si no es contable de este dueño, no es asunto de esta política.
  IF NOT EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = v_owner AND am.role = 'cpa' AND am.active = true
      AND lower(am.member_email) = v_email
  ) THEN
    RETURN false;
  END IF;
  -- Es contable: bloqueado salvo que alguna fila cubra la entidad.
  RETURN NOT EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = v_owner AND am.role = 'cpa' AND am.active = true
      AND lower(am.member_email) = v_email
      AND (am.entity_id IS NULL OR am.entity_id = p_entity)
  );
END;
$$;

-- Entidad de la fila padre (para tablas hijas sin entity_id). SECURITY DEFINER
-- para que un contable bloqueado no "pierda" la fila padre por su propia RLS.
CREATE OR REPLACE FUNCTION public.entidad_de_fila(p_tabla text, p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v uuid;
BEGIN
  IF p_id IS NULL OR p_tabla NOT IN ('invoices','cotizaciones','documents','technician_visits','vendor_retenciones','transactions','vendors') THEN
    RETURN NULL;
  END IF;
  EXECUTE format('SELECT entity_id FROM public.%I WHERE id = $1', p_tabla) INTO v USING p_id;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cpa_bloqueado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entidad_de_fila(text, uuid) TO authenticated;

DO $$
DECLARE
  t record;
  h record;
BEGIN
  -- 1) Toda tabla con entity_id y RLS activo.
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN information_schema.columns ic
      ON ic.table_schema = 'public' AND ic.table_name = c.relname AND ic.column_name = 'entity_id'
    WHERE c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('account_members','cpa_invitations','admin_invitations','cpa_team_invitations','cpa_client_favoritos','users')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cpa_entity_scope ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY cpa_entity_scope ON public.%I AS RESTRICTIVE FOR ALL USING (NOT public.cpa_bloqueado(entity_id)) WITH CHECK (NOT public.cpa_bloqueado(entity_id))',
      t.relname
    );
  END LOOP;

  -- 2) La propia entidad.
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'business_entities' AND c.relrowsecurity) THEN
    DROP POLICY IF EXISTS cpa_entity_scope ON public.business_entities;
    CREATE POLICY cpa_entity_scope ON public.business_entities AS RESTRICTIVE FOR ALL
      USING (NOT public.cpa_bloqueado(id)) WITH CHECK (NOT public.cpa_bloqueado(id));
  END IF;

  -- 3) Tablas hijas: (hija, columna FK, tabla padre).
  FOR h IN
    SELECT * FROM (VALUES
      ('invoice_items','invoice_id','invoices'),
      ('invoice_attachments','invoice_id','invoices'),
      ('cotizacion_items','cotizacion_id','cotizaciones'),
      ('cotizacion_attachments','cotizacion_id','cotizaciones'),
      ('document_files','document_id','documents'),
      ('technician_visit_items','visit_id','technician_visits'),
      ('vendor_retencion_attachments','vendor_retencion_id','vendor_retenciones'),
      ('transaction_sync_log','transaction_id','transactions'),
      ('vendor_480_validation','vendor_id','vendors')
    ) AS v(hija, fk, padre)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = h.hija AND c.relrowsecurity
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = h.hija AND column_name = h.fk
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS cpa_entity_scope ON public.%I', h.hija);
      EXECUTE format(
        'CREATE POLICY cpa_entity_scope ON public.%I AS RESTRICTIVE FOR ALL USING (NOT public.cpa_bloqueado(public.entidad_de_fila(%L, %I))) WITH CHECK (NOT public.cpa_bloqueado(public.entidad_de_fila(%L, %I)))',
        h.hija, h.padre, h.fk, h.padre, h.fk
      );
    END IF;
  END LOOP;
END $$;
