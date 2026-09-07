-- ============================================================================
-- VICTOR CFO — 0073: actualizar el manual con el importador de facturas
-- históricas (7 sept 2026). El artículo 'facturacion' (migración 0060) ya
-- mencionaba que los CLIENTES se pueden importar en lote desde CSV/Excel,
-- pero nunca se actualizó cuando se agregó el importador de FACTURAS
-- (/dashboard/facturacion/importar, 7 sept 2026) — sin este UPDATE,
-- consultar_manual le seguiría diciendo al usuario que esa función no
-- existe, cuando ya está construida.
-- ============================================================================

UPDATE manual_articulos
SET
  contenido = REPLACE(
    contenido,
    'CLIENTES: antes de facturar hace falta un cliente — nombre, email, teléfono, dirección, y si aplica, el % de retención que ese cliente te hace (6%, 10%, o relevo total). Se pueden importar en lote desde un CSV o Excel de FreshBooks. Un cliente se puede archivar (no aparece más en los selectores) sin perder su historial, y solo se puede eliminar si nunca tuvo facturas ni cotizaciones.',
    'CLIENTES: antes de facturar hace falta un cliente — nombre, email, teléfono, dirección, y si aplica, el % de retención que ese cliente te hace (6%, 10%, o relevo total). Se pueden importar en lote desde un CSV o Excel de FreshBooks. Un cliente se puede archivar (no aparece más en los selectores) sin perder su historial, y solo se puede eliminar si nunca tuvo facturas ni cotizaciones.

IMPORTAR FACTURAS HISTÓRICAS: botón "Importar CSV" arriba de la lista de facturas (pestaña Facturas). Es para subir de una vez todo lo que ya facturaste ANTES de empezar a usar VICTOR — sin esto, los reportes y análisis de VICTOR solo ven lo creado dentro de la app desde que la empezaste a usar. Se sube una hoja (Excel o CSV, de FreshBooks/QuickBooks o armada a mano) y se mapean las columnas — solo 3 son obligatorias: cliente, fecha de emisión y monto (subtotal). El resto (número de factura, fecha de vencimiento, % de retención, % de IVU, total ya calculado, estado, fecha de pago) es opcional. Si un cliente de la hoja no existe todavía, VICTOR lo crea solo. No duplica si subes el mismo archivo dos veces (compara cliente + número de factura).'
  ),
  updated_at = now()
WHERE slug = 'facturacion';
