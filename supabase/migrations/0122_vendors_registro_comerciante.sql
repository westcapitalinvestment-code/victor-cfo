-- 1 oct 2026, pedido de Joel (#788, sesión con el Gem CPA): el Relevo (0116)
-- respalda el %, pero el Certificado de Registro de Comerciante es lo que
-- demuestra ante una auditoría de reclasificación (Depto. del Trabajo /
-- Hacienda) que ese contratista opera un negocio independiente legítimo —
-- no un "empleado disfrazado". Mismo patrón exacto que relevo_r2_key
-- (migración 0116): un solo archivo PDF por contratista, sin % ni fecha de
-- expiración (el Registro de Comerciante no vence como el Relevo).
alter table vendors
  add column if not exists registro_comerciante_r2_key text;

comment on column vendors.registro_comerciante_r2_key is
  'Key en R2 del PDF del Certificado de Registro de Comerciante de este contratista. Parte del expediente digital anti-reclasificación (junto con tax_id y Relevo) — NULL = no archivado.';
