-- 0112_vendors_is_corporation.sql
-- 30 sept 2026 — Fase 1 de la corrección 480.6SP (Sección 1062.03).
--
-- El Modelo 480.6SP real (confirmado con el CPA de Joel y con un 480.6SP
-- real de su compañía) tiene 4 casillas, no 2 formularios separados como
-- asumía el código ("480.6A" / "480.6B"):
--   1. Individuos no sujetos a retención
--   2. Corporaciones/entidades pass-through no sujetas a retención
--   3. Individuos sujetos a retención
--   4. Corporaciones/entidades sujetas a retención
--
-- retention_type ya guarda sujeto/exento (lo que hoy se muestra como
-- "480.6B"/"480.6A"). Falta el segundo eje: si el contratista es individuo
-- o corporación/entidad. Con is_corporation + retention_type se puede
-- calcular la casilla real (1/2/3/4) en la relabeling de UI y en la
-- exportación de año fiscal (tareas #741 y #743).
alter table vendors
  add column if not exists is_corporation boolean not null default false;

comment on column vendors.is_corporation is
  'true = corporación/entidad pass-through (paga 480.6SP casilla 2 o 4); false = individuo (casilla 1 o 3). Junto con retention_type (sujeto/exento) determina la casilla real del Modelo 480.6SP.';
