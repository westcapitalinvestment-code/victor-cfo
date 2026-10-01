-- 30 sept 2026 — pedido de Joel a partir de la conversación con su "CPA
-- Custom Gem": hoy VICTOR calcula bien la retención (10% o 6% según el %
-- que el usuario le ponga a mano al contratista), pero nunca valida que el
-- 6% (o 0%) esté realmente respaldado por un Certificado de Relevo vigente
-- de SURI archivado — es el mismo hueco de cumplimiento que describe la
-- Sección 1062.03(g): sin el papel radicado en el expediente, la
-- obligación de retener el 10% completo se mantiene, pase lo que pase con
-- el % que el usuario escribió en pantalla.
--
-- Mismo patrón que business_entities.relevo_certificate_r2_key (migración
-- 0039 / app/api/entidades/relevo) pero por CONTRATISTA, no por entidad —
-- cada vendor puede tener su propio relevo con su propia fecha de
-- expiración.
alter table vendors
  add column if not exists relevo_r2_key text,
  add column if not exists relevo_pct numeric(5,2),
  add column if not exists relevo_fecha_expiracion date;

comment on column vendors.relevo_r2_key is
  'Key en R2 del PDF del Certificado de Relevo de Retención (SURI) de este contratista. NULL = no tiene relevo archivado, se le retiene 10% completo.';
comment on column vendors.relevo_pct is
  'Tasa de retención que autoriza el relevo archivado (6.00 = relevo parcial, 0.00 = relevo total). Solo tiene sentido si relevo_r2_key no es NULL.';
comment on column vendors.relevo_fecha_expiracion is
  'Fecha de expiración del Certificado de Relevo. Si ya pasó, el relevo ya no es válido aunque el PDF siga archivado — vuelve a aplicar el 10%.';
