-- Evidencia/documentos adjuntos a una cotización — calcado de
-- invoice_attachments (0001), para que Cotizaciones tenga la misma
-- función de subir fotos/documentos que ya tiene Facturas.
CREATE TABLE IF NOT EXISTS cotizacion_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid REFERENCES cotizaciones(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL,
  tipo text,
  r2_key text NOT NULL,
  tamano_bytes integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cotizacion_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cotizacion_attachments_access ON cotizacion_attachments FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = cotizacion_attachments.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);
