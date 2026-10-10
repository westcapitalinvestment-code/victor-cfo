-- 10 oct 2026 (pedido de Joel): un cliente pagó 2 veces por error; Stripe
-- reembolsó 1 pago pero NO devuelve el fee de procesamiento del reembolsado.
-- Ese fee extra es un gasto real y deducible, pero no pertenece a ninguna
-- factura (el cobro duplicado no es una factura). Se guarda en la factura
-- que sí quedó pagada y se suma al "Gasto procesamiento de pagos".
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fee_adicional numeric(12,2) NOT NULL DEFAULT 0
  CHECK (fee_adicional >= 0);

COMMENT ON COLUMN invoices.fee_adicional IS
  'Fees de procesamiento no recuperables (ej. cobro duplicado reembolsado) asociados a esta factura. Se suman al fee normal.';
