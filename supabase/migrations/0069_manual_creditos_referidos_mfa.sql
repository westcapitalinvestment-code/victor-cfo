-- ============================================================================
-- VICTOR CFO — 0069: manual de usuario, 3 features nuevas que VICTOR todavía
-- no conocía (4 sept 2026, pedido de Joel: "hay que añadirle a Victor el
-- conocimiento de lo que se ha agregado nuevo, como Los creditos de AI, mes
-- gratis por referidos y como funciona y lo del MFA"). Mismo patrón que
-- 0060/0061 — solo INSERTs sobre manual_articulos, sin tocar schema ni
-- código (consultar_manual ya busca sobre toda la tabla sin límite).
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'creditos-ia',
  'Créditos de IA — cuando se acaba el límite mensual de VICTOR',
  'Cómo comprar créditos extra de IA si se acaba el límite mensual de conversación con VICTOR, y qué pasa con lo que no se usa.',
  $md$Cada plan tiene un límite mensual de cuánto se puede hablar con VICTOR (el chat), pensado para que nadie se quede sin conversar por costo, pero también para que el gasto real de IA no se dispare. Cuando ese límite se acerca o se acaba, "Créditos extra de IA" (Configuración) es la salida.

CÓMO COMPRAR: botón "Comprar créditos de IA" en Configuración — abre un Stripe Checkout de PAGO ÚNICO (no es una suscripción nueva, es un top-up de una vez) por $10. Al confirmarse el pago, se añaden $7.00 de presupuesto de IA al ciclo de facturación ACTUAL del usuario (el resto es margen del negocio sobre el costo real de Anthropic, igual que hace cualquier proveedor de IA con sus créditos de API).

DISPONIBILIDAD INMEDIATA: a diferencia del límite normal del plan (que se reparte "parejo" a lo largo del mes para que no se gaste todo el día 1), el crédito comprado está disponible COMPLETO desde el momento en que Stripe confirma el pago — se compró para usarse ya, no para racionarlo.

LO QUE NO SE USA NO SE PIERDE: si sobra crédito al cerrar el ciclo, rueda automáticamente al ciclo siguiente cuando se renueva la suscripción — no hay que gastarlo todo antes de que se acabe el mes.

SE PUEDE COMPRAR VARIAS VECES: no hay límite de cuántos packs de $10 se pueden comprar si se sigue necesitando más — cada compra queda registrada (fecha, monto, sesión de Stripe) para auditoría y soporte.$md$
),
(
  'referidos',
  'Referidos — mes gratis para quien se une, mes gratis para quien invita',
  'Cómo compartir el link de referido, qué gana la persona que se registra, y qué gana quien la invitó cuando esa persona empieza a pagar de verdad.',
  $md$El sistema de referidos premia a las DOS partes — a quien se une con el link, y por separado, a quien lo compartió, cuando ese referido se convierte en cliente pagando de verdad.

EL LINK: cada usuario tiene un link único (visible en Configuración, sección "Invita y ganen los dos", y también como tarjeta "🎁 Recibe mes Gratis" en Inicio) con la forma /registro?ref=SU-ID. No hay que generar ni copiar un código — es el mismo link para siempre.

PARA QUIEN SE REGISTRA CON EL LINK: su primer mes es completamente gratis, sea que elija Core o Pro (un trial de 30 días sobre el plan que escoja) — después de esos 30 días empieza a pagar el precio normal de ese plan, como cualquier otro usuario.

PARA QUIEN INVITÓ (el que comparte el link): no gana nada en el momento del registro — el crédito llega cuando su referido paga su PRIMERA factura real (no durante el mes de trial gratis, sino cuando Stripe le cobra de verdad por primera vez). En ese momento, quien invitó recibe un crédito automático en su propia cuenta de Stripe equivalente a UN MES de SU PROPIO plan actual (no del plan del referido) — se descuenta solo de su siguiente factura, sin que tenga que pedirlo ni reclamarlo.

SIN TOPE: se puede acumular — si alguien refiere a 10 personas y las 10 terminan pagando, se gana el equivalente a 10 meses gratis de su plan, uno por cada referido que pagó.

SI QUIEN INVITA ESTÁ EN PLAN GRATIS: no recibe el crédito — el crédito se aplica contra una factura de Stripe, y en plan gratis no hay ninguna factura a la cual aplicárselo. El beneficio de invitar es real solo para quien ya paga Core o Pro.

CADA REFERIDO CUENTA UNA SOLA VEZ: el sistema no deja que la misma persona referida genere el crédito dos veces, sin importar cuántas facturas pague después de la primera.$md$
),
(
  'mfa',
  'Verificación en dos pasos (MFA) — proteger el login con un código además de la contraseña',
  'Cómo activar la verificación en dos pasos, qué hacer si se pierde el celular con la app de autenticación, y cómo desactivarla.',
  $md$La verificación en dos pasos (MFA) es OPCIONAL — cada usuario decide si la activa, no es un requisito para usar VICTOR CFO. Vive en Configuración, tarjeta "Verificación en dos pasos (MFA)".

POR QUÉ IMPORTA: a diferencia del PIN de bloqueo rápido (que solo traba la pantalla del celular), MFA es la protección real de la cuenta — importa especialmente aquí porque VICTOR conecta bancos reales (Plaid) y cobros (Stripe Connect).

CÓMO ACTIVAR: botón "Activar" — aparece un código QR para escanear con Google Authenticator, Authy, o cualquier app de autenticación (si no se puede escanear, hay una llave para escribir a mano debajo del QR). Después de escanear, se pide el código de 6 dígitos que la app acaba de generar para confirmar que quedó bien enlazada. Al confirmar, se generan 10 CÓDIGOS DE RESPALDO de un solo uso — esa es la ÚNICA vez que se muestran en claro, hay que guardarlos en un lugar seguro en ese momento.

DESDE QUE ESTÁ ACTIVA: cada inicio de sesión (además de la contraseña) pide el código de 6 dígitos de la app de autenticación antes de dejar entrar al dashboard.

SI SE PIERDE EL CELULAR CON LA APP: en la pantalla de verificación del login hay una opción para usar uno de los 10 códigos de respaldo en vez del código de 6 dígitos. Usar un código de respaldo DESACTIVA automáticamente el MFA de la cuenta (para que la persona pueda entrar y volver a activarlo desde cero con un dispositivo nuevo) — se manda un correo de aviso de seguridad en cuanto esto pasa, por si el usuario no fue quien lo hizo.

DESACTIVAR MFA: botón "Desactivar" en la misma tarjeta de Configuración, con una confirmación antes de aplicarlo — la cuenta queda protegida solo con la contraseña desde ese momento.$md$
);
