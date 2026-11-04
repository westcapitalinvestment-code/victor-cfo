-- 4 nov 2026: portal en línea del contratista (como el portal del cliente de
-- facturación, migración 0157). El "password" es el portal_token del
-- contratista (UUID, 122 bits): página pública de solo lectura con lo que el
-- negocio le pagó en el año, lo retenido y su copia del Modelo 480.6SP.
-- El contratista también puede ENVIAR documentos (Certificado de Relevo,
-- Registro de Comerciante), pero NUNCA se aplican solos: quedan "pendiente"
-- hasta que el dueño los revisa, porque el relevo cambia el % de retención.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS portal_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_portal_token ON vendors (portal_token);

CREATE TABLE IF NOT EXISTS vendor_portal_subidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('relevo', 'registro_comerciante')),
  r2_key text NOT NULL,
  relevo_pct numeric(5,2),
  relevo_fecha_expiracion date,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicada', 'rechazada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz
);
CREATE INDEX IF NOT EXISTS vendor_portal_subidas_vendor_idx ON vendor_portal_subidas (vendor_id, estado);
CREATE INDEX IF NOT EXISTS vendor_portal_subidas_owner_idx ON vendor_portal_subidas (owner_id, estado);

ALTER TABLE vendor_portal_subidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_portal_subidas_owner ON vendor_portal_subidas;
CREATE POLICY vendor_portal_subidas_owner ON vendor_portal_subidas
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

COMMENT ON COLUMN vendors.portal_token IS 'Token privado del portal en línea del contratista (/portal-contratista/[token]).';
