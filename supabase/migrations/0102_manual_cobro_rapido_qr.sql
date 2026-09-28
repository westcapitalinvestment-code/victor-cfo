-- ============================================================================
-- VICTOR CFO — 0102: manual — Cobro Rápido + QR unificado (Tarjeta/ATH Móvil)
-- + marcar facturas pagadas por chat (28 sept 2026, pedido de Joel: "hay que
-- enseñar a Victor todas esas cosas que añadimos de cobro rapido y buscar
-- facturas y marcar como pagadas").
--
-- Este artículo le da a VICTOR el conocimiento real de la ronda de features
-- de "que ningún cliente se vaya sin pagar porque la plataforma no soporte
-- algo": el QR unificado que vive en CUALQUIER factura (no solo Cobro
-- Rápido), y cómo actualmente marcar una factura pagada por chat requiere
-- las tools buscar_factura_pendiente + marcar_factura_pagada, ya construidas
-- en lib/victor/tools.ts — este artículo es la parte "manual" (para que
-- VICTOR explique el flujo si le preguntan, no solo lo ejecute).
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'cobro-rapido-qr',
  'Cobro Rápido + QR unificado (Tarjeta / ATH Móvil) — cobrar en persona',
  'Cómo generar un QR para que un cliente pague una factura por tarjeta o ATH Móvil escaneando, y cómo crear un cobro rápido sin pasar por el formulario completo de Nueva Factura.',
  $md$El QR de cobro vive en DOS lugares, y en el fondo es la misma cosa:

1. CUALQUIER FACTURA YA CREADA: en la pantalla de detalle de la factura, botón "📱 Mostrar QR para cobrar" (arriba de "Registrar pago", solo sale si la factura no está pagada todavía). El QR apunta al total EXACTO de esa factura — no hay que escribir el monto aparte.

2. COBRO RÁPIDO: en el tab "Facturas" del portal de Facturación, botón "⚡ Cobro" (junto al botón "+ Nueva"). Es para cuando NO hay una factura hecha todavía — alguien llega y hay que cobrarle ahí mismo. Solo pide monto y, opcionalmente, el cliente (se puede dejar en blanco — "cobro al contado", sin cliente asignado). Por debajo crea una factura mínima (una sola línea "Cobro rápido", sin desglose de tax/retención) y salta directo a la pantalla de la factura con el QR ya abierto.

QUÉ VE EL CLIENTE AL ESCANEAR: una página pública (no necesita cuenta ni login) con el monto y dos opciones posibles:
- Pagar con tarjeta (Apple Pay / Google Pay salen automáticos si el navegador del cliente los soporta) — funciona si la entidad ya tiene Stripe Connect conectado (mismo requisito que el botón "Cobrar con tarjeta").
- Pagar con ATH Móvil — SOLO sale si la entidad tiene su "Public Token de ATH Móvil Business" configurado (Editar entidad → sección ATH Móvil). Ese token se saca de la app de ATH Business → Ajustes → Configuración de Ecommerce, y es DISTINTO del pATH que ya existía (el pATH es solo informativo, este token activa el botón de pago real y verificado). Tiene que ser una cuenta de ATH Móvil BUSINESS — ATH Móvil personal no tiene esta opción, no existe la sección de Ecommerce ahí.

Si la entidad no tiene NI Stripe conectado NI el Public Token de ATH Móvil, el QR igual abre pero solo dice que el negocio todavía no activó cobro en línea — no se rompe, solo no ofrece nada.

IMPORTANTE — la app de ATH Móvil (la que usa el cliente para pagar, no el negocio) NO sirve para escanear este QR — su escáner solo reconoce códigos propios de ATH, no páginas web. El cliente escanea con la Cámara normal del teléfono, entra a la página, y AHÍ ADENTRO escoge ATH Móvil si esa opción está disponible.

EL PAGO POR ATH MÓVIL SE VERIFICA DE VERDAD — no basta con que el cliente diga que pagó: el servidor le pregunta directamente a ATH Móvil (su propio endpoint de verificación) si esa transacción quedó completada y por el monto correcto, antes de marcar la factura pagada. No hay forma de "hacerle trampa" al QR diciendo que ya pagó sin haber pagado.

MARCAR UNA FACTURA PAGADA DESDE EL CHAT (sin entrar a Facturación): si el usuario dice algo como "marca la factura 0042 como pagada" o "el cliente Juan ya me pagó", VICTOR puede hacerlo directo por chat — mismo efecto que apretar "Registrar pago" a mano. Es un proceso de DOS pasos, nunca uno solo: primero busca la factura (por nombre de cliente y/o número) y se la muestra al usuario para que confirme cuál es y cómo le llegó el pago (ATH Móvil, transferencia, cheque, efectivo, tarjeta), y solo después de esa confirmación explícita la marca pagada de verdad. VICTOR nunca marca una factura pagada sin haber mostrado antes cuál encontró y sin que el usuario haya dicho el método de pago — si el usuario solo dice "márcala pagada" sin decir cómo le pagaron, VICTOR pregunta el método, no lo asume. Si la factura tiene algún servicio con "recordar cada X meses" configurado, al marcarla pagada también se crea o actualiza el seguimiento de ese cliente automáticamente — igual que si se marca a mano en Facturación.$md$
);
