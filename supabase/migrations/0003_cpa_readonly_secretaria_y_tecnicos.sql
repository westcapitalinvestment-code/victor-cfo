-- ============================================================================
-- VICTOR CFO — 0003: CPA de solo lectura, cierre de hueco en account_members,
-- y tablas de Equipo/Técnicos (que faltaron en 0001_schema_completo.sql).
-- ============================================================================
-- CONTEXTO: al revisar 0001 para contestar la pregunta de Joel sobre qué
-- cubre el schema, salieron 3 problemas:
--
--   1) SEGURIDAD (el importante): todas las políticas RLS usaban
--      "FOR ALL USING (... EXISTS (... account_members ...))" sin filtrar por
--      am.role. Eso significa que un CPA invitado (role='cpa') tiene HOY
--      permiso para escribir/borrar en clients, invoices, transactions, etc.
--      — no solo leer. Contradice el diseño (CPA = solo lectura). Se corrige
--      separando cada política en dos: dueño+admin (FOR ALL) y cpa (FOR
--      SELECT únicamente).
--
--   2) BUG DE ESCALACIÓN: la política de account_members permitía que
--      cualquier member (admin o cpa) hiciera UPDATE/DELETE sobre SU PROPIA
--      fila en account_members, porque el USING no distinguía dueño de
--      member. En teoría un CPA podría hacer
--      UPDATE account_members SET role='admin' WHERE member_email=<su email>
--      y auto-promoverse. Se corrige: solo el dueño puede escribir en
--      account_members; el member solo puede LEER su propia fila (para saber
--      su rol al entrar).
--
--   3) FALTABA: las tablas de Equipo/Técnicos (el flujo "técnico visita
--      cliente → cobra servicios → factura" que ya está en el HTML/PWA de
--      VICTOR pero nunca se escribió en el schema). Se añaden aquí:
--      technicians, technician_service_catalog, technician_visits,
--      technician_visit_items.
--
-- NOTA IMPORTANTE sobre técnicos: el técnico NO inicia sesión con Supabase
-- Auth (usa un link + PIN de 4 dígitos: victorcfo.com/tecnico?t=...). Por lo
-- tanto auth.uid() va a ser NULL cuando el técnico usa la app — RLS normal no
-- lo cubre. El acceso del técnico debe pasar SIEMPRE por una ruta de API en
-- el backend (Next.js) que valide el PIN contra pin_hash y el token, y que
-- use la Service Role Key (que salta RLS) para leer/escribir en nombre del
-- técnico. Las políticas de abajo son para que EL DUEÑO/ADMIN vean y
-- administren técnicos desde el dashboard — no dan acceso al técnico mismo.
-- Eso todavía falta construir en la API (fuera del alcance de una migración
-- SQL).
--
-- CÓMO CORRERLO: igual que las anteriores — pega este archivo completo en el
-- SQL Editor de Supabase y dale Run una sola vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1 — account_members: cerrar el hueco de auto-escalación
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS account_members_access ON account_members;

-- Solo el dueño administra (crea/edita/borra) sus propios account_members.
CREATE POLICY account_members_owner_write ON account_members FOR ALL USING (
  owner_id = auth.uid()
);

-- El member (admin o cpa) solo puede LEER su propia fila — para saber su rol
-- y permisos al entrar. No puede modificarla.
CREATE POLICY account_members_self_read ON account_members FOR SELECT USING (
  member_email = auth.email()
);

-- ----------------------------------------------------------------------------
-- PARTE 2 — CPA de solo lectura en el resto de las tablas.
-- Patrón: se elimina la política "FOR ALL" que no distinguía rol, y se
-- reemplaza por dos: dueño+admin (control total) y cpa (solo SELECT).
-- ----------------------------------------------------------------------------

