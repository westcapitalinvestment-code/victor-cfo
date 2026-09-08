-- ============================================================================
-- VICTOR CFO — 0079: corregir artículo del manual "referidos" (desactualizado)
-- ============================================================================
-- 8 sept 2026 — el artículo original (migración 0069, 4 sept 2026) decía
-- "SIN TOPE" para el crédito del referidor. El 5 sept 2026 se rediseñó el
-- programa (ver app/api/stripe/webhook/route.ts, procesarCreditoReferido)
-- para añadir un tope anual ($175/año Core, $500/año Pro) y un guardarraíl
-- anti-fraude — pero el artículo del manual nunca se actualizó. Como VICTOR
-- usa este texto para contestarle a los usuarios por chat (tool
-- consultar_manual), estaba dándoles información incorrecta: le diría a
-- alguien que el crédito no tiene tope, lo cual ya no es cierto desde hace
-- 3 días. Encontrado al explicarle el programa a Joel antes de que empiece
-- a mandar el link de referido a sus primeros clientes.
UPDATE manual_articulos
SET
  resumen = 'Cómo compartir el link de referido, qué gana la persona que se registra, qué gana quien la invitó cuando esa persona empieza a pagar de verdad, y cómo se aplica ese crédito en Stripe.',
  contenido = $md$El sistema de referidos premia a las DOS partes — a quien se une con el link, y por separado, a quien lo compartió, cuando ese referido se convierte en cliente pagando de verdad.

EL LINK: cada usuario tiene un link único (visible en Configuración, sección "Refiere y ahorra", y también como tarjeta "🎁 Recibe mes Gratis" en Inicio) con la forma /registro?ref=SU-ID. No hay que generar ni copiar un código — es el mismo link para siempre.

PARA QUIEN SE REGISTRA CON EL LINK: paga el precio normal de Core o Pro (el plan que elija), pero con 30 días de trial completamente gratis — Stripe no le cobra nada hasta que termina ese mes. Después empieza a pagar el precio normal, como cualquier otro usuario.

PARA QUIEN INVITÓ (el que comparte el link): no gana nada en el momento del registro. El crédito se activa cuando su referido paga su PRIMERA factura real (no durante el mes de trial gratis, sino cuando Stripe le cobra de verdad por primera vez). En ese momento, quien invitó recibe un crédito automático en su saldo de Stripe equivalente a UN MES del plan al que entró SU REFERIDO (no del plan propio del que invitó) — si trae a alguien a Pro, son $49.99 de crédito aunque el que invitó esté en Core.

CÓMO SE APLICA EL CRÉDITO (mecánica de Stripe, no un reembolso): el crédito se guarda como saldo a favor en la cuenta de Stripe del que invitó — NO se le cobra de más para luego devolvérselo. La próxima vez que le toque pagar su propia suscripción, Stripe aplica ese saldo automáticamente ANTES de cobrar la tarjeta: si el crédito cubre el monto completo de esa factura, no se cobra nada ese ciclo; si sobra crédito, se queda guardado para la factura siguiente; si el crédito es menor que la factura, se cobra solo la diferencia. Todo esto lo hace Stripe solo, sin que nadie tenga que pedirlo ni el equipo tenga que procesarlo a mano.

AVISO AL USUARIO: hoy en día el sistema NO manda un correo ni notificación cuando se gana un crédito — la única forma de verlo es preguntarle a VICTOR ("¿cuánto llevo en créditos de referido?") o notar que la próxima factura de Stripe salió más baja (el recibo trae la línea "VICTOR CFO — crédito por referido").

TOPE ANUAL (protección de caja, no un límite de Hacienda): hasta $175/año en créditos si el que invita está en Core, hasta $500/año si está en Pro — se calcula sobre el plan del que invita, por año calendario. Si ya alcanzó el tope, los créditos siguientes de ese año no se aplican (se retoma el 1 de enero).

GUARDARRAÍL ANTI-FRAUDE: si el referido entró a Pro, el crédito no se suelta hasta que haya evidencia real de actividad de negocio (al menos una transacción de negocio conectada o una factura creada) — así se cierra el hueco de crear una entidad vacía solo para generar el crédito sin usar la app de verdad.

SI QUIEN INVITA ESTÁ EN PLAN GRATIS: no recibe el crédito — el crédito se aplica contra una factura de Stripe, y en plan gratis no hay ninguna factura a la cual aplicárselo. El beneficio de invitar es real solo para quien ya paga Core o Pro.

CADA REFERIDO CUENTA UNA SOLA VEZ: el sistema no deja que la misma persona referida genere el crédito dos veces, sin importar cuántas facturas pague después de la primera.$md$
WHERE slug = 'referidos';
