-- 1 oct 2026, #783 (sesión con el Gem CPA): Certificado de Compras Exentas
-- (Modelo SC 2916). Cuando un negocio compra inventario/mercancía PARA
-- REVENDERLO (no para su propio uso), puede presentarle este certificado a
-- SUS suplidores y no pagar el 11.5% de IVU en esa compra — el IVU se cobra
-- una sola vez, cuando el negocio le vende ese inventario al consumidor
-- final. Sin el certificado (o sin presentarlo), el negocio paga IVU en la
-- compra Y vuelve a cobrar IVU en la venta — doble IVU sobre el mismo bien.
--
-- Esto es la dirección INVERSA de clients.ivu_exempt_reseller (que es para
-- cuando un CLIENTE de VICTOR CFO le compra AL negocio como revendedor).
-- Aquí es el certificado propio de la entidad, para presentarle a sus
-- suplidores — mismo patrón ya usado para relevo_certificate_r2_key.
alter table business_entities add column if not exists sc2916_certificate_r2_key text;
alter table business_entities add column if not exists sc2916_certificate_expiry date;

comment on column business_entities.sc2916_certificate_r2_key is
  'Key en R2 del PDF del Certificado de Compras Exentas (Modelo SC 2916) de esta entidad — se presenta a SUS suplidores para no pagar IVU en compras de inventario para reventa.';

-- Categoría de gastos dedicada para que el COGS (costo de lo vendido)
-- quede separado de "Materiales y suministros de oficina" (gasto operativo
-- normal) — son líneas distintas en Schedule C / Anejo M, y mezclar ambas
-- distorsiona el margen bruto real del negocio.
INSERT INTO hacienda_categories (nombre, linea_anejo_m, linea_schedule_c, deducible_multiplier, es_home_office, activo, disclaimer) VALUES
  (
    'Inventario / Mercancía para reventa (COGS)',
    'Anejo M',
    'Schedule C - Línea 4 (Costo de bienes vendidos)',
    1.0,
    false,
    true,
    'Si tienes Certificado de Compras Exentas (SC 2916) vigente, esta compra no debió pagar IVU — preséntaselo a tu suplidor. Si ya pagaste IVU aquí, pregúntale a tu CPA si aplica para crédito.'
  )
ON CONFLICT DO NOTHING;
