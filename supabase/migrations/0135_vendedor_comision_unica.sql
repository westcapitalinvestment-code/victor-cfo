-- ============================================================================
-- VICTOR CFO — 0135: Comisión de vendedor por ciclo — mensual sigue 70/30,
-- anual pasa a pago único de 20% — 2 oct 2026
-- ============================================================================
-- Decisión de Joel (2 oct 2026): "no quiero ya mes gratis, ninguna compañía
-- da mes gratis — que entren al link del vendedor y compren como cualquiera
-- con 7 días de prueba y se le pague al vendedor tan pronto cojamos el
-- pago" — y después, al proponerle pago único también para mensual: "no,
-- se mantiene el 70/30 pq me deja cashflow para operar" (retener el 30%
-- hasta el 3er pago real le da colchón si el cliente cancela temprano).
-- Modelo final, solo para socios tipo='vendedor', solo planes Pro/Business:
--   - Cliente MENSUAL (modelo 'setenta_treinta'): igual que la 0107 — 70%
--     del precio mensual al primer pago real (monto FIJO desde ese
--     momento), + el 30% restante SOLO si el cliente llega vivo a su 3er
--     pago real. Si cancela antes, el 30% nunca se paga (ver case
--     "customer.subscription.deleted" en app/api/stripe/webhook/route.ts).
--   - Cliente ANUAL (modelo 'unico'): el vendedor cobra el 20% del pago
--     anual completo, una sola vez, en cuanto se cobra esa factura real —
--     nada queda pendiente después (un anual ya es su propio colchón: si
--     cancela, no vuelve a cobrar hasta el año siguiente).
--   - Ya no hay trial de 30 días ("mes gratis") para el referido de un
--     vendedor específicamente — ver app/api/stripe/checkout/route.ts.
--
-- La columna `modelo` distingue cuál mecánica aplica a cada fila de
-- socios_vendedor_clientes. No se borra ni se reescribe ninguna fila que ya
-- existiera antes de esta migración (todas nacieron bajo el 70/30 de la
-- 0107, así que se marcan 'setenta_treinta' explícitamente abajo — mismo
-- valor que ya tenían en la práctica, esto solo lo hace explícito).
-- ============================================================================

ALTER TABLE socios_vendedor_clientes
  ADD COLUMN IF NOT EXISTS modelo text NOT NULL DEFAULT 'setenta_treinta'
    CHECK (modelo IN ('setenta_treinta', 'unico')),
  -- Monto base REAL que paga el cliente (centavos) — el precio mensual tal
  -- cual si ciclo='mensual', o el precio anual tal cual si ciclo='anual'.
  -- Bajo el modelo 'unico' (anual) la comisión del vendedor (setenta_centavos,
  -- reutilizada como "monto pagado" — ver webhook) ya NO es igual a este
  -- monto (es solo el 20%), así que el panel del founder necesita este
  -- campo aparte para seguir mostrando el ingreso REAL que el cliente le
  -- genera a WCV, no lo que cobró el vendedor.
  ADD COLUMN IF NOT EXISTS monto_base_centavos integer;

-- Backfill explícito (aunque el DEFAULT ya cubre este caso) — toda fila que
-- existía antes de esta migración nació bajo el 70/30 de la 0107.
UPDATE socios_vendedor_clientes SET modelo = 'setenta_treinta' WHERE monto_base_centavos IS NULL;

-- tipo_comision ahora también admite 'unica' (comisión única del modelo
-- anual) además de 'entrada'/'recurrente' (embajadores) y
-- 'setenta'/'treinta' (modelo mensual, sin cambios).
ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_tipo_comision_check,
  ADD CONSTRAINT socios_comisiones_tipo_comision_check
    CHECK (tipo_comision IN ('entrada', 'recurrente', 'setenta', 'treinta', 'unica'));
