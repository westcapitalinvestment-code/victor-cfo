-- ============================================================================
-- VICTOR CFO — 0084: manual de usuario — Vehículos/Peajes (Equipo) + aclarar
-- categoría Gasolina (11 sept 2026, pedido de Joel: "hay que añadirle
-- también a Victor lo que construimos nuevo en la parte de Equipo lo de la
-- categoria de gasolina y la de peaje para que sepa que existe y sepa lo
-- que tiene que hacer con eso si le preguntan").
--
-- Sigue el mismo patrón de la migración 0060 (manual_articulos): un
-- artículo más en la tabla de documentación de producto, consultado por
-- VICTOR con la herramienta consultar_manual cuando no está seguro del
-- flujo exacto. No toca schema.
--
-- Contenido de este artículo, en una sola entrada porque son dos cosas
-- relacionadas que hay que dejar bien separadas para VICTOR (root cause del
-- pedido: son dos sistemas totalmente independientes que suenan parecido —
-- "gasolina" y "peaje" — y VICTOR no debe mezclarlos si un usuario pregunta
-- por cualquiera de los dos):
--
-- 1. Peajes por placa (Equipo → pestaña Peajes, migración 0082, 10 sept
--    2026) — módulo NUEVO. El dueño registra sus vehículos por placa, sube
--    el PDF mensual de AutoExpreso, y VICTOR/el sistema extrae cada cruce
--    individual con su placa, monto, fecha y plaza. Vive fuera de
--    transactions/contabilidad a propósito — el banco solo ve el cobro
--    consolidado mensual de AutoExpreso, nunca el cruce por carro.
--
-- 2. "Transporte y gasolina" — categoría de Hacienda YA EXISTENTE desde la
--    migración 0011 (categorías/patrones semilla), NO es parte de este
--    módulo nuevo. Es una categoría normal del sistema de categorización de
--    transacciones — auto-categoriza compras de gasolina/transporte
--    (Uber, Lyft, Shell, Puma Energy, Total Petroleum, etc.) según el
--    nombre del comercio en el estado de cuenta bancario. Si un usuario
--    pregunta "¿dónde veo cuánto gasté en gasolina?" es esto — un reporte
--    por categoría en Transacciones/Reportes, nada que ver con peajes.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'equipo-vehiculos-peajes',
  'Equipo → Peajes — registro de vehículos y peajes de AutoExpreso por placa',
  'Cómo registrar vehículos y subir el estado de AutoExpreso para ver cuánto gastó cada carro en peajes. Distinto de la categoría de gasto "Transporte y gasolina". Plan Pro, requiere entidad de negocio.',
  $md$Peajes vive dentro de "Equipo" (menú del negocio, plan Pro/Pro+, requiere una entidad de negocio activa), en su propia pestaña "Peajes" — separado de Técnicos. Existe porque el banco (y por lo tanto Plaid) solo ve UN cobro mensual consolidado que AutoExpreso le hace a la cuenta, nunca el cruce individual de un carro específico. AutoExpreso sí desglosa cada cruce por placa en su propio estado de cuenta — ese PDF es la fuente real.

VEHÍCULOS: primero se registran los carros del negocio por placa (con un alias opcional, ej. "Van 3" o "Camión de Pedro"). Esto es solo un catálogo simple — no hace falta VIN, marca ni modelo, solo la placa que aparece en el PDF de AutoExpreso.

IMPORTAR PDF: se sube el estado de cuenta mensual de AutoExpreso (PDF) y el sistema lo extrae automáticamente vía IA (mismo patrón que la extracción de estados de cuenta bancarios) — cada fila se convierte en un "cruce": placa, fecha, hora, plaza, y monto. Si la placa extraída coincide con un vehículo ya registrado, el cruce se vincula solo a ese vehículo; si no coincide con ninguno (carro no registrado todavía, o error de lectura de la placa), el cruce queda "sin vehículo" — el dueño puede registrar el vehículo después y esos cruces sueltos se pueden revisar/reasignar.

REPORTE POR PLACA: la misma pestaña muestra el total de cruces y el monto gastado, filtrable por vehículo — así el dueño ve cuánto gastó en peajes un carro específico en un período, algo que el banco nunca le mostraría desglosado.

IMPORTANTE — esto NO es contabilidad ni categorización de gastos: los cruces de peaje NO se insertan en la tabla de transacciones ni afectan reportes de Hacienda/Gastos. Es un ledger aparte, solo para que el dueño sepa qué carro generó qué peaje. El cargo consolidado que sí aparece en el banco (y que sí se categoriza como gasto) sigue su flujo normal de categorización — sin desglose por carro.

NO CONFUNDIR CON "Transporte y gasolina": esa es una categoría de gasto normal del sistema de Hacienda (existe desde el inicio, no es parte de este módulo). Categoriza automáticamente compras de gasolina y viajes en Uber/Lyft (por nombre del comercio: SHELL, PUMA ENERGY, TOTAL PETROLEUM, UBER, LYFT, etc.) cuando aparecen en un estado de cuenta bancario conectado o subido. Si un usuario pregunta "¿cuánto gasté en gasolina este mes?", la respuesta está en Transacciones/Reportes filtrando por esa categoría — no en Peajes. Si pregunta "¿cuánto pagó en peaje la Van 3?", la respuesta está en Equipo → Peajes. Son dos sistemas independientes que no se cruzan entre sí.$md$
);
