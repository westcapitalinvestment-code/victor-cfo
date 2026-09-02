-- ============================================================================
-- VICTOR CFO — 0054: Admin/Secretaria — schema + RLS restringido de verdad
-- ============================================================================
-- Contexto (2 sept 2026, mockup de Joel): el tab "Admin" del nav de negocio
-- apuntaba a una ruta que en realidad era el Dashboard de Operaciones del
-- founder (se movió a /dashboard/cfo, ver bottom-nav.tsx). Este módulo es
-- el real: Joel invita a su secretaria/administrador con su propio login,
-- y por DISEÑO ve solo facturación — nunca finanzas personales ni el total
-- del negocio, a menos que Joel prenda un permiso adicional puntual.
--
-- HALLAZGO IMPORTANTE al investigar el schema existente: la migración 0003
-- ya había creado el rol 'admin' en account_members, pero con la intención
-- de "control total" (mismo nivel que el dueño) sobre CASI todo — incluida
-- la tabla `transactions` (gastos personales Y de negocio) y varias tablas
-- de impuestos/reconciliación. Eso es exactamente lo opuesto a lo que dice
-- el mockup nuevo ("nunca tus finanzas personales"). Como nunca se construyó
-- ningún flujo de invitación para role='admin' (0 filas existen hoy), es
-- seguro redefinir su alcance desde cero sin romper a nadie. Esta migración:
--   1) Restringe `transactions` y tablas de impuestos/reconciliación/vendors
--      — admin ya NO tiene acceso por defecto (antes tenía control total).
--   2) Dos excepciones quedan como LECTURA opcional, apagada por defecto,
--      prendida por Joel con un toggle: `transactions` (ver gastos del
--      negocio) y `retenciones_hacienda` (ver créditos en Hacienda) —
--      gateadas con la columna `permissions` (jsonb) de account_members.
--   3) `business_entities` pasa de control total a solo lectura para admin
--      (necesita leer el prefijo de factura/config de IVU/marca, pero
--      editar el perfil del negocio se queda como acción del dueño).
--   4) `services` (catálogo): lectura siempre (para armar líneas de
--      factura), pero cambiar precios requiere el toggle
--      'catalogo_precios'.
--   5) Cierra un hueco separado que no tenía que ver con admin: `services`,
--      `cotizaciones`, `cotizacion_items`, `cotizacion_attachments` y
--      `goals` se crearon en migraciones posteriores a la 0003 y nunca
--      recibieron el mismo tratamiento de "cpa = solo lectura" — hoy CUALQUIER
--      miembro activo (incluido un CPA de solo lectura) puede escribir ahí.
--      Se corrige aplicando el mismo patrón que el resto del schema.
--
-- Lo que NO se puede resolver limpio con RLS por tabla (y por qué): "Ver
-- total de ingresos del mes" y "Ver reportes de años anteriores" leen de
-- las MISMAS filas de `invoices`/`cotizaciones` que el admin ya necesita
-- ver para su trabajo base (facturas pendientes, cobros). No hay una
-- columna que separe "una factura suelta" de "el agregado del mes" a nivel
-- de fila — esos dos toggles se hacen cumplir en la capa de la app
-- (ocultar el tab Reportes / el resumen de ingresos si el toggle está
-- apagado), no en la base de datos. Es el mismo patrón que ya usa el resto
-- de VICTOR CFO para permisos de UI (ver nota de la migración 0003, PARTE 3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1 — Invitaciones de Admin/Secretaria (mismo patrón que cpa_invitations,
-- pero SIEMPRE con una entidad específica — a diferencia del CPA, el
-- admin/secretaria trabaja dentro de UN negocio, no "todas las entidades").
-- ----------------------------------------------------------------------------
CREATE TABLE admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  admin_name text,
  admin_email text NOT NULL,
  permissions jsonb DEFAULT '{}'::jsonb,  -- toggles elegidos ANTES de aceptar; se copian a account_members al aceptar
  invitation_token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'pending',          -- pending | accepted | expired
  sent_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_invitations_owner_write ON admin_invitations FOR ALL USING (
  owner_id = auth.uid()
);

CREATE INDEX idx_admin_invitations_owner ON admin_invitations(owner_id);
CREATE INDEX idx_admin_invitations_token ON admin_invitations(invitation_token);

-- ----------------------------------------------------------------------------
-- PARTE 2 — Addon Admin/Secretaria en `users` — cobro POR SEAT ($10/mes cada
-- uno), a diferencia del addon de Técnicos que es un precio plano hasta 3.
-- addon_admin_seats = cantidad de admins ACTIVOS ahora mismo — se usa para
-- mandar la cantidad correcta al subscription item de Stripe.
-- ----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_admin_status text DEFAULT 'inactivo'; -- inactivo | activo
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_admin_item_id text; -- id del subscription item en Stripe (cantidad = seats)
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_admin_seats integer DEFAULT 0;

-- ----------------------------------------------------------------------------
-- PARTE 3 — Restringir de verdad lo que un admin/secretaria puede ver.
-- Patrón para las tablas "opcionales" (transactions, retenciones_hacienda):
-- una sola política de SOLO LECTURA que exige tanto role='admin' como el
-- toggle correspondiente en accountmembers.permissions. Sin política de
-- escritura — un admin/secretaria nunca edita gastos ni créditos de Hacienda,
-- solo los ve si Joel se lo autoriza.
-- ----------------------------------------------------------------------------

-- transactions: admin pierde el control total que tenía; pasa a lectura
-- opcional detrás del toggle 'ver_gastos'.
DROP POLICY IF EXISTS transactions_owner_admin_write ON transactions;
CREATE POLICY transactions_owner_write ON transactions FOR ALL USING (
  owner_id = auth.uid()
);
CREATE POLICY transactions_admin_read_gastos ON transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true')
);
-- transactions_cpa_read (de la migración 0003) se queda igual, no se toca.

