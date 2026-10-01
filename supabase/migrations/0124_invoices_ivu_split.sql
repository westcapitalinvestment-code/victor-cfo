-- 1 oct 2026, #782 (sesión con el Gem CPA): el IVU de PR no es un solo
-- pasivo — son DOS, a DOS entidades distintas: 10.5% estatal (se remite a
-- Hacienda vía SURI) y 1% municipal (se remite al municipio donde opera el
-- negocio, por separado, en su propio proceso). business_entities ya tenía
-- ivu_rate_estatal/ivu_rate_municipal separados (y municipio) desde el
-- inicio, pero al crear la factura los dos se sumaban en un solo ivu_pct/
-- ivu_monto combinado — el desglose se perdía justo en el momento de
-- guardar. Estas columnas nuevas guardan el monto real de cada pasivo en
-- la factura, para poder reportar "cuánto le debo a SURI" vs. "cuánto le
-- debo al municipio" por separado.
alter table invoices add column if not exists ivu_estatal_monto numeric(10,2) default 0;
alter table invoices add column if not exists ivu_municipal_monto numeric(10,2) default 0;

comment on column invoices.ivu_estatal_monto is
  'Porción del IVU de esta factura que corresponde al 10.5% estatal (se remite a Hacienda vía SURI). Parte de ivu_monto, no es un campo adicional al total.';
comment on column invoices.ivu_municipal_monto is
  'Porción del IVU de esta factura que corresponde al 1% municipal (se remite al municipio de business_entities.municipio, proceso separado de SURI). Parte de ivu_monto, no es un campo adicional al total.';

-- Bug encontrado durante esta sesión: el formulario de entidad muestra "1"
-- como default visual de IVU municipal, pero el default real de la columna
-- en la base de datos había quedado en 0 desde la migración original — una
-- entidad nueva creada sin tocar ese campo específico se queda sin el 1%
-- municipal configurado. Se corrige el default aquí; no afecta entidades
-- ya creadas (cada una guarda lo que el dueño configuró o dejó en blanco).
alter table business_entities alter column ivu_rate_municipal set default 1;
