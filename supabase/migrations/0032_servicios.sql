-- 0032_servicios.sql (31 agosto 2026)
-- Catálogo de servicios — pestaña "Servicios" del portal de Facturación
-- (Pro). Permite guardar servicios recurrentes con precio fijo para armar
-- facturas y cotizaciones más rápido, calcado del mockup real
-- (VICTOR Pro — Producto Completo_FINAL.html, pestaña Servicios).

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'fijo',   -- fijo | hora | proyecto | recurrente
  precio numeric NOT NULL DEFAULT 0,
  ivu_exento boolean DEFAULT true,     -- casi todos los servicios profesionales en PR no aplican IVU
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Mismo patrón de acceso delegado que invoices/clients/vendors: el dueño
-- de la cuenta y cualquier miembro activo invitado vía account_members
-- (secretaria, administradora, CPA con acceso de lectura ya se filtra
-- aparte) pueden ver y administrar el catálogo.
CREATE POLICY services_access ON services FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = services.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

CREATE INDEX idx_services_owner ON services(owner_id);
CREATE INDEX idx_services_entity ON services(entity_id);
