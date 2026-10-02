-- VICTOR CFO — 0131: conciliación automática de depósitos bancarios con
-- facturas pendientes.
--
-- Pedido de Joel (2 oct 2026), tras ver que el pago de Stripe de la
-- factura INV-1120 se reconcilió solo: "se supone que sea así, no? si
-- hago una factura de $1,500 con el 6% de retención y al banco llega
-- $1,410 se supone que Victor cierre esa factura con pago y con el
-- método". Confirmado que sí — esto extiende lo que ya pasa con Stripe
-- (el webhook cierra la factura sola) al caso de depósitos bancarios
-- reales (ACH, cheque, transferencia) vistos a través de Plaid.
--
-- transaction_id: qué transacción bancaria exacta cerró esta factura —
-- deja un rastro auditable y evita que una misma transacción se use para
-- cerrar dos facturas por error.
-- pago_auto_conciliado: distingue "VICTOR lo cerró solo por matching de
-- monto" de "el dueño lo marcó pagado a mano" — para que la UI pueda
-- mostrarlo distinto (ej. un badge "Conciliado automáticamente") y para
-- que Joel pueda auditar qué cerró el sistema sin supervisión humana.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago_auto_conciliado boolean NOT NULL DEFAULT false;

-- Evita que la misma transacción bancaria se use dos veces para cerrar
-- dos facturas distintas (defensa adicional a la lógica de aplicación,
-- que ya solo cierra con match único y sin ambigüedad).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_transaction_id_unico
  ON invoices (transaction_id)
  WHERE transaction_id IS NOT NULL;

COMMENT ON COLUMN invoices.transaction_id IS
  'Transacción bancaria (transactions.id) que cerró esta factura — vía conciliación automática o registrada a mano enlazando el depósito.';
COMMENT ON COLUMN invoices.pago_auto_conciliado IS
  'true = VICTOR encontró el match de monto+fecha+entidad solo (sin que el dueño tocara nada) y cerró la factura. false = se marcó pagada a mano (Registrar pago, VICTOR por chat, o el webhook de Stripe).';
