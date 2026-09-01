-- 0035_facturas_recurrentes.sql (31 agosto 2026)
-- Facturas recurrentes ("¿Es recurrente?" del mockup). La factura original
-- (la que el usuario crea con es_recurrente=true) actúa como "plantilla":
-- un cron diario (/api/cron/facturas-recurrentes) la clona cuando llega
-- fecha_proxima_generacion, y avanza esa fecha según frecuencia_recurrente.
-- Las facturas clonadas quedan con factura_padre_id apuntando a la
-- plantilla y es_recurrente=false — no vuelven a generar hijas ellas
-- mismas, solo la plantilla original sigue el ciclo.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_recurrente boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS frecuencia_recurrente text;   -- semanal | quincenal | mensual
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fecha_proxima_generacion date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS factura_padre_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_recurrentes ON invoices(es_recurrente, fecha_proxima_generacion) WHERE es_recurrente = true;
