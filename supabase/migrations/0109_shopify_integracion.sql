-- ============================================================================
-- VICTOR CFO — 0109: Integración directa con Shopify (30 sept 2026, pedido
-- de Joel, decidido explícitamente vía preguntas de alcance):
--   - Sincroniza AMBAS cosas cuando una orden de Shopify se paga: crea el
--     Cliente y crea la Factura (ya marcada "pagada").
--   - Integración DIRECTA vía webhook propio — NO pasa por el conector de
--     Zapier (ese sigue existiendo para otros usos/apps).
--   - Usa el monto EXACTO que Shopify ya cobró (subtotal/tax/total propios
--     de Shopify), sin recalcular IVU/retención de VICTOR — la orden ya
--     salió cobrada con la lógica fiscal de la propia tienda.
--   - Dispara solo con órdenes PAGADAS (webhook topic orders/paid), nunca
--     con órdenes creadas sin pagar.
-- ============================================================================

-- Credenciales de conexión por entidad de negocio. shopify_shop_domain es
-- el identificador que llega en el header X-Shopify-Shop-Domain de cada
-- webhook — así el receptor público sabe a qué entidad de VICTOR pertenece
-- sin depender de sesión de usuario. access_token y webhook_secret se
-- guardan cifrados con encryptSecret() (lib/crypto.ts, mismo cifrado ya
-- usado para access_token de Plaid) — nunca en texto plano.
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS shopify_shop_domain text UNIQUE;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS shopify_access_token text;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS shopify_webhook_secret text;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS shopify_conectado boolean NOT NULL DEFAULT false;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS shopify_conectado_en timestamptz;

-- Dedup de cliente: una orden de Shopify siempre trae un customer.id de
-- Shopify — se usa para no crear un Cliente nuevo en VICTOR cada vez que la
-- misma persona compra otra vez. Único por dueño (un mismo shopify_customer_id
-- nunca debe crear 2 clientes distintos para el mismo owner).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shopify_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_shopify_customer_id_owner_idx
  ON clients (owner_id, shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

-- Idempotencia del webhook: Shopify reintenta el mismo evento si no responde
-- 200 a tiempo — sin esto, un reintento crearía una factura duplicada.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shopify_order_id text;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_shopify_order_id_owner_idx
  ON invoices (owner_id, shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
