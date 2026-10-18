-- 0165_socios_fecha_pago.sql (18 oct 2026)
-- Fecha en que el founder programa el próximo pago al vendedor. La fija Joel
-- desde el panel de Ventas y el vendedor la ve en su resumen.
ALTER TABLE socios ADD COLUMN IF NOT EXISTS proxima_fecha_pago date;
