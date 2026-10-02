-- ============================================================================
-- VICTOR CFO — 0132: manual — Fee real de Stripe en factura-detalle +
-- conciliación automática de depósitos bancarios (2 oct 2026, pedido de
-- Joel tras el ciclo real de INV-1120/INV-1124: pago por Stripe que se
-- cerró solo pero sin mostrar el fee, y la pregunta "se supone que Victor
-- cierre esa factura con pago y con el método... no se supone que sea
-- así?" sobre depósitos de cheque/ACH).
--
-- Dos features construidas esta ronda, ninguna necesitaba tocar
-- system-prompt.txt (ya dice explícitamente que el detalle de
-- registrar/corregir pago vive en consultar_manual, no en el prompt
-- base) — este artículo le da a VICTOR el conocimiento real para
-- explicarlas bien si el usuario pregunta, en vez de adivinar o negar
-- que existen.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'fee-stripe-y-conciliacion-automatica',
  'Fee real de Stripe en la factura + conciliación automática de depósitos bancarios',
  'Cómo se ve el fee de Stripe dentro de una factura pagada, y cómo VICTOR cierra solo una factura cuando el depósito del banco (cheque, ACH, transferencia) llega por Plaid con el monto exacto.',
  $md$DOS MECANISMOS DISTINTOS — no confundirlos cuando el usuario pregunte:

1) FEE REAL DE STRIPE EN LA FACTURA: cuando un cliente paga una factura con tarjeta vía Stripe Connect, el webhook de Stripe (checkout.session.completed) captura el fee REAL que cobró Stripe (no el estimado de 2.9%+$0.30 que se usa en otras partes de la app antes de que el pago real llegue) y lo guarda en la factura junto con el monto neto. En la pantalla de detalle de esa factura, debajo de "Monto pagado" aparecen dos líneas adicionales: "Fee de Stripe" (negativo) y "Neto recibido" — esto SOLO aparece en facturas pagadas por Stripe con fee real capturado (fee_fuente = "real"); una factura pagada a mano (ATH Móvil, cheque, transferencia) no tiene fee de Stripe que mostrar ahí. Importante: el total facturado (lo que dice la factura arriba) SIEMPRE se muestra en bruto (lo que se facturó), nunca neteado contra el fee — el fee es un gasto deducible aparte, no un descuento al ingreso, para que el Estado de Resultados/Anejo M cuadre correctamente. Si el usuario pregunta "¿por qué la factura sigue diciendo el monto completo si ya se cobró el fee?" — esa es la razón, es contabilidad correcta, no un bug.

2) CONCILIACIÓN AUTOMÁTICA DE DEPÓSITOS BANCARIOS: cuando el negocio recibe un pago por fuera de Stripe (cheque depositado, ACH, transferencia) en una cuenta de banco CONECTADA POR PLAID, y esa transacción se sincroniza, VICTOR revisa automáticamente si el monto depositado coincide EXACTO (al centavo) con el balance pendiente de alguna factura "enviada" de ese dueño/entidad. Si hay exactamente UNA factura que cuadra exacto, VICTOR la cierra solo: la marca "pagada", le pone fecha de pago, y le asigna el método correcto según el texto de la transacción bancaria (detecta "cheque", "ATH Móvil" → Cheque/ATH Móvil; si no reconoce nada, default "Transferencia / ACH"). La factura queda con una etiqueta "conciliado automáticamente" visible en su detalle.

CUÁNDO NO CIERRA SOLA (por diseño, para nunca equivocarse de factura):
- El monto no cuadra exacto con ninguna factura pendiente (ni un centavo de diferencia).
- Hay DOS O MÁS facturas distintas con el mismo balance pendiente exacto — ahí VICTOR no adivina cuál es, deja todo para que el dueño cierre a mano con "Registrar pago" como siempre.
- La cuenta bancaria no está conectada por Plaid (cuentas manuales o estados subidos en CSV/PDF no activan esto todavía).
- Es una cuenta de crédito o préstamo (ahí el signo del monto significa otra cosa — un cargo negativo en tarjeta de crédito es un reembolso, no una factura cobrada, así que esas cuentas quedan excluidas a propósito).
- La transacción ya existía en el banco antes de que se construyera esta feature (solo corre sobre transacciones nuevas que Plaid trae de ahora en adelante, no revisa el historial viejo).

Si el usuario pregunta cómo activar esto: no hay nada que activar — corre automático en cada sincronización de Plaid sobre cualquier cuenta de banco de negocio ya conectada. Si pregunta por qué una factura específica no se cerró sola aunque depositó el monto correcto, la primera pregunta es si esa cuenta está conectada por Plaid (no manual) y si el depósito llegó exacto al centavo del balance pendiente de esa factura.$md$
);
