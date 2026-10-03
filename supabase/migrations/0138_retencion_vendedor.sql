-- 3 oct 2026 — pedido de Joel al armar el lanzamiento del equipo de ventas
-- 100% comisión: hasta ahora el programa de socios (migración 0070/0107/
-- 0135) solo AVISABA cuando un vendedor pasaba los $500/año (ver el
-- comentario UMBRAL_DECLARAR_CENTAVOS en socios-panel.tsx) pero nunca
-- retenía de verdad, porque el pago es efectivo real por fuera de Stripe.
-- Joel quiere que, igual que a sus propios contratistas en el módulo de
-- Pagos, al vendedor también se le aplique la Sección 1062.03: 10% de
-- retención sobre el exceso de $500 acumulado en el año, o 6%/0% si tiene
-- un Certificado de Relevo de SURI vigente archivado.
--
-- Mismo patrón que vendors/vendor_retenciones (migración 0001) y el relevo
-- por contratista (migración 0116), pero del lado de socios — NO se
-- reusa vendor_retenciones directamente porque esa tabla vive en dólares y
-- cuelga de vendors (clientes de WCV pagándole a SUS contratistas), mientras
-- que las comisiones de vendedor viven en centavos y cuelgan de socios (WCV
-- pagándole a su propio equipo de ventas) — son dos relaciones distintas.

-- SSN/EIN del vendedor, necesario para declarar el Modelo 480.6SP a fin de
-- año (hasta ahora v1 explícitamente no lo pedía, ver comentario en
-- migración 0070 — eso cambia porque ahora sí hay retención real).
alter table socios
  add column if not exists tax_id text;

comment on column socios.tax_id is
  'SSN o EIN del vendedor/socio, para declarar el Modelo 480.6SP a fin de año una vez supera $500/año en comisiones.';

-- Certificado de Relevo por vendedor — mismo patrón exacto que
-- vendors.relevo_* (migración 0116). Sin relevo archivado = 10% completo.
alter table socios
  add column if not exists relevo_r2_key text,
  add column if not exists relevo_pct numeric(5,2),
  add column if not exists relevo_fecha_expiracion date;

comment on column socios.relevo_r2_key is
  'Key en R2 del PDF del Certificado de Relevo de Retención (SURI) de este vendedor. NULL = no tiene relevo archivado, se le retiene 10% completo.';
comment on column socios.relevo_pct is
  'Tasa de retención que autoriza el relevo archivado (6.00 = relevo parcial, 0.00 = relevo total). Solo tiene sentido si relevo_r2_key no es NULL.';
comment on column socios.relevo_fecha_expiracion is
  'Fecha de expiración del Certificado de Relevo. Si ya pasó, el relevo ya no es válido aunque el PDF siga archivado — vuelve a aplicar el 10%.';

-- Retención real por cada comisión pagada a un vendedor. Una fila por cada
-- fila de socios_comisiones que le pertenezca a un socio tipo='vendedor'
-- (entrada 'setenta'/'treinta'/'unica') — nace en el mismo momento que la
-- comisión, calculada con retención MARGINAL sobre el acumulado del año
-- (idéntico algoritmo a retencionMarginal() en pagos-portal.tsx), así que
-- los primeros $500 acumulados en el año no retienen nada.
create table if not exists socios_vendedor_retenciones (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references socios(id) on delete cascade,
  comision_id uuid references socios_comisiones(id) on delete set null,
  anio integer not null,
  gross_centavos integer not null,
  retention_pct numeric not null,
  retention_centavos integer not null,
  net_centavos integer generated always as (gross_centavos - retention_centavos) stored,
  created_at timestamptz default now()
);

create index if not exists socios_vendedor_retenciones_socio_id_idx
  on socios_vendedor_retenciones (socio_id);
create index if not exists socios_vendedor_retenciones_anio_idx
  on socios_vendedor_retenciones (socio_id, anio);

alter table socios_vendedor_retenciones enable row level security;

-- Solo el founder (vía admin client, como el resto del módulo de socios)
-- toca esta tabla directamente — no hay policy de usuario normal porque ni
-- siquiera los propios vendedores escriben aquí, solo leen vía
-- /api/socios/portal/me (que usa el admin client también).
comment on table socios_vendedor_retenciones is
  'Retención Sección 1062.03 (10% o 6%/0% con relevo vigente) sobre cada comisión pagada a un vendedor, calculada en marginal sobre el acumulado anual (umbral $500). Una fila por cada comisión en socios_comisiones de un socio tipo=vendedor.';
