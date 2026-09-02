-- ============================================================================
-- VICTOR CFO — 0051: campo Depósito en Cotización y Factura (2 sept 2026,
-- pedido de Joel: "a veces los clientes pagan un depósito antes que le
-- comiencen el trabajo y luego se resta de la cantidad total de la
-- factura"). En cotizaciones es lo que se PIDE de antemano; en invoices es
-- lo que ya se RECIBIÓ — en ambos casos se resta del total al mostrar el
-- balance pendiente.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposito_monto numeric DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS deposito_monto numeric DEFAULT 0;
