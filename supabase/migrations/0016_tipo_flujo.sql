-- ============================================================================
-- VICTOR CFO — 0016: tipo_flujo (gasto | ingreso | transferencia) — arregla
-- el reporte contable que estaba mezclando ingresos, gastos, y pagos de
-- tarjeta de crédito como si todos fueran lo mismo.
-- ============================================================================
-- Bug real detectado en el CSV del 20 agosto 2026: cada pantalla (Gastos,
-- el export para el contable, VICTOR) decidía "gasto vs ingreso" mirando
-- SOLO si `amount` era positivo o negativo — sin saber de qué tipo de
-- cuenta viene. Eso está mal por dos razones:
--
-- 1. En una tarjeta de crédito el signo significa lo CONTRARIO que en un
--    checking: positivo = compra real (gasto de verdad), negativo = un
--    pago que reduce la deuda (NO es ingreso, es tu propio dinero moviéndose
--    de una cuenta tuya a otra).
-- 2. Pagar tu propia tarjeta desde el checking sale dos veces en los
--    reportes: una vez como "gasto" en el checking (por donde salió el
--    dinero) y otra vez como "ingreso" en la tarjeta (por donde entró el
--    abono) — cuando en realidad la compra original YA se contó como gasto
--    el día que se hizo con la tarjeta. Contar el pago también infla el
--    reporte con dinero que nunca fue gasto ni ingreso nuevo.
--
-- La solución: una columna nueva, calculada una sola vez por un trigger de
-- base de datos (no por cada pantalla por separado, para que nunca se
-- desincronicen) que sabe el tipo de cuenta real (plaid_accounts.type /
-- manual_accounts.type, mismo vocabulario en las dos: depository | credit |
-- loan | investment) y reconoce el patrón de texto de un pago de tarjeta
-- ("TELEPAGO", "PAYMENT...THANK YOU", "AUTOPAY", etc.).
--
-- A propósito NO se deriva de hacienda_category_id: la categoría puede
-- estar mal (ej. una transferencia ATH Móvil saliente categorizada por
-- error como "Ingresos y depósitos" solo por el texto de la descripción)
-- y aun así el total de gasto/ingreso tiene que cuadrar — tipo_flujo es la
-- fuente de verdad para los reportes de dinero, la categoría es solo para
-- organizar/mostrar.
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN tipo_flujo text NOT NULL DEFAULT 'gasto'
  CHECK (tipo_flujo IN ('gasto', 'ingreso', 'transferencia'));

COMMENT ON COLUMN transactions.tipo_flujo IS
  'gasto = dinero real que salió (cuenta un cargo de tarjeta o un débito de checking). ingreso = dinero real que entró (depósito, transferencia recibida). transferencia = movimiento entre cuentas propias del usuario (ej. pagar tu propia tarjeta de crédito desde el checking) — no es gasto ni ingreso nuevo, se excluye de los reportes de gasto/ingreso.';

-- Reemplaza trigger_auto_categorize para que, además de asignar categoría
-- (igual que antes, sin cambios en esa parte), también calcule tipo_flujo.
-- Corre en el mismo trigger BEFORE INSERT porque es el único punto que ve
-- TODAS las transacciones sin importar de cuál de los 4 caminos de
-- inserción vinieron (sync de Plaid, CSV, PDF, carga inicial de cuenta
-- manual) — así no hay que confiar en que cada ruta de la app se acuerde
-- de calcularlo bien por su cuenta.
CREATE OR REPLACE FUNCTION trigger_auto_categorize()
RETURNS trigger AS $$
DECLARE
  v_match RECORD;
  v_tipo_cuenta text;
  v_es_pago_tarjeta boolean;
