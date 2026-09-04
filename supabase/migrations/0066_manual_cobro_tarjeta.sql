-- ============================================================================
-- VICTOR CFO — 0066: manual — Cobro con tarjeta (Stripe) + más formas de pago
-- (4 sept 2026, pedido de Joel: "has lo que mejor convenga para que el
-- usuario tenga mas opciones a la hora de cobrar y el cliente tenga mas
-- opciones para pagar" — su esposa preguntó específicamente por Klarna).
--
-- No hace falta tocar código para esto: el Checkout Session de
-- lib/stripe-connect-checkout.ts NO fija payment_method_types, así que
-- Stripe ya muestra automáticamente cualquier método que el dueño del
-- negocio tenga activado en su PROPIO Stripe Dashboard (coherente con que
-- el platform profile de WCV quedó configurado como "dashboard: full" —
-- cada cuenta conectada administra sus propios métodos de pago). Lo único
-- que faltaba era que el usuario supiera que puede prenderlo — este
-- artículo le da a VICTOR el conocimiento real para sugerirlo quien
-- pregunte cómo cobrar más rápido, dar más opciones a sus clientes, o
-- específicamente por Klarna/Afterpay/Affirm/cuotas.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'cobro-tarjeta-stripe',
  'Cobro con tarjeta (Stripe) — activar y dar más formas de pago',
  'Cómo activar Stripe para cobrar facturas con tarjeta, y cómo activar Klarna, Afterpay, Affirm, ACH o Cash App para darle más opciones de pago al cliente.',
  $md$Cobro con tarjeta vive en el tab "Facturas" de la entidad de negocio, junto a los checkboxes de métodos de cobro (ATH Móvil, Transferencia/ACH, Cheque). Solo aparece editando una entidad que ya existe.

ACTIVAR: botón "Conectar Stripe" — crea o conecta la cuenta de Stripe Connect Standard del negocio. El dinero le cae directo al dueño del negocio; VICTOR nunca lo toca ni cobra comisión. Mientras la cuenta de Stripe no termine su propio proceso de verificación (identidad, cuenta bancaria), el estado queda "Falta terminar de configurarlo en Stripe" — hay que volver a apretar el botón (ahora dice "Continuar") para terminar ese proceso en Stripe.

CÓMO SE COBRA: cada factura con Stripe activo genera un link de pago real (Stripe Checkout) — el mismo link vive en el PDF de la factura y en el correo de facturas recurrentes, es estable (no expira aunque el cliente lo abra días después) y reutiliza la sesión de pago mientras siga válida en vez de crear una nueva cada vez.

MÁS FORMAS DE PAGO PARA EL CLIENTE (Klarna, Afterpay, Affirm, pagar en cuotas, ACH, Cash App Pay, etc.): el checkout de Stripe que arma VICTOR no limita a solo "tarjeta" — muestra automáticamente cualquier método que el dueño del negocio tenga PRENDIDO en su propio Stripe Dashboard (Settings → Payment methods, dentro de SU cuenta de Stripe, no en VICTOR). O sea, para que a un cliente le salga la opción de pagar en cuotas con Klarna/Afterpay/Affirm, o pagar por transferencia bancaria directa (ACH) o Cash App Pay, el dueño del negocio solo tiene que entrar a su Stripe Dashboard y activarlos ahí — VICTOR no necesita ningún cambio para que aparezcan.

Cosas a saber sobre Klarna/Afterpay/Affirm específicamente: son para pagar en cuotas (ej. "pay in 4"), tienen límites de monto (normalmente entre $1 y $10,000 por transacción, varía por proveedor), y dependen de que Stripe los tenga disponibles para el país/moneda de la cuenta (negocios de EEUU en USD normalmente califican). No hay garantía de que Stripe apruebe cada método para cada cuenta — es una decisión de Stripe basada en el perfil de riesgo del negocio, no algo que VICTOR controle.$md$
);
