-- Detección de duplicados manual↔Plaid (1 sept 2026) — caso real: un
-- usuario en plan Gratis sube CSV a mano y categoriza varios meses en una
-- cuenta manual; al subir a Core y conectar el banco de verdad por Plaid,
-- esas mismas transacciones le vuelven a llegar (Plaid no tiene forma de
-- saber que ya existían como fila manual) — se duplican en la lista Y en
-- el balance total, porque manual_accounts y plaid_accounts se suman sin
-- saber que representan la misma cuenta real.
--
-- Se usa un campo aparte (no una "categoría" — las categorías están
-- atadas a líneas de Hacienda/Anejo M, meter "Duplicadas" ahí ensuciaría
-- esos reportes) para poder excluir estas filas de Gastos/Resumen/Inicio/
-- CSV del contador sin tocar el sistema de categorización, y sin borrar
-- nada — el usuario puede revisar y "des-marcar" si el detector se
-- equivocó (ver /dashboard/gastos/duplicados).
alter table transactions
  add column if not exists es_duplicada boolean not null default false,
  add column if not exists duplicado_de_id uuid references transactions(id) on delete set null;

create index if not exists transactions_duplicada_idx on transactions (owner_id, es_duplicada) where es_duplicada = true;
