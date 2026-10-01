-- 1 oct 2026, #786 (pedido de Joel, "dale montalo todo junto" — combina el
-- resto del roadmap de integración POS con la pregunta sobre Clover/
-- Verifone y el desglose de IVU/propinas en restaurantes).
--
-- Investigado: Clover (Reporting → Sales Report / Taxes) y Verifone Central
-- (Reporting → Export CSV) dejan descargar un reporte de ventas directo
-- desde el dashboard del comerciante, sin necesidad de integrar su API —
-- mucho menos esfuerzo que la integración OAuth que se había evaluado
-- originalmente en #786. Joel no tiene todavía un archivo real de muestra
-- (hoy iba a preguntarle a un amigo que usa Clover), así que esta tabla y
-- el importador están diseñados para ser flexibles sobre el formato exacto
-- de columnas — reusan el mismo parser CSV genérico y el mismo endpoint de
-- preview que ya existen (lib/csv.ts, /api/cuentas-manuales/csv/preview),
-- no asumen nombres de columna fijos de Clover.
--
-- Punto crítico de diseño: las ventas de un POS de restaurante NO tienen
-- factura correspondiente en VICTOR (son ventas de mostrador, no facturas
-- a un cliente), y el depósito neto ya llega al banco como un solo lump-sum
-- que Plaid ya importa como transacción. Por eso esta tabla es una CAPA DE
-- DESGLOSE/RECONCILIACIÓN — no crea un ingreso nuevo ni se mete en
-- transactions — igual que invoices.propina_monto/ivu_estatal_monto/
-- ivu_municipal_monto desglosan sin alterar el total de la factura. Esto
-- evita duplicar el ingreso contra el feed de Plaid.
create table if not exists pos_batch_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references business_entities(id) on delete cascade,
  provider text not null default 'otro', -- 'clover' | 'verifone' | 'square' | 'otro'
  period_start date not null,
  period_end date not null,
  gross_sales numeric(10,2) not null default 0,
  ivu_monto_total numeric(10,2) not null default 0, -- tal cual viene del reporte (combinado, antes de separar)
  ivu_estatal_monto numeric(10,2) not null default 0, -- estimado: ver ivu_split_estimado
  ivu_municipal_monto numeric(10,2) not null default 0,
  ivu_split_estimado boolean not null default true, -- true si se calculó proporcional (el reporte no separaba estatal/municipal)
  tips_monto numeric(10,2) not null default 0,
  net_sales numeric(10,2) not null default 0, -- gross - ivu_monto_total - tips (lo que debería llegar al banco)
  nombre_archivo text,
  import_batch_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_batch_uploads_entity on pos_batch_uploads(entity_id, period_start);
create index if not exists idx_pos_batch_uploads_batch on pos_batch_uploads(import_batch_id);

comment on table pos_batch_uploads is
  'Desglose de reportes de ventas de POS (Clover/Verifone/Square, #786) subidos como CSV/Excel. Una fila por período/día del reporte. NO es un ingreso nuevo — es un desglose de gross/IVU/propinas/neto que complementa el depósito bancario que Plaid ya trae. Se usa en Reportes/Estado de Resultados/Hacienda para mostrar cifras reales de restaurante aunque el banco solo muestre el depósito neto.';
comment on column pos_batch_uploads.ivu_split_estimado is
  'true cuando el reporte del POS trae el IVU combinado y VICTOR lo separó proporcionalmente usando business_entities.ivu_rate_estatal/ivu_rate_municipal — false si el reporte ya traía las 2 columnas por separado (ej. reporte "Taxes" de Clover, si separa por tasa).';
