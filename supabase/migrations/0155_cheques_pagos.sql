-- Cheques impresos desde Pagos (15 oct 2026, pedido de Joel: "la secretaria
-- registra el pago y genera el cheque del talonario, todo cuadrado con las
-- retenciones en Victor", como hacía el contable de su hermano en QuickBooks).
--
-- Alcance: cheque + retenciones. El pago ya se registra como vendor_retenciones
-- (bruto, retención, neto); aquí solo se le asigna un número de cheque
-- consecutivo por entidad y se guarda lo impreso.
--
-- Dos modos de papel:
--  * preimpreso: el banco ya imprimió nombre, cuenta y MICR → VICTOR imprime
--    solo fecha, beneficiario, monto, memo y talonario.
--  * blanco: papel en blanco con tóner MICR → VICTOR imprime también el
--    encabezado y la línea MICR (si cheque_imprimir_micr = true).
-- La cuenta y el routing salen de la misma cuenta ACH de la entidad.

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS cheque_siguiente_numero integer NOT NULL DEFAULT 1001,
  ADD COLUMN IF NOT EXISTS cheque_modo text NOT NULL DEFAULT 'preimpreso',
  ADD COLUMN IF NOT EXISTS cheque_imprimir_micr boolean NOT NULL DEFAULT false;

ALTER TABLE business_entities
  DROP CONSTRAINT IF EXISTS business_entities_cheque_modo_chk;
ALTER TABLE business_entities
  ADD CONSTRAINT business_entities_cheque_modo_chk CHECK (cheque_modo IN ('preimpreso', 'blanco'));

ALTER TABLE vendor_retenciones
  ADD COLUMN IF NOT EXISTS cheque_numero integer,
  ADD COLUMN IF NOT EXISTS cheque_fecha date,
  ADD COLUMN IF NOT EXISTS cheque_memo text,
  ADD COLUMN IF NOT EXISTS cheque_anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cheque_impreso_at timestamptz;

-- Un número de cheque no se repite dentro de la misma entidad.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_retenciones_cheque_unico
  ON vendor_retenciones (entity_id, cheque_numero)
  WHERE cheque_numero IS NOT NULL;

COMMENT ON COLUMN business_entities.cheque_siguiente_numero IS 'Próximo número de cheque a asignar (consecutivo por entidad).';
COMMENT ON COLUMN business_entities.cheque_modo IS 'preimpreso (talonario del banco) | blanco (papel en blanco con tóner MICR).';
COMMENT ON COLUMN vendor_retenciones.cheque_numero IS 'Número del cheque emitido para este pago (NULL = pago sin cheque).';
