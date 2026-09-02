-- 0040_descripcion_servicios.sql (1 sept 2026)
-- FreshBooks (y la mayoría de facturadores) muestran cada línea con dos
-- textos: un nombre en negrita (ej. "AHA") y debajo una descripción más
-- pequeña (ej. "Annual evaluation"). Hasta ahora VICTOR solo tenía un
-- campo de texto por línea — este cambio añade el segundo campo opcional
-- en el catálogo de servicios y en las líneas de facturas/cotizaciones,
-- calcado del ejemplo real que mandó Joel (Invoice 0001540.pdf,
-- FreshBooks).

ALTER TABLE services ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS detalle text;
ALTER TABLE cotizacion_items ADD COLUMN IF NOT EXISTS detalle text;
