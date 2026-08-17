-- ============================================================================
-- VICTOR CFO — Schema completo desde cero (v1, 16 ago 2026)
-- ============================================================================
-- CONTEXTO: la base de datos real en Supabase (proyecto victor-cfo) tenía 14
-- tablas creadas pero completamente vacías — ningún dato real, confirmado por
-- Joel. Ese schema viejo era parcial (ej. invoices.client_id sin tabla
-- clients) y no soportaba multi-entidad ni el portal del CPA. Este archivo
-- reemplaza TODO desde cero: borra las tablas viejas vacías y crea el schema
-- completo, reconciliando 3 fuentes:
--   1) Las tablas reales que SÍ estaban bien pensadas (hacienda_categories,
--      pending_receipts, documents con alertas, fiscal_params) — se
--      conservan con el mismo nombre y casi las mismas columnas.
--   2) El plan de VICTOR_Supabase_Tablas_Julio_v2.docx (multi-entidad,
--      contratistas, roles) — se incorpora bajo los nombres business_entities
--      y account_members.
--   3) Todo lo diseñado en sesiones anteriores: IVU (tracker + semáforo de
--      cuadre de 3 fuentes), portal CPA, motor de categorización con
--      feedback loop, bóveda de recibos, auditoría.
--
-- CÓMO CORRERLO: pega este archivo COMPLETO en el SQL Editor de Supabase
-- (https://supabase.com/dashboard/project/cmolhciiaxdniqijpmtt/sql/new) y
-- dale Run una sola vez. Es seguro — las tablas que borra están confirmadas
-- vacías.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. LIMPIEZA — borra las 14 tablas viejas (confirmado: están vacías)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS fiscal_params CASCADE;
DROP TABLE IF EXISTS hacienda_categories CASCADE;
DROP TABLE IF EXISTS invoice_attachments CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS pending_receipts CASCADE;
DROP TABLE IF EXISTS retenciones_hacienda CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS vendor_retenciones CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;

-- ============================================================================
-- 1. IDENTIDAD Y MULTI-ENTIDAD
-- ============================================================================

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  plan text DEFAULT 'core',              -- core | pro | proplus
  plan_status text DEFAULT 'trialing',   -- active | trialing | cancelled
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Perfil extendido — separado de users para no mezclar datos de cuenta
-- (billing) con preferencias/datos personales.
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone text,
  address text,
  dark_mode boolean DEFAULT false,
  communication_prefs jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Entidades de negocio del dueño — soporta el caso "Dr. Valentín, 3 corps"
-- documentado en Julio v5. entity_id = null en otras tablas significa
-- "contexto personal", no una entidad de negocio.
CREATE TABLE business_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ein text,
  entity_type text,                      -- LLC | Corp | Individuo_DBA | personal
  municipio text,
  ivu_applies boolean DEFAULT false,
  ivu_rate_estatal numeric(5,3) DEFAULT 10.5,
  ivu_rate_municipal numeric(5,3) DEFAULT 0,
  ivu_deposit_day smallint DEFAULT 20,
  plaid_access_token text,               -- cifrado a nivel de aplicación
  plaid_item_id text,
  stripe_customer_id text,               -- checkout propio por entidad (ver docx v5, corrección 21 jul)
  stripe_subscription_id text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Acceso de terceros a las entidades del dueño: admin/secretaria y CPA.
-- Un CPA puede tener varias filas aquí (una por cada dueño que lo invitó) —
-- así resuelve "un login, múltiples clientes" sin tablas adicionales.
CREATE TABLE account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = todas las entidades del owner
  member_email text NOT NULL,
  role text NOT NULL,                    -- admin | cpa
  permissions jsonb DEFAULT '{}'::jsonb,  -- toggles granulares (ver docx tabla 37)
  active boolean DEFAULT true,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

-- Invitación pendiente antes de que el CPA/admin tenga cuenta propia.
CREATE TABLE cpa_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  cpa_name text,
  cpa_email text NOT NULL,
  custom_message text,
  invitation_token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'pending',          -- pending | accepted | expired
  sent_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

-- ============================================================================
-- 2. CLIENTES Y VENDORS (quién le paga al negocio / a quién le paga el negocio)
-- ============================================================================

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  tax_id text,
  retention_pct numeric DEFAULT 0,        -- 0, 6 ó 10 — retención que el cliente aplica al pagarle al negocio
  -- certificado de exención de IVU (revendedor) — feedback CPA vía Gemini
  ivu_exempt_reseller boolean DEFAULT false,
  exemption_certificate_number text,
  exemption_validated boolean DEFAULT false,
  exemption_validated_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text,                            -- SSN / EIN
  vendor_type text DEFAULT 'general',     -- general | contratista_servicios
  retention_type text,                    -- 480.6A (exento) / 480.6B (sujeto a retención)
  default_retention_pct numeric DEFAULT 0, -- 0, 6 ó 10
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE vendor_retenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  gross_amount numeric NOT NULL,
  retention_pct numeric NOT NULL,
  retention_amount numeric NOT NULL,
  net_paid numeric GENERATED ALWAYS AS (gross_amount - retention_amount) STORED,
  period_start date,
  period_end date,
  remittance_status text DEFAULT 'pendiente', -- pendiente | remesado
  created_at timestamptz DEFAULT now()
);

