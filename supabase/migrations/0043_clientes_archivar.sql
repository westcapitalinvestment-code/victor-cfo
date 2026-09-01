-- Archivar clientes (1 sept 2026) — Joel pidió poder editar/eliminar
-- clientes que "ya no son clientes". Un DELETE de verdad es riesgoso:
-- invoices.client_id y cotizaciones.client_id son ON DELETE SET NULL
-- (ver 0001/0033), así que borrar un cliente con historial le arranca el
-- nombre a sus facturas/cotizaciones pasadas — rompe el reporte de
-- "Ingresos por cliente" y cualquier CSV/PDF que el contador ya tenga.
--
-- En su lugar: un booleano "active" para archivar (se esconde de la lista
-- y de los selectores de "Nueva factura"/"Nueva cotización", pero el
-- historial que ya existe sigue intacto). El DELETE real de verdad solo
-- se ofrece en la pantalla cuando el cliente no tiene NINGUNA factura ni
-- cotización asociada — ahí sí es seguro borrarlo sin perder nada.
alter table clients
  add column if not exists active boolean not null default true;
