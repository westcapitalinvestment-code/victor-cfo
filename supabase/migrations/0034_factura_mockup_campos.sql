-- 0034_factura_mockup_campos.sql (31 agosto 2026)
-- Alinea el formulario de "Nueva factura" con el mockup real
-- (VICTOR Pro — Producto Completo_FINAL.html): teléfono del cliente (para
-- poder enviar la factura por WhatsApp), métodos de cobro aceptados,
-- recargo por mora (informativo — no se suma solo al total todavía, eso
-- queda para una fase futura con un cron que lo aplique automáticamente),
-- y el servicio del catálogo que se usó para armar la factura.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS telefono text;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS metodos_cobro_aceptados text[] DEFAULT '{}';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_habilitado boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_tipo text;        -- fijo | porcentaje
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_monto numeric DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_dias_gracia integer DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES services(id) ON DELETE SET NULL;