-- Checklist de validación 480.6A/B por vendor antes de la temporada de
-- informativas (feedback CPA vía Gemini).
CREATE TABLE vendor_480_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_year smallint NOT NULL,
  name_confirmed boolean DEFAULT false,
  address_on_file text,
  address_confirmed boolean DEFAULT false,
  tax_id_confirmed boolean DEFAULT false,
  total_paid_ytd numeric DEFAULT 0,
  ready_for_480 boolean GENERATED ALWAYS AS (name_confirmed AND address_confirmed AND tax_id_confirmed) STORED,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (vendor_id, period_year)
);

-- ============================================================================
-- 3. FACTURACIÓN — se conserva la estructura real que ya tenías (invoices ya
-- traía ivu_pct/ivu_monto/retencion_pct/retencion_monto de fábrica), solo se
-- le añade entity_id y la FK real a clients que faltaba.
-- ============================================================================

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  numero text NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  ivu_pct numeric DEFAULT 0,
  ivu_monto numeric DEFAULT 0,
  retencion_pct numeric DEFAULT 0,
  retencion_monto numeric DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  estado text DEFAULT 'borrador',        -- borrador | enviada | vista | pagada | vencida
  fecha_emision date DEFAULT CURRENT_DATE,
  fecha_vencimiento date,
  stripe_payment_intent text,
  metodo_pago text,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric DEFAULT 1,
  precio_unitario numeric NOT NULL,
  subtotal_linea numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL,
  tipo text,
  r2_key text NOT NULL,                  -- Cloudflare R2
  tamano_bytes integer,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. BANCO, CATEGORIZACIÓN Y BÓVEDA DE RECIBOS
-- ============================================================================

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = personal
  plaid_transaction_id text,
  description_raw text NOT NULL,          -- descripción cruda del banco, a veces truncada
  amount numeric NOT NULL,
  fecha date NOT NULL,
  category text,                          -- se llena por el motor de categorización (o null = bandeja de pendientes)
  hacienda_category_id integer,           -- FK definida abajo, tras crear hacienda_categories
  is_personal boolean DEFAULT false,
  business_percentage numeric DEFAULT 100.00, -- prorrateo (ej. 70.00 = 70% negocio)
  matched_pattern_id uuid,                -- FK definida abajo, tras crear merchant_patterns
  category_overridden_by_user boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Taxonomía fiscal de PR — Anejo M / Schedule C. Esta tabla ya existía y