-- retenciones_hacienda: mismo patrón, detrás del toggle 'ver_creditos_hacienda'.
DROP POLICY IF EXISTS retenciones_hacienda_owner_admin_write ON retenciones_hacienda;
CREATE POLICY retenciones_hacienda_owner_write ON retenciones_hacienda FOR ALL USING (
  owner_id = auth.uid()
);
CREATE POLICY retenciones_hacienda_admin_read_creditos ON retenciones_hacienda FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = retenciones_hacienda.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_creditos_hacienda', 'false') = 'true')
);
-- retenciones_hacienda_cpa_read (0003) se queda igual.

-- business_entities: admin pasa de control total a SOLO LECTURA (necesita
-- leer prefijo de factura, IVU, marca — pero "Editar negocio" se queda
-- como acción exclusiva del dueño).
DROP POLICY IF EXISTS business_entities_owner_admin_write ON business_entities;
CREATE POLICY business_entities_owner_write ON business_entities FOR ALL USING (
  owner_id = auth.uid()
);
CREATE POLICY business_entities_admin_read ON business_entities FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = business_entities.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
-- business_entities_cpa_read (0003) se queda igual.

-- vendors: fuera del alcance de Admin/Secretaria por completo (eso es de
-- Pagos/contratistas — un admin no administra a quién le paga Joel).
DROP POLICY IF EXISTS vendors_owner_admin_write ON vendors;
CREATE POLICY vendors_owner_write ON vendors FOR ALL USING (
  owner_id = auth.uid()
);
-- vendors_cpa_read (0003) se queda igual.

-- vendor_retenciones, vendor_480_validation, ivu_tracker, ivu_reconciliation,
-- estimated_tax_payments, journal_entries, merchant_patterns: ninguna de
-- estas está en el alcance del mockup de Admin/Secretaria — se quitan del
-- todo (quedan owner-only + cpa_read, que ya existía y no se toca).
DROP POLICY IF EXISTS vendor_retenciones_owner_admin_write ON vendor_retenciones;
CREATE POLICY vendor_retenciones_owner_write ON vendor_retenciones FOR ALL USING (
  owner_id = auth.uid()
);

DROP POLICY IF EXISTS vendor_480_validation_owner_admin_write ON vendor_480_validation;
CREATE POLICY vendor_480_validation_owner_write ON vendor_480_validation FOR ALL USING (
  EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_480_validation.vendor_id AND v.owner_id = auth.uid())
);

DROP POLICY IF EXISTS ivu_tracker_owner_admin_write ON ivu_tracker;
CREATE POLICY ivu_tracker_owner_write ON ivu_tracker FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_tracker.entity_id AND be.owner_id = auth.uid())
);

DROP POLICY IF EXISTS ivu_reconciliation_owner_admin_write ON ivu_reconciliation;
CREATE POLICY ivu_reconciliation_owner_write ON ivu_reconciliation FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = ivu_reconciliation.entity_id AND be.owner_id = auth.uid())
);

DROP POLICY IF EXISTS estimated_tax_payments_owner_admin_write ON estimated_tax_payments;
CREATE POLICY estimated_tax_payments_owner_write ON estimated_tax_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = estimated_tax_payments.entity_id AND be.owner_id = auth.uid())
);

