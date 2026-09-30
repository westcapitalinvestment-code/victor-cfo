-- Importador de pagos históricos a contratistas (30 sept 2026, pedido de
-- Joel: un contratista que llega a mitad de año con data de otro sistema no
-- debería tener que esperar a enero para que el 480.6SP le funcione).
-- Mismo patrón que invoices.import_batch_id (migración 0074) — cada corrida
-- de /api/pagos/csv/importar marca sus filas con el mismo batch id, para
-- poder verlas agrupadas y borrar un archivo equivocado de un solo golpe.
alter table vendor_retenciones
  add column if not exists import_batch_id uuid;

create index if not exists idx_vendor_retenciones_import_batch
  on vendor_retenciones (import_batch_id)
  where import_batch_id is not null;