-- estaba bien pensada; se conserva casi igual.
CREATE TABLE hacienda_categories (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  linea_anejo_m text,
  linea_schedule_c text,
  deducible_multiplier numeric DEFAULT 1.0,
  requiere_vendor boolean DEFAULT false,
  requiere_confirmacion boolean DEFAULT false,
  es_home_office boolean DEFAULT false,
  palabras_clave text[],
  regla_trigger text,
  disclaimer text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_hacienda_category
  FOREIGN KEY (hacienda_category_id) REFERENCES hacienda_categories(id);

-- Motor de categorización — el patrón (wildcard) que aprende de las
-- correcciones del usuario y sugiere la hacienda_category correspondiente.
CREATE TABLE merchant_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = patrón global
  pattern text NOT NULL,
  sample_raw_description text,
  hacienda_category_id integer REFERENCES hacienda_categories(id),
  is_personal boolean DEFAULT false,
  confidence numeric(4,3) DEFAULT 1.0,
  status text DEFAULT 'candidate',        -- candidate | confirmed | deprecated
  source text DEFAULT 'system',           -- system | user_correction
  usage_count integer DEFAULT 0,
  times_confirmed integer DEFAULT 0,
  times_rejected integer DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_matched_pattern
  FOREIGN KEY (matched_pattern_id) REFERENCES merchant_patterns(id);

-- Bóveda de recibos — ya existía como pending_receipts, se conserva el
-- nombre y se le añade entity_id.
CREATE TABLE pending_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  monto_declarado numeric NOT NULL,
  descripcion text,
  categoria_sugerida text,
  fecha_captura timestamptz DEFAULT now(),
  r2_key text,                            -- foto del recibo en Cloudflare R2
  estado text DEFAULT 'pendiente',        -- pendiente | con_foto | resuelto
  match_tipo text,                        -- automatico | manual
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. CUMPLIMIENTO FISCAL — IVU, retenciones, estimadas
-- ============================================================================

-- Parámetros fiscales genéricos (tasas, límites) — ya existía, se conserva.
CREATE TABLE fiscal_params (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE, -- null = parámetro global de VICTOR
  param_nombre text NOT NULL,
  param_valor numeric,
  param_texto text,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  fuente text,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Acumulado mensual de IVU por entidad — cuánto hay que depositar en SURI.
CREATE TABLE ivu_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  period_month smallint NOT NULL,
  period_year smallint NOT NULL,
  ivu_collected numeric DEFAULT 0,
  ivu_paid_credits numeric DEFAULT 0,
  ivu_net_due numeric GENERATED ALWAYS AS (ivu_collected - ivu_paid_credits) STORED,
  due_date date NOT NULL,
  deposit_status text DEFAULT 'pendiente', -- pendiente | depositado | overdue
  deposit_date date,
  suri_confirmation_number text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_id, period_month, period_year)
);

-- Semáforo de cuadre de 3 fuentes: SURI vs banco vs procesador de pagos.
CREATE TABLE ivu_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  period_month smallint NOT NULL,
  period_year smallint NOT NULL,
  ivu_declared_suri numeric DEFAULT 0,
  ivu_bank_deposits numeric DEFAULT 0,
  ivu_processor_reported numeric DEFAULT 0,
  variance_bank numeric GENERATED ALWAYS AS (ivu_declared_suri - ivu_bank_deposits) STORED,
  variance_processor numeric GENERATED ALWAYS AS (ivu_declared_suri - ivu_processor_reported) STORED,
  semaphore_status text DEFAULT 'verde',  -- verde | amarillo | rojo
  alert_message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_id, period_month, period_year)
);

-- Retenciones depositadas a Hacienda (agregado mensual) — ya existía, se
-- conserva el nombre y se le añade entity_id.
CREATE TABLE retenciones_hacienda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  mes integer NOT NULL,
  ano integer NOT NULL,
  monto_retenido numeric DEFAULT 0,
  estado text DEFAULT 'pendiente',        -- pendiente | depositado
  fecha_deposito date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE estimated_tax_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  quarter smallint NOT NULL,              -- 1-4 (15 abr / 15 jun / 15 sep / 15 dic)
  period_year smallint NOT NULL,
  amount_due numeric,
  due_date date NOT NULL,
  status text DEFAULT 'pendiente',        -- pendiente | pagado
  paid_date date,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 6. DOCUMENTOS Y ALERTAS — ya existía, se conserva casi igual.
-- ============================================================================

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text,
  r2_key text,
  fecha_vencimiento date,
  alerta_90 boolean DEFAULT false,
  alerta_30 boolean DEFAULT false,
  alerta_7 boolean DEFAULT false,
  estado text DEFAULT 'activo',
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. VICTOR IA — memoria y conversaciones
-- ============================================================================

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  messages_json jsonb DEFAULT '[]'::jsonb,
  tokens_usados integer DEFAULT 0,
  fecha timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE victor_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goals jsonb DEFAULT '[]'::jsonb,
  financial_summary jsonb DEFAULT '{}'::jsonb,
  active_strategies jsonb DEFAULT '[]'::jsonb,
  key_decisions jsonb DEFAULT '[]'::jsonb,
  last_conversation_summary text,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. AUDITORÍA — trazabilidad de cambios (dueño, admin, CPA)
