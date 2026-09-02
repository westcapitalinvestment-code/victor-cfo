-- 0046_fecha_pago_facturas.sql (2 sept 2026)
-- Al marcar una factura "pagada" solo se guardaba el método de pago — la
-- fecha de pago mostrada en pantalla siempre era fecha_emision (cuándo se
-- emitió la factura, no cuándo llegó el dinero). Pedido de Joel: a veces la
-- factura sale el día 1 pero el cliente paga el día 2 (o más tarde), y el
-- reporte de "Flujo de cobro" debe reflejar el mes/día real del pago, no el
-- de emisión. fecha_pago queda nula para facturas ya pagadas antes de este
-- cambio (el código hace fallback a fecha_emision para esas).

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fecha_pago date;