DROP POLICY IF EXISTS journal_entries_owner_admin_write ON journal_entries;
CREATE POLICY journal_entries_owner_write ON journal_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM business_entities be WHERE be.id = journal_entries.entity_id AND be.owner_id = auth.uid())
);

DROP POLICY IF EXISTS merchant_patterns_owner_admin_write ON merchant_patterns;
CREATE POLICY merchant_patterns_owner_write ON merchant_patterns FOR ALL USING (
  entity_id IS NULL
  OR EXISTS (SELECT 1 FROM business_entities be WHERE be.id = merchant_patterns.entity_id AND be.owner_id = auth.uid())
);

-- goals (Metas): igual, fuera del alcance de Admin/Secretaria. La política
-- original (migración 0007) ni siquiera filtraba por rol — CUALQUIER
-- miembro activo (hasta un CPA de solo lectura) podía escribir metas. Se
-- corrige a owner-only, y se añade cpa_read consistente con el resto del
-- schema (un CPA sí puede querer ver metas de negocio para planificación
-- fiscal, pero nunca escribir).
DROP POLICY IF EXISTS goals_access ON goals;
CREATE POLICY goals_owner_write ON goals FOR ALL USING (
  owner_id = auth.uid()
);
CREATE POLICY goals_cpa_read ON goals FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = goals.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- ----------------------------------------------------------------------------
-- PARTE 4 — Cerrar el hueco de tablas post-0003 que nunca separaron
-- admin/cpa (services, cotizaciones, cotizacion_items, cotizacion_attachments).
-- Estas SÍ están en el alcance base de Admin/Secretaria (facturar/cotizar),
-- excepto que cambiar PRECIOS del catálogo requiere el toggle
-- 'catalogo_precios' — el admin puede LEER el catálogo siempre (para armar
-- líneas de factura) pero no tocar precios sin permiso.
-- ----------------------------------------------------------------------------

-- services
DROP POLICY IF EXISTS services_access ON services;
CREATE POLICY services_owner_write ON services FOR ALL USING (
  owner_id = auth.uid()
);
CREATE POLICY services_admin_read ON services FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = services.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY services_admin_write_precios ON services FOR ALL USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = services.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'catalogo_precios', 'false') = 'true')
);
CREATE POLICY services_cpa_read ON services FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = services.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- cotizaciones (base: el admin/secretaria SÍ puede cotizar/facturar)
DROP POLICY IF EXISTS cotizaciones_access ON cotizaciones;
CREATE POLICY cotizaciones_owner_admin_write ON cotizaciones FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizaciones.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY cotizaciones_cpa_read ON cotizaciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizaciones.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- cotizacion_items (acceso indirecto vía cotizaciones, mismo patrón que invoice_items)
DROP POLICY IF EXISTS cotizacion_items_access ON cotizacion_items;
CREATE POLICY cotizacion_items_owner_admin_write ON cotizacion_items FOR ALL USING (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id AND (
    c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = c.owner_id
               AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
  ))
);
CREATE POLICY cotizacion_items_cpa_read ON cotizacion_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_items.cotizacion_id AND
    EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = c.owner_id
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
  )
);

-- cotizacion_attachments
DROP POLICY IF EXISTS cotizacion_attachments_access ON cotizacion_attachments;
CREATE POLICY cotizacion_attachments_owner_admin_write ON cotizacion_attachments FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizacion_attachments.owner_id
             AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin')
);
CREATE POLICY cotizacion_attachments_cpa_read ON cotizacion_attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizacion_attachments.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- ============================================================================
-- RESUMEN de lo que un Admin/Secretaria puede hacer después de esta migración:
--   SIEMPRE: clients (0003, sin cambio), invoices/invoice_items/invoice_
--     attachments (0003, sin cambio), cotizaciones/cotizacion_items/
--     cotizacion_attachments (PARTE 4), leer services y business_entities.
--   NUNCA (a menos que Joel lo invite como CPA, un rol distinto): vendors,
--     vendor_retenciones, vendor_480_validation, ivu_tracker,
--     ivu_reconciliation, estimated_tax_payments, journal_entries,
--     merchant_patterns, goals, editar business_entities, editar precios de
--     services.
--   OPCIONAL (toggle en account_members.permissions, apagado por defecto):
--     transactions ('ver_gastos'), retenciones_hacienda
--     ('ver_creditos_hacienda'), precios del catálogo ('catalogo_precios').
--     'ver_ingresos_mes' y 'ver_reportes_historicos' se hacen cumplir en la
--     app (ocultan el tab/resumen), no en RLS — ver nota al inicio.
-- ============================================================================
