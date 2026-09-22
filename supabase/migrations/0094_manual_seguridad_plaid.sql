-- ============================================================================
-- VICTOR CFO — 0094: FAQ de seguridad de Plaid en el manual (22 sept 2026,
-- pedido de Joel: "le envié un email sobre una pregunta a Victor sobre
-- plaid y no me contestó... creo que le debemos añadir quizás unas
-- respuestas más frecuentes").
--
-- Root cause probable: el agente de soporte por correo (lib/soporte-agente.ts,
-- migración 0092) SOLO contesta lo que encuentra en manual_articulos — nunca
-- inventa (regla explícita de Joel). El artículo 'cuentas' ya cubría CÓMO
-- conectar un banco por Plaid, pero no tenía nada sobre POR QUÉ es seguro
-- hacerlo (contraseña, quién la ve, etc.) — la misma pregunta que ya
-- resolvimos hoy en la UI de /dashboard/cuentas y en el email de bienvenida
-- (commits "Confianza en conexión bancaria..." y "Confianza Plaid..."). Si
-- Joel preguntó algo como "¿es seguro dar mi contraseña del banco?", el
-- agente no encontró esa reassurance específica en el manual y, siguiendo su
-- propia regla, escaló a info@victorcfo.com en vez de contestar directo —
-- de ahí el silencio que sintió Joel (esa bandeja es aparte de su Gmail
-- personal, ver comentario junto a sendEscalacionSoporteEmail en
-- lib/email.ts).
--
-- Esta migración no toca código — solo añade el mismo texto de confianza que
-- ya usamos en la app al artículo 'cuentas', para que buscar_manual (y el
-- agente de soporte) lo encuentren directo la próxima vez.
-- ============================================================================

UPDATE manual_articulos
SET
  resumen = 'Cómo conectar un banco con Plaid (y por qué es seguro), añadir/editar/eliminar una cuenta manual, subir y deshacer un estado de cuenta, ver el historial de subidas, y reconectar un banco caído.',
  contenido = $md$La pantalla "Cuentas" (/dashboard/cuentas) es donde conectas y administras tus bancos y tarjetas.

CONECTAR UN BANCO (Plaid): botón "Conectar banco" (requiere plan Core o superior — en plan Gratis muestra la oferta de upgrade). Antes de abrir la ventana de conexión te pregunta si prefieres traer el historial completo del año o solo desde hoy — recomendado traer el año completo para tener todo listo para las planillas.

¿ES SEGURO CONECTAR MI BANCO? Sí. La conexión la maneja Plaid directo con tu banco — VICTOR CFO nunca ve ni guarda tu contraseña, solo recibe las transacciones que tú ya autorizaste a través de Plaid. Plaid es la misma tecnología que usan apps como Venmo, Chime, American Express y Robinhood para conectarse a bancos, y aquí en Puerto Rico conecta bien bancos locales como BPPR, FirstBank, Oriental y Mercury — algo que QuickBooks Online no siempre logra. Si de todas formas prefieres no conectar el banco todavía, puedes crear una cuenta manual y subir tus estados de cuenta (CSV o PDF) — VICTOR categoriza igual, sin conectar nada.

CUENTA MANUAL (ej. Apple Card, o cualquier cuenta sin integración): sección "Cuentas manuales" → "+ Añadir cuenta manual" — pide nombre, tipo (banco, tarjeta de crédito, préstamo, inversión) y balance actual. Tocar el balance directamente lo deja actualizar rápido con un solo número; el botón "Editar" abre un formulario completo para corregir nombre, tipo, balance, o (si tienes entidades de negocio) reasignarla a otra entidad, todo junto. "Eliminar" la borra por completo — también borra las transacciones que hayas importado a esa cuenta — y pide confirmar.

SUBIR ESTADO DE CUENTA: botón "Subir estado de cuenta" en cualquier cuenta (Plaid o manual), para rellenar historial que el banco no trajo completo. Dos formas: CSV/QuickBooks (gratis, tú mapeas las columnas de fecha/descripción/monto) o PDF (requiere Core, VICTOR lee el PDF del banco con IA y extrae balance/APR/pago mínimo si el PDF los trae; tú revisas la lista y quitas filas que no apliquen antes de confirmar). Justo después de importar, si te equivocaste de cuenta, hay un botón "¿Subiste esto a la cuenta equivocada? Deshacer" que borra esa tanda completa al instante.

VER ESTADOS SUBIDOS: botón "Ver estados subidos" en cualquier cuenta — abre el historial de cada CSV/PDF que le has subido (fecha, cuántas transacciones importó, duplicadas que se saltó, y si el PDF trajo APR/balance/pago mínimo), con un botón "Borrar" en cada fila para deshacer una importación vieja en cualquier momento, no solo justo después de subirla.

RECONECTAR UN BANCO: si un banco pierde la conexión (cambiaste tu contraseña, venció un código), aparece un aviso rojo arriba con botón "Reconectar" — abre el mismo flujo de conexión para renovar el acceso, sin perder historial.

CUENTA DE NEGOCIO: VICTOR detecta solo, por el nombre, si una cuenta parece de negocio. Si tienes varias entidades de negocio (plan Pro), puedes asignar cada cuenta a la entidad correcta con el selector "Pertenece a:" en cada cuenta (Plaid o manual).

RENOMBRAR, SINCRONIZAR Y DESCONECTAR: en cuentas de Plaid, "Renombrar" cambia solo el apodo que ves en VICTOR (nunca el nombre real del banco). El botón "Sincronizar transacciones" (abajo de la pantalla) fuerza traer lo más nuevo de todos tus bancos conectados en ese momento, sin esperar la sincronización automática nocturna. "Desconectar", en la lista de Bancos conectados, te pregunta si además quieres borrar el historial ya importado de ese banco o conservarlo como referencia.$md$,
  updated_at = now()
WHERE slug = 'cuentas';
