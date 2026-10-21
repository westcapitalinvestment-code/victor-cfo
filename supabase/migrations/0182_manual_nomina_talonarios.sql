-- 0182: manual Nómina — talonarios (21 oct 2026, pedido de Javier Pabón, AVG Accounting). Idempotente.
UPDATE manual_articulos
SET contenido = contenido || $md$

TALONARIOS (recibos de pago): en la pestaña HISTORIAL, al abrir una corrida guardada aparece "Talonarios de la corrida (imprimir/PDF)", que abre un talonario por empleado listo para imprimir o guardar como PDF (en el diálogo de impresión se escoge "Guardar como PDF"), y cada empleado tiene su propio botón "Talonario (imprimir/PDF)". Cada talonario lleva: datos de la compañía (nombre, dirección, teléfono, EIN), empleado (últimos 4 del SSN), período y fecha de pago, ingresos (horas y tarifa, horas extra, comisiones, bono con su tipo), deducciones una por una, total de deducciones, neto a pagar, acumulado del año (bruto, retenciones y neto) y saldo de vacaciones y enfermedad en días. El acumulado cuenta las corridas aprobadas hasta ese período más lo cargado como acumulado previo del empleado. Es un documento informativo del cálculo; VICTOR no paga a los empleados ni radica nada.$md$
WHERE slug = 'nomina' AND contenido NOT LIKE '%TALONARIOS (recibos de pago)%';
