-- ============================================================================
-- VICTOR CFO — 0135: Comisión de vendedor en pago ÚNICO — reemplaza el
-- modelo 70/30 de la migración 0107 — 2 oct 2026
-- ============================================================================
-- Decisión de Joel (2 oct 2026): "no quiero ya mes gratis, ninguna compañía
-- da mes gratis — que entren al link del vendedor y compren como cualquiera
-- con 7 días de prueba y se le pague al vendedor tan pronto cojamos el
-- pago". Nuevo modelo, solo para socios tipo='vendedor', solo planes
-- Pro/Business:
--   - Cliente MENSUAL: el vendedor cobra el 100% del pago de UN mes, una
--     sola vez, en cuanto se cobra la primera factura real (ya no hay
--     trial de 30 días para el referido de un vendedor — ver checkout).
--   - Cliente ANUAL: el vendedor cobra el 20% del pago anual, una sola
--     vez, en cuanto se cobra esa factura real (ya no 50%, decisión final
--     de Joel en la misma conversación: "vamos a dejar las anualidades en
--     20% no en 50%").
--   - Nada queda pendiente después de ese pago — no hay 30% restante, no
--     hay hito de 3 pagos ni cron de 3 meses (ese cron, 0107, sigue
--     existiendo solo para resolver clientes VIEJOS que quedaron a mitad
--     del modelo 70/30 antes de este cambio — ver comentario en
--     app/api/cron/liberar-comision-anual-vendedor/route.ts).
--
-- No se borra ni se reescribe NINGUNA fila vieja de socios_vendedor_clientes
-- (0107) — un vendedor que ya tenía clientes en pleno ciclo 70/30 sigue
-- resolviéndose por esa mecánica exactamente como estaba (el webhook y el
-- cron de la 0107 siguen intactos para esas filas). La columna `modelo`
-- distingue cuál mecánica aplica a cada fila; las filas que existían ANTES
-- de esta migración se marcan 'setenta_treinta' explícitamente abajo. Toda
-- fila NUEVA de aquí en adelante usa 'unico'.
-- ============================================================================

ALTER TABLE socios_vendedor_clientes
  ADD COLUMN IF NOT EXISTS modelo text NOT NULL DEFAULT 'unico'
    CHECK (modelo IN ('setenta_treinta', 'unico')),
  -- Monto base REAL que paga el cliente (centavos) — el precio mensual tal
  -- cual si ciclo='mensual', o el precio anual tal cual si ciclo='anual'.
  -- Bajo el modelo 'unico' la comisión del vendedor (setenta_centavos,
  -- reutilizada como "monto pagado" — ver webhook) ya NO es igual a este
  -- monto cuando el ciclo es anual (es solo el 20%), así que el panel del
  -- founder necesita este campo aparte para seguir mostrando el ingreso
  -- REAL que el cliente le genera a WCV, no lo que cobró el vendedor.
  ADD COLUMN IF NOT EXISTS monto_base_centavos integer;

-- Backfill: toda fila que ya existía antes de esta migración nació bajo el
-- modelo 70/30 de la 0107 — se marca explícitamente para que el webhook del
-- modelo viejo (pagos siguientes, cron de 3 meses, clawback al cancelar)
-- siga tratándolas igual que siempre.
UPDATE socios_vendedor_clientes SET modelo = 'setenta_treinta' WHERE monto_base_centavos IS NULL;

-- tipo_comision ahora también admite 'unica' (modelo nuevo) además de
-- 'entrada'/'recurrente' (embajadores) y 'setenta'/'treinta' (modelo viejo,
-- sigue vivo para los vendedores que ya estaban a mitad de ciclo).
ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_tipo_comision_check,
  ADD CONSTRAINT socios_comisiones_tipo_comision_check
    CHECK (tipo_comision IN ('entrada', 'recurrente', 'setenta', 'treinta', 'unica'));
