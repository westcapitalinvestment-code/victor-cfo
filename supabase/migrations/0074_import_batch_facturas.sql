-- ============================================================================
-- VICTOR CFO — 0074: import_batch_id en invoices (7 sept 2026)
-- Joel: "necesito otra herramienta para borrar un CSV por si subi un CSV
-- equivocado en facturas al importar" — subió un archivo y el importador
-- se comió una factura real (Caribbean Health Solution $228.00) porque la
-- vio como duplicada de otra ($3,572.00) del mismo cliente. Con esta
-- columna, cada corrida de /api/facturas/csv/importar marca todas las
-- facturas que crea con el mismo import_batch_id, para poder listarlas y
-- borrarlas juntas si el archivo subido era el equivocado.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_invoices_import_batch ON invoices(import_batch_id) WHERE import_batch_id IS NOT NULL;
