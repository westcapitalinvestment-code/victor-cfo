-- 0033_cotizaciones.sql (31 agosto 2026)
-- Cotizaciones — pestaña "Cotizaciones" del portal de Facturación (Pro).
-- Estructura paralela a invoices/invoice_items (mismo patrón de columnas)
-- para que convertir una cotización aprobada en factura sea una simple
-- copia de filas. estado: enviada | aprobada | rechazada | convertida.
-- invoice_id queda null hasta que se convierte — ahí guarda el link a la
-- factura real que se creó.

CREATE TABLE cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  numero text NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  ivu_pct numeric DEFAULT 0,
  ivu_monto numeric DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  estado text DEFAULT 'enviada',        -- enviada | aprobada | rechazada | convertida
  fecha_emision date DEFAULT CURRENT_DATE,
  fecha_vencimiento date,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE cotizacion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  cantidad numeric DEFAULT 1,
  precio_unitario numeric NOT NULL,
  subtotal_linea numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizaciones_access ON cotizaciones FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizaciones.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizacion_items_access ON cotizacion_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM cotizaciones c
    WHERE c.id = cotizacion_items.cotizacion_id
    AND (c.owner_id = auth.uid()
         OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = c.owner_id
                    AND am.member_email = auth.email() AND am.active = true))
  )
);

CREATE INDEX idx_cotizaciones_owner ON cotizaciones(owner_id);
CREATE INDEX idx_cotizaciones_client ON cotizaciones(client_id);
CREATE INDEX idx_cotizacion_items_cotizacion ON cotizacion_items(cotizacion_id);
