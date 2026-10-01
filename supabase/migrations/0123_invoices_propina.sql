-- 1 oct 2026, #781 (sesión con el Gem CPA — caso restaurante): la propina
-- que deja un cliente NO es venta tributable (no paga IVU) ni es ingreso
-- del negocio (es un pasivo a distribuir a los empleados) — si se mezcla
-- con el total de la factura, el negocio sobrepaga IVU y Reportes muestra
-- ingreso que en realidad no es suyo.
--
-- A propósito queda FUERA de subtotal/ivu_monto/total — es dinero adicional
-- que se registra al confirmar el pago (quien ya sabe cuánto le dejaron),
-- no una línea más de la factura. Por eso no toca ningún cálculo existente
-- de IVU/retención/reportes: al no sumarse a subtotal ni a total, ya queda
-- excluida de "Facturado" y "Cobrado" sin tener que tocar esas fórmulas.
alter table invoices add column if not exists propina_monto numeric(10,2) default 0;

comment on column invoices.propina_monto is
  'Propina recibida al cobrar, informada aparte — NUNCA forma parte de subtotal/ivu_monto/total. No es ingreso del negocio ni base de IVU, es dinero a distribuir a empleados.';
