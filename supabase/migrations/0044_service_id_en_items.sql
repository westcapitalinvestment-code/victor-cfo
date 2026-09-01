-- Reportes confiables por producto/servicio (1 sept 2026) — Joel quiere
-- que "Ingresos por servicio" sea data real para tomar decisiones (qué se
-- vende más, etc.), y ahora mismo ese reporte agrupa por el TEXTO libre
-- de la línea (invoice_items.descripcion) — "Consulta inicial" y
-- "consulta Inicial" cuentan como dos productos distintos aunque sean el
-- mismo servicio del catálogo.
--
-- invoices.servicio_id ya existe (0034) y ayuda a nivel de factura, pero
-- cada línea individual (invoice_items/cotizacion_items) no guarda esa
-- referencia — y una cotización sí puede tener varias líneas de servicios
-- distintos. Este campo es la fuente de verdad real para agrupar reportes;
-- descripcion/precio_unitario se conservan igual (son el snapshot de lo
-- que se facturó, necesario aunque el precio del catálogo cambie después).
alter table invoice_items
  add column if not exists service_id uuid references services(id) on delete set null;

alter table cotizacion_items
  add column if not exists service_id uuid references services(id) on delete set null;
