-- Cierra un hueco real en el manual consultable de VICTOR (14 sept 2026,
-- reportado por Joel): un usuario preguntó para qué son los botones "Foto"
-- y "Añadir" en el detalle de una factura, y VICTOR inventó que eran de la
-- Bóveda (que sí tiene esos mismos íconos, pero para documentos generales
-- del negocio, no evidencia por factura). Root cause: consultar_manual
-- busca primero por slug/titulo y si no hay match cae a un ILIKE de texto
-- libre sobre resumen/contenido — como el artículo "facturacion" nunca
-- mencionaba "foto"/"añadir"/"adjuntar", esa búsqueda de texto libre solo
-- encontraba "boveda" (que sí usa esas palabras) y VICTOR asumió mal.
--
-- Fix: añadir un párrafo real a "facturacion" describiendo la sección
-- "Evidencia del trabajo" (Foto = cámara, Añadir = selector de archivos,
-- adjunta a ESA factura/cotización, no a la Bóveda), y un párrafo
-- equivalente en "pagos" describiendo el ícono de clip para adjuntar la
-- factura del contratista en la Corrida de pago (feature del 12 sept
-- 2026, api /api/pagos/adjuntos/*). Ninguno de los dos existía en el
-- manual todavía.

UPDATE manual_articulos
SET contenido = REPLACE(
  contenido,
  'COTIZACIONES: mismo flujo',
  'EVIDENCIA DEL TRABAJO (botones Foto/Añadir): en el detalle de una factura o cotización hay una sección aparte llamada "Evidencia del trabajo". El botón 📷 Foto abre la cámara del celular directamente; el botón 📁 Añadir deja escoger uno o varios archivos ya guardados en el teléfono (fotos o PDF). Sirve para adjuntar evidencia del trabajo hecho (fotos del servicio, recibos, etc.) directamente a ESA factura o cotización específica. IMPORTANTE: esto NO es la Bóveda — la Bóveda es para documentos generales del negocio con fecha de vencimiento (licencias, pólizas); estos adjuntos viven pegados a la factura/cotización y cualquiera con acceso a ella los ve ahí mismo, sin fecha de vencimiento ni alertas.

COTIZACIONES: mismo flujo'
),
updated_at = now()
WHERE slug = 'facturacion';

UPDATE manual_articulos
SET contenido = REPLACE(
  contenido,
  'REPORTE TRIMESTRAL: pestaña Reportes',
  'ADJUNTAR FACTURA DEL CONTRATISTA: junto a cada contratista en la Corrida de pago hay un ícono de clip — tócalo para adjuntar la factura o comprobante que te dio el contratista por ese pago (foto o PDF). Se puede adjuntar al momento de armar la corrida o después, volviendo a entrar a esa corrida ya guardada. El número junto al clip muestra cuántos archivos ya tiene esa retención. Queda guardado junto a esa corrida de pago, para tu récord y el de tu CPA — tampoco tiene que ver con la Bóveda.

REPORTE TRIMESTRAL: pestaña Reportes'
),
updated_at = now()
WHERE slug = 'pagos';