-- ============================================================================

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_by_role text NOT NULL,          -- owner | admin | cpa
  description text NOT NULL,
  debit_account text,
  credit_account text,
  amount numeric NOT NULL,
  period_month smallint NOT NULL,
  period_year smallint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  actor_role text NOT NULL,               -- owner | admin | cpa | system
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_table text,
  target_id uuid,
  changes jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. FUNCIONES DEL MOTOR DE CATEGORIZACIÓN (feedback loop)
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_description(raw text)
RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := upper(raw);
  cleaned := regexp_replace(cleaned, '\y(POS|DEBITO|CREDITO|CARGO|COMPRA|PAGO|TRANSFERENCIA|REF|TRANS)\y', '', 'g');
  cleaned := regexp_replace(cleaned, '\d{3,}', '', 'g');
  cleaned := trim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  RETURN trim(cleaned) || '%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION match_category(p_raw_description text, p_entity_id uuid)
RETURNS TABLE(pattern_id uuid, hacienda_category_id integer, confidence numeric, status text, is_personal boolean) AS $$
BEGIN
  RETURN QUERY
  SELECT mp.id, mp.hacienda_category_id, mp.confidence, mp.status, mp.is_personal
  FROM merchant_patterns mp
  WHERE upper(p_raw_description) LIKE mp.pattern
    AND (mp.entity_id = p_entity_id OR mp.entity_id IS NULL)
    AND mp.status != 'deprecated'
  ORDER BY
    (mp.entity_id = p_entity_id) DESC,
    mp.confidence DESC,
    length(mp.pattern) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION trigger_auto_categorize()
RETURNS trigger AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM match_category(NEW.description_raw, NEW.entity_id);

  IF v_match.pattern_id IS NOT NULL AND v_match.confidence >= 0.85 AND v_match.status = 'confirmed' THEN
    NEW.hacienda_category_id := v_match.hacienda_category_id;
    NEW.is_personal := v_match.is_personal;
    NEW.matched_pattern_id := v_match.pattern_id;
    NEW.category_overridden_by_user := false;
    UPDATE merchant_patterns SET usage_count = usage_count + 1, last_matched_at = now() WHERE id = v_match.pattern_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_categorize ON transactions;
CREATE TRIGGER trg_auto_categorize
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_auto_categorize();

CREATE OR REPLACE FUNCTION record_user_correction(
  p_transaction_id uuid,
  p_entity_id uuid,
  p_raw_description text,
  p_confirmed_hacienda_category_id integer,
  p_matched_pattern_id uuid,
  p_actor_role text
) RETURNS void AS $$
DECLARE
  v_new_pattern_id uuid;
  v_promotion_threshold integer := 3;
  v_rejection_threshold integer := 2;
  v_matched_category integer;
BEGIN
  IF p_matched_pattern_id IS NOT NULL THEN
    SELECT hacienda_category_id INTO v_matched_category FROM merchant_patterns WHERE id = p_matched_pattern_id;

    IF v_matched_category = p_confirmed_hacienda_category_id THEN
      UPDATE merchant_patterns
      SET times_confirmed = times_confirmed + 1,
          usage_count = usage_count + 1,
          confidence = LEAST(confidence + 0.05, 1.0),
          last_matched_at = now(),
          status = CASE WHEN status = 'candidate' AND times_confirmed + 1 >= v_promotion_threshold
                        THEN 'confirmed' ELSE status END,
          updated_at = now()
      WHERE id = p_matched_pattern_id;
    ELSE
      UPDATE merchant_patterns
      SET times_rejected = times_rejected + 1,
          confidence = GREATEST(confidence - 0.15, 0.0),
          status = CASE WHEN times_rejected + 1 >= v_rejection_threshold
                        THEN 'deprecated' ELSE status END,
          updated_at = now()
      WHERE id = p_matched_pattern_id;
    END IF;
  END IF;

  IF p_matched_pattern_id IS NULL OR v_matched_category != p_confirmed_hacienda_category_id THEN
    INSERT INTO merchant_patterns (entity_id, pattern, sample_raw_description, hacienda_category_id, source, status, confidence)
    VALUES (p_entity_id, normalize_description(p_raw_description), p_raw_description, p_confirmed_hacienda_category_id, 'user_correction', 'candidate', 0.6)
    RETURNING id INTO v_new_pattern_id;
  END IF;

  INSERT INTO audit_log (actor_role, entity_id, action, target_table, target_id, changes)
  VALUES (p_actor_role, p_entity_id, 'category_override', 'transactions', p_transaction_id,
          jsonb_build_object('categoria_confirmada', p_confirmed_hacienda_category_id, 'patron_usado', p_matched_pattern_id, 'patron_nuevo', v_new_pattern_id));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. ROW LEVEL SECURITY — activado en todo lo que tiene datos de usuarios.
