-- Recargo por mora automático (15 oct 2026): se suma al total de la factura
-- vencida (como FreshBooks) y el dueño lo puede quitar.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_mora_monto numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_mora_quitado boolean NOT NULL DEFAULT false;