BEGIN
  -- --- Categorización (idéntico a antes) ---
  SELECT * INTO v_match FROM match_category(NEW.description_raw, NEW.entity_id);

  IF v_match.pattern_id IS NOT NULL AND v_match.confidence >= 0.85 AND v_match.status = 'confirmed' THEN
    NEW.hacienda_category_id := v_match.hacienda_category_id;
    NEW.is_personal := v_match.is_personal;
    NEW.matched_pattern_id := v_match.pattern_id;
    NEW.category_overridden_by_user := false;
    UPDATE merchant_patterns SET usage_count = usage_count + 1, last_matched_at = now() WHERE id = v_match.pattern_id;
  END IF;

  -- --- tipo_flujo (nuevo) ---
  v_tipo_cuenta := NULL;
  IF NEW.plaid_account_id IS NOT NULL THEN
    SELECT type INTO v_tipo_cuenta FROM plaid_accounts WHERE plaid_account_id = NEW.plaid_account_id LIMIT 1;
  ELSIF NEW.manual_account_id IS NOT NULL THEN
    SELECT type INTO v_tipo_cuenta FROM manual_accounts WHERE id = NEW.manual_account_id LIMIT 1;
  END IF;

  -- Patrón de "esto es un pago de tarjeta/deuda", no un gasto nuevo — ojo,
  -- a propósito NO matchea "INTEREST CHARGED..." (eso sí es un gasto real,
  -- el interés que cobra el banco) porque ese texto no contiene ninguna de
  -- estas palabras.
  v_es_pago_tarjeta := NEW.description_raw ~* '(TELEPAGO|PAYMENT.{0,15}THANK|ONLINE PAYMENT|AUTOPAY|AUTO PAY|PAGO.{0,10}TARJETA|CARD PAYMENT|BALANCE TRANSFER)';

  IF v_tipo_cuenta IN ('credit', 'loan') THEN
    -- Tarjeta/préstamo: positivo = cargo real (gasto). Negativo = pago o
    -- crédito que reduce la deuda — transferencia, nunca ingreso.
    IF NEW.amount > 0 THEN
      NEW.tipo_flujo := 'gasto';
    ELSE
      NEW.tipo_flujo := 'transferencia';
    END IF;
  ELSE
    -- Checking/savings/otro: positivo = salió dinero (gasto), negativo =
    -- entró dinero (ingreso) — excepto si es un pago de tarjeta hecho desde
    -- aquí, que es transferencia (esa compra ya se contó del lado de la
    -- tarjeta cuando se hizo).
    IF v_es_pago_tarjeta AND NEW.amount > 0 THEN
      NEW.tipo_flujo := 'transferencia';
    ELSIF NEW.amount > 0 THEN
      NEW.tipo_flujo := 'gasto';
    ELSE
      NEW.tipo_flujo := 'ingreso';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe (trg_auto_categorize, BEFORE INSERT) y sigue
-- apuntando a la misma función — no hace falta recrearlo, solo se
-- reemplazó el cuerpo de trigger_auto_categorize() arriba.

-- --- Backfill: recalcula tipo_flujo para las transacciones que ya
-- existían antes de este trigger (el trigger BEFORE INSERT no las toca,
-- solo aplica a filas nuevas de aquí en adelante) ---
UPDATE transactions t
SET tipo_flujo = sub.tipo_flujo_calculado
FROM (
  SELECT
    tr.id,
    CASE
      WHEN COALESCE(pa.type, ma.type) IN ('credit', 'loan') THEN
        CASE WHEN tr.amount > 0 THEN 'gasto' ELSE 'transferencia' END
      ELSE
        CASE
          WHEN tr.description_raw ~* '(TELEPAGO|PAYMENT.{0,15}THANK|ONLINE PAYMENT|AUTOPAY|AUTO PAY|PAGO.{0,10}TARJETA|CARD PAYMENT|BALANCE TRANSFER)' AND tr.amount > 0 THEN 'transferencia'
          WHEN tr.amount > 0 THEN 'gasto'
          ELSE 'ingreso'
        END
    END AS tipo_flujo_calculado
  FROM transactions tr
  LEFT JOIN plaid_accounts pa ON pa.plaid_account_id = tr.plaid_account_id
  LEFT JOIN manual_accounts ma ON ma.id = tr.manual_account_id
) sub
WHERE t.id = sub.id;
