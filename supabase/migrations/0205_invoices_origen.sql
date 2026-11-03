-- ============================================================================
-- VICTOR CFO — 0205: invoices.origen (3 nov 2026, pedido de Joel)
-- Canal por el que llegó una venta, para la pestaña Estadísticas. Se llena
-- SOLO: Shopify (red social / buscador / directo según los datos de la orden)
-- y la API v1/Zapier (campo opcional "origen"). Nada se escribe a mano.
-- Solo agrega una columna nullable; idempotente.
-- ============================================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS origen text;
UPDATE invoices SET origen = 'Shopify' WHERE origen IS NULL AND shopify_order_id IS NOT NULL;
