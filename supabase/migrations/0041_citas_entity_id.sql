-- Cuentas de negocio, fase 2 (1 sept 2026): Joel pidió que el Inicio de
-- cada entidad de negocio sea igual al de Personal "con sus citas y todo" —
-- pero `citas` (migración 0030) nació sin noción de entidad, como un solo
-- calendario personal. Con esta columna, una cita puede quedar asignada a
-- una entidad (entity_id) o quedarse en Personal (entity_id NULL, default),
-- mismo patrón que ya usan goals/documents/invoices/etc.
alter table citas
  add column if not exists entity_id uuid references business_entities(id) on delete set null;

create index if not exists citas_entity_idx on citas (entity_id);
