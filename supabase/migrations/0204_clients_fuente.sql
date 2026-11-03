-- ============================================================================
-- VICTOR CFO — 0204: clients.fuente (3 nov 2026, pedido de Joel)
-- Base de la pestaña "Estadísticas" del portal de Facturación. Joel pidió que
-- NADA haya que escribirlo a mano: la fuente se llena sola según por dónde
-- entró el cliente (tienda Shopify, API/Zapier, importación CSV, técnico).
-- Los clientes creados a mano quedan NULL ("Sin identificar"). Solo agrega
-- una columna nullable y rellena los de Shopify existentes; idempotente.
-- ============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fuente text;
UPDATE clients SET fuente = 'shopify' WHERE fuente IS NULL AND shopify_customer_id IS NOT NULL;