-- Regla base: el dueño ve lo suyo (owner_id/user_id = auth.uid()), y un CPA/
-- admin ve lo del dueño que lo invitó vía account_members.
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users FOR ALL USING (id = auth.uid());

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_self ON user_profiles FOR ALL USING (id = auth.uid());

ALTER TABLE business_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_entities_access ON business_entities FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = business_entities.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_members_access ON account_members FOR ALL USING (
  owner_id = auth.uid() OR member_email = auth.email()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_access ON clients FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = clients.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_access ON vendors FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendors.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_access ON invoices FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoices.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_access ON transactions FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE pending_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_receipts_access ON pending_receipts FOR ALL USING (owner_id = auth.uid());

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_access ON documents FOR ALL USING (owner_id = auth.uid());

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_self ON conversations FOR ALL USING (user_id = auth.uid());

ALTER TABLE victor_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY victor_memory_self ON victor_memory FOR ALL USING (user_id = auth.uid());

-- hacienda_categories es catálogo global — lectura pública para cualquier
-- usuario autenticado, sin escritura (eso lo maneja VICTOR internamente).
ALTER TABLE hacienda_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY hacienda_categories_read ON hacienda_categories FOR SELECT USING (true);

-- --- Las 13 tablas que faltaban (Supabase las marcó correctamente como
-- riesgo de seguridad — sin esto, cualquiera con la llave pública podría
-- leer datos de otros usuarios). Mismo patrón que arriba: dueño directo, o
-- acceso vía la entidad de negocio a la que pertenecen. ---

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_items_access ON invoice_items FOR ALL USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND (
    i.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = i.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_attachments_access ON invoice_attachments FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoice_attachments.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE vendor_retenciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_retenciones_access ON vendor_retenciones FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendor_retenciones.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE vendor_480_validation ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_480_validation_access ON vendor_480_validation FOR ALL USING (
  EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_480_validation.vendor_id AND (
    v.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = v.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE cpa_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpa_invitations_access ON cpa_invitations FOR ALL USING (
  owner_id = auth.uid() OR cpa_email = auth.email()
);

ALTER TABLE merchant_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_patterns_access ON merchant_patterns FOR ALL USING (
  entity_id IS NULL  -- patrón global de VICTOR, visible para todos los usuarios autenticados
  OR EXISTS (SELECT 1 FROM business_entities be WHERE be.id = merchant_patterns.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE fiscal_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_params_access ON fiscal_params FOR ALL USING (
  owner_id IS NULL  -- parámetro global de VICTOR (ej. tasa de IVU estatal)
  OR owner_id = auth.uid()
);

ALTER TABLE ivu_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY ivu_tracker_access ON ivu_tracker FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_tracker.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE ivu_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY ivu_reconciliation_access ON ivu_reconciliation FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_reconciliation.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE retenciones_hacienda ENABLE ROW LEVEL SECURITY;
CREATE POLICY retenciones_hacienda_access ON retenciones_hacienda FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = retenciones_hacienda.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE estimated_tax_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY estimated_tax_payments_access ON estimated_tax_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = estimated_tax_payments.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_access ON journal_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = journal_entries.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_access ON audit_log FOR ALL USING (
  entity_id IS NOT NULL AND EXISTS (SELECT 1 FROM business_entities be WHERE be.id = audit_log.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

-- ============================================================================
-- FIN. Ahora las 27 tablas tienen RLS activado con una política. Próximo
-- paso sugerido: llenar hacienda_categories con las categorías reales de PR
-- (LUMA=Electricidad, AAA=Agua, etc.) — eso alimenta el motor de
-- categorización desde el día 1.
-- ============================================================================
