-- ============================================================================
-- VICTOR CFO — 0085: evidencia (foto/PDF) por pago a contratista (12 sept
-- 2026, pedido de Joel: "seria bueno poner un boton de foto y upload por si
-- se necesitara poner una evidencia de la factura o lo que uno esta pagando
-- en pagos").
-- ============================================================================
-- Calcado 1:1 de invoice_attachments (migración 0001) + su API
-- /api/facturas/adjuntos/* — mismo patrón de "Evidencia del trabajo" que ya
-- existe en Facturación, aplicado ahora a una fila de vendor_retenciones (una
-- corrida de pago a un contratista específico). Sirve para guardar la
-- factura del contratista, el recibo, o cualquier comprobante de en qué se
-- gastó ese pago — separado de invoice_attachments porque el padre aquí es
-- vendor_retenciones, no invoices.
-- ============================================================================

CREATE TABLE vendor_retencion_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_retencion_id uuid NOT NULL REFERENCES vendor_retenciones(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL,
  tipo text,
  r2_key text NOT NULL,                  -- Cloudflare R2
  tamano_bytes integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX vendor_retencion_attachments_retencion_idx ON vendor_retencion_attachments (vendor_retencion_id);

ALTER TABLE vendor_retencion_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_retencion_attachments_owner ON vendor_retencion_attachments FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON vendor_retencion_attachments TO authenticated;