-- business_entities
DROP POLICY IF EXISTS business_entities_access ON business_entities;
CREATE POLICY business_entities_owner_admin_write ON business_entities FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = business_entities.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY business_entities_cpa_read ON business_entities FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = business_entities.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- clients
DROP POLICY IF EXISTS clients_access ON clients;
CREATE POLICY clients_owner_admin_write ON clients FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = clients.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY clients_cpa_read ON clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = clients.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- vendors
DROP POLICY IF EXISTS vendors_access ON vendors;
CREATE POLICY vendors_owner_admin_write ON vendors FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendors.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY vendors_cpa_read ON vendors FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendors.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- invoices
DROP POLICY IF EXISTS invoices_access ON invoices;
CREATE POLICY invoices_owner_admin_write ON invoices FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoices.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY invoices_cpa_read ON invoices FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoices.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- transactions
DROP POLICY IF EXISTS transactions_access ON transactions;
CREATE POLICY transactions_owner_admin_write ON transactions FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY transactions_cpa_read ON transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- invoice_attachments
DROP POLICY IF EXISTS invoice_attachments_access ON invoice_attachments;
CREATE POLICY invoice_attachments_owner_admin_write ON invoice_attachments FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoice_attachments.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY invoice_attachments_cpa_read ON invoice_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = invoice_attachments.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- vendor_retenciones
DROP POLICY IF EXISTS vendor_retenciones_access ON vendor_retenciones;
CREATE POLICY vendor_retenciones_owner_admin_write ON vendor_retenciones FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendor_retenciones.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY vendor_retenciones_cpa_read ON vendor_retenciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendor_retenciones.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- retenciones_hacienda
DROP POLICY IF EXISTS retenciones_hacienda_access ON retenciones_hacienda;
CREATE POLICY retenciones_hacienda_owner_admin_write ON retenciones_hacienda FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = retenciones_hacienda.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY retenciones_hacienda_cpa_read ON retenciones_hacienda FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = retenciones_hacienda.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- invoice_items (acceso indirecto vía invoices)
DROP POLICY IF EXISTS invoice_items_access ON invoice_items;
CREATE POLICY invoice_items_owner_admin_write ON invoice_items FOR ALL USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND (
    i.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = i.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY invoice_items_cpa_read ON invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = i.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- vendor_480_validation (acceso indirecto vía vendors)
DROP POLICY IF EXISTS vendor_480_validation_access ON vendor_480_validation;
CREATE POLICY vendor_480_validation_owner_admin_write ON vendor_480_validation FOR ALL USING (
  EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_480_validation.vendor_id AND (
    v.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = v.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY vendor_480_validation_cpa_read ON vendor_480_validation FOR SELECT USING (
  EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_480_validation.vendor_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = v.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- merchant_patterns (entity_id null = patrón global, se queda igual para todos)
DROP POLICY IF EXISTS merchant_patterns_access ON merchant_patterns;
CREATE POLICY merchant_patterns_owner_admin_write ON merchant_patterns FOR ALL USING (
  entity_id IS NULL
  OR EXISTS (SELECT 1 FROM business_entities be WHERE be.id = merchant_patterns.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY merchant_patterns_cpa_read ON merchant_patterns FOR SELECT USING (
  entity_id IS NULL
  OR EXISTS (SELECT 1 FROM business_entities be WHERE be.id = merchant_patterns.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- ivu_tracker
DROP POLICY IF EXISTS ivu_tracker_access ON ivu_tracker;
CREATE POLICY ivu_tracker_owner_admin_write ON ivu_tracker FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_tracker.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY ivu_tracker_cpa_read ON ivu_tracker FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_tracker.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- ivu_reconciliation
DROP POLICY IF EXISTS ivu_reconciliation_access ON ivu_reconciliation;
CREATE POLICY ivu_reconciliation_owner_admin_write ON ivu_reconciliation FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_reconciliation.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY ivu_reconciliation_cpa_read ON ivu_reconciliation FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_reconciliation.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- estimated_tax_payments
DROP POLICY IF EXISTS estimated_tax_payments_access ON estimated_tax_payments;
CREATE POLICY estimated_tax_payments_owner_admin_write ON estimated_tax_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = estimated_tax_payments.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY estimated_tax_payments_cpa_read ON estimated_tax_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = estimated_tax_payments.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- journal_entries
DROP POLICY IF EXISTS journal_entries_access ON journal_entries;
CREATE POLICY journal_entries_owner_admin_write ON journal_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = journal_entries.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY journal_entries_cpa_read ON journal_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = journal_entries.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- audit_log (queda de solo lectura para TODOS los miembros, incluido admin —
-- una bitácora de auditoría no se debe poder editar/borrar desde el cliente,
-- solo el sistema debe escribir ahí vía funciones con SECURITY DEFINER).
DROP POLICY IF EXISTS audit_log_access ON audit_log;
CREATE POLICY audit_log_owner_read ON audit_log FOR SELECT USING (
  entity_id IS NOT NULL AND EXISTS (SELECT 1 FROM business_entities be WHERE be.id = audit_log.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true)
  ))
);

-- ----------------------------------------------------------------------------
-- PARTE 3 — Permisos granulares de secretaria/admin: qué SÍ quedó y qué NO.
-- ----------------------------------------------------------------------------
-- Lo de arriba resuelve el nivel de ROL (admin = control total, cpa = solo
-- lectura). Lo que account_members.permissions (jsonb) promete — toggles
-- específicos tipo "esta secretaria puede ver nómina pero no nóminas de
-- otros empleados", o "puede registrar cobros pero no editar facturas ya
-- enviadas" — es más granular de lo que RLS puede expresar limpiamente por
-- tabla sin añadir muchas más columnas/políticas. Eso se queda pendiente y
-- se debe enforced en la capa de la app (Next.js: cada página/acción
-- revisando el jsonb permissions antes de mostrar el botón o llamar la
-- función), no solo en la base de datos. Anotado para no repetir el error de
-- antes de decir "ya está" cuando está a medias.

-- ============================================================================
-- PARTE 4 — Equipo / Técnicos (no existía en 0001)
-- ============================================================================

-- gen_random_bytes() (para el access_token del técnico) necesita pgcrypto —
-- gen_random_uuid() ya funciona sin esto porque es nativo desde PG13, pero
-- gen_random_bytes() no. Se activa por si no estaba ya habilitada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  pin_hash text NOT NULL,                 -- hash del PIN de 4 dígitos, NUNCA texto plano
  access_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'), -- victorcfo.com/tecnico?t=...
  approval_mode text DEFAULT 'auto',      -- auto | manual (revisión antes de cobrar/enviar)
  max_discount_pct numeric DEFAULT 0,     -- tope de descuento que el técnico puede aplicar
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE technician_service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre text NOT NULL,                   -- ej. "Instalación AC 2 ton"
  descripcion text,
  precio numeric NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE technician_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_name_raw text,                   -- captura rápida si el cliente aún no existe en `clients`
  estado text DEFAULT 'en_progreso',      -- en_progreso | requiere_aprobacion | pendiente_cobro | cobrado | enviado
  total numeric DEFAULT 0,
  metodo_cobro text,                      -- ATH Móvil | Cheque | Transferencia | Efectivo | Stripe
  monto_cobrado numeric,
  cobrado_at timestamptz,
  requiere_aprobacion boolean DEFAULT false,
  aprobado_by uuid REFERENCES users(id),
  aprobado_at timestamptz,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL, -- una vez se convierte en factura formal
  created_at timestamptz DEFAULT now()
);

CREATE TABLE technician_visit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES technician_visits(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES technician_service_catalog(id),
  descripcion text NOT NULL,
  cantidad numeric DEFAULT 1,
  precio_unitario numeric NOT NULL,
  subtotal_linea numeric GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at timestamptz DEFAULT now()
);

-- RLS: esto es la vista del DUEÑO/ADMIN desde el dashboard (gestionar
-- técnicos, ver catálogo, ver visitas). El técnico en sí NO usa esta vía —
-- ver nota grande al inicio del archivo.

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY technicians_owner_admin_write ON technicians FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = technicians.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY technicians_cpa_read ON technicians FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = technicians.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

ALTER TABLE technician_service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY technician_service_catalog_owner_admin_write ON technician_service_catalog FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = technician_service_catalog.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY technician_service_catalog_cpa_read ON technician_service_catalog FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = technician_service_catalog.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

ALTER TABLE technician_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY technician_visits_owner_admin_write ON technician_visits FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = technician_visits.entity_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY technician_visits_cpa_read ON technician_visits FOR SELECT USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = technician_visits.entity_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

ALTER TABLE technician_visit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY technician_visit_items_owner_admin_write ON technician_visit_items FOR ALL USING (
  EXISTS (SELECT 1 FROM technician_visits tv
          JOIN business_entities be ON be.id = tv.entity_id
          WHERE tv.id = technician_visit_items.visit_id AND (
    be.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY technician_visit_items_cpa_read ON technician_visit_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM technician_visits tv
          JOIN business_entities be ON be.id = tv.entity_id
          WHERE tv.id = technician_visit_items.visit_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = be.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- ============================================================================
-- FIN 0003. Resumen de lo que quedó resuelto y lo que sigue pendiente:
--
-- RESUELTO:
--   - CPA ya no puede escribir/borrar en ninguna tabla — solo SELECT.
--   - account_members ya no se puede auto-editar (hueco de escalación cerrado).
--   - audit_log ya no se puede editar/borrar desde el cliente por nadie.
--   - Tablas de Equipo/Técnicos creadas con RLS (vista dueño/admin/cpa).
--
-- TODAVÍA PENDIENTE (no es SQL, es trabajo de app/backend):
--   - Ruta de API para que el técnico entre con PIN+token (no usa Supabase
--     Auth) y opere con la Service Role Key.
--   - Enforced de los toggles granulares de account_members.permissions
--     (ej. "secretaria ve X pero no Y") en el código de Next.js.
-- ============================================================================
