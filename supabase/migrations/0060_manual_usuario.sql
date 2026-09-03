-- ============================================================================
-- VICTOR CFO — 0060: manual de usuario consultable por VICTOR (3 sept 2026,
-- pedido de Joel: "hay que hacer un manual de usuario de lo que tenemos y
-- subirlo para que Victor tenga los detalles"). Root cause del pedido:
-- Joel preguntó cómo se usan Admin/Secretaria y Equipo y ni él ni VICTOR
-- tenían esa documentación a mano — VICTOR solo conoce lo que está escrito
-- en su system prompt, y esos dos módulos nunca se documentaron ahí (son
-- flujos largos, con costos de addon y permisos que cambian seguido — no
-- tenía sentido inflar el prompt base con eso).
--
-- manual_articulos es una tabla de CONTENIDO DE PRODUCTO, no datos del
-- usuario — de lectura pública para cualquier usuario autenticado (todos
-- ven la misma documentación), y de escritura solo por migración/consola
-- de Supabase (no hay UI para que un usuario la edite). VICTOR la consulta
-- con la herramienta consultar_manual (lib/victor/tools.ts) cuando no está
-- seguro del flujo exacto de una pantalla, en vez de adivinar botones o
-- costos que no existen.
-- ============================================================================

CREATE TABLE manual_articulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  resumen text NOT NULL,       -- una línea, ayuda a la búsqueda por palabras clave
  contenido text NOT NULL,     -- el cuerpo real que VICTOR le pasa/adapta al usuario
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE manual_articulos ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquier usuario logueado (Core, Pro, Admin/Secretaria,
-- técnico no aplica porque no tiene sesión Supabase) — es documentación
-- del producto, no algo que dependa de owner_id.
CREATE POLICY manual_articulos_lectura ON manual_articulos
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON manual_articulos TO authenticated;

-- ----------------------------------------------------------------------------
-- Contenido inicial: los 3 módulos que Joel pidió explícitamente. Se puede
-- seguir agregando artículos nuevos con INSERTs futuros sin tocar schema.
-- ----------------------------------------------------------------------------

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'facturacion',
  'Facturación — crear y cobrar facturas',
  'Cómo crear clientes, facturas, cotizaciones, facturas recurrentes y cobrar. Plan Pro.',
  $md$Facturación vive en la pestaña "Facturas" del negocio (plan Pro/Pro+, una entidad de negocio activa). Es un portal con varias pestañas: Facturas, Clientes, Servicios, Cotizaciones, Reportes.

CLIENTES: antes de facturar hace falta un cliente — nombre, email, teléfono, dirección, y si aplica, el % de retención que ese cliente te hace (6%, 10%, o relevo total). Se pueden importar en lote desde un CSV o Excel de FreshBooks. Un cliente se puede archivar (no aparece más en los selectores) sin perder su historial, y solo se puede eliminar si nunca tuvo facturas ni cotizaciones.

SERVICIOS (catálogo): cada servicio que ofreces se guarda una vez (nombre, descripción, precio, si aplica IVU) y se reutiliza al armar una factura o cotización en vez de escribir todo de cero cada vez.

NUEVA FACTURA: se eligen cliente, fecha, y una o varias líneas (del catálogo de Servicios o libres, con nombre + descripción + cantidad + precio). El sistema calcula IVU (si la entidad lo cobra), retención del cliente (si aplica), y el total. Se puede pedir un depósito. Se puede marcar "¿Es recurrente?" (semanal/quincenal/mensual) — VICTOR genera sola la próxima factura en su fecha y, si el cliente tiene email guardado, se la manda automáticamente por correo (si no tiene email, la deja en borrador para enviarla a mano). También se puede asignar a un técnico del módulo Equipo, si está activo.

ENVIAR: desde el detalle de la factura hay botones para descargar el PDF, reenviarla por WhatsApp (abre un link con el mensaje ya escrito, sin el monto — el cliente lo ve al abrir el PDF), o por email si está configurado.

REGISTRAR PAGO: en el detalle de la factura, botón "Registrar pago" — se elige método (ATH Móvil, ATH Móvil Business, Transferencia, Cheque, Efectivo, Tarjeta) y fecha real del pago. Una vez pagada, se puede corregir el método/fecha después (botón "Editar" en la factura pagada) si se capturó algo mal — pero ya no se pueden cambiar las líneas ni el total de una factura pagada, por integridad contable.

COTIZACIONES: mismo flujo que Nueva Factura, pero termina en "aprobada" o "rechazada" según el cliente; una cotización aprobada se convierte en factura con un botón, sin tener que rehacer las líneas.

REPORTES: dentro del mismo portal, resumen de facturado/cobrado, por cliente, por servicio, y retenciones para el CPA — exportable a PDF.$md$
),
(
  'admin-secretaria',
  'Admin/Secretaria — dar acceso de trabajo a alguien más',
  'Cómo invitar a una secretaria o administrador para que ayude con facturación sin ver las finanzas del dueño. Plan Pro, addon $10-$20/mes por persona.',
  $md$Admin/Secretaria le da a otra persona su PROPIO login (su propio correo y contraseña, nunca las del dueño) para ayudar con la facturación de un negocio específico, sin exponerle las finanzas personales del dueño ni las de otras entidades.

CÓMO INVITAR: desde "Admin" en el menú del negocio (plan Pro/Pro+, se administra por negocio — hay que tener seleccionada la entidad específica, no la vista "Todas"). Botón "+ Añadir" abre un formulario:
1. Nivel de acceso: Secretaria ($10/mes) o Administrador ($20/mes).
2. Nombre completo y el email al que le va a llegar la invitación.
3. Si es Secretaria, 5 permisos adicionales que se prenden/apagan a mano (ver ingresos del mes, ver gastos del negocio, cambiar precios del catálogo, ver créditos en Hacienda, ver reportes de años anteriores). Si es Administrador, esos 5 vienen todos incluidos por defecto.

DIFERENCIA ENTRE LOS DOS NIVELES:
- Secretaria: siempre puede ver clientes, crear facturas, registrar cobros, y ver pendientes. Nada más, salvo lo que el dueño prenda de los 5 permisos adicionales.
- Administrador: todo lo de Secretaria, más 4 secciones completas — Pagos (a contratistas), Metas de negocio, Bóveda de documentos, y Cuentas (solo para VER balances, nunca puede conectar ni desconectar un banco).

Ninguno de los dos niveles ve jamás las finanzas PERSONALES del dueño, ni de otra entidad de negocio distinta a la que fue invitado.

CÓMO ACEPTA LA PERSONA INVITADA: le llega un correo con un link para crear su propia contraseña (o entrar si ya tiene cuenta en VICTOR). Al confirmar, queda con acceso activo y entra directo a su portal.

SU PORTAL: al hacer login, entra directo a "/admin" — ve solo el negocio al que fue invitado (no puede cambiar de entidad), y si es Administrador ve pestañas de Facturación, Pagos, Metas, Bóveda, Cuentas; si es Secretaria, solo ve Facturación.

COSTO: se cobra por persona, no por negocio — un dueño puede tener varias secretarias y/o administradores a la vez, cada uno su propio cargo mensual ($10 o $20) que se suma automáticamente a la suscripción de Stripe del dueño desde que se manda la invitación (no desde que se acepta). Se puede quitar a alguien en cualquier momento desde la misma pantalla de Admin, y el cargo se detiene.$md$
),
(
  'equipo-tecnicos',
  'Equipo — técnicos de campo que facturan desde su celular',
  'Cómo dar acceso a técnicos (plomeros, electricistas, etc.) para que hagan y cobren trabajos en el momento. Plan Pro, addon $20/mes hasta 3 técnicos.',
  $md$Equipo le da a un técnico de campo (plomero, electricista, instalador, etc.) su propio link para completar y cobrar un trabajo desde su celular, sin necesitar cuenta ni contraseña — solo un PIN de 4 dígitos.

CÓMO CREAR UN TÉCNICO: desde "Equipo" en el menú del negocio (plan Pro/Pro+) → pestaña Técnicos → "+ Nuevo técnico". Se pide nombre, teléfono, y un PIN de 4 dígitos (se puede vincular a un contratista que ya esté guardado en Pagos, para que la retención 480.6 salga a nombre de la misma persona). Al crearlo, VICTOR genera un link personal único para ese técnico — ese es el ÚNICO momento en que se puede ver el PIN en claro; si se pierde, hay que "Restablecer PIN" para generar uno nuevo. El link se manda por WhatsApp con el botón "Reenviar link".

CÓMO ENTRA EL TÉCNICO: abre su link personal (no pasa por el login normal de VICTOR) y escribe su PIN de 4 dígitos en un teclado numérico. Puede empezar a trabajar de inmediato, sin que el dueño tenga que aprobar el acceso cada vez — el dueño ya lo aprobó al crearlo.

QUÉ PUEDE HACER EL TÉCNICO: ver las facturas que el dueño le asignó (desde "Asignar a técnico" al crear una Nueva Factura o Cotización), completarlas añadiendo servicios del catálogo, tomar una foto de evidencia y la firma del cliente, y — si el dueño se lo permite — ver precios, cobrar facturas vencidas, añadir clientes nuevos, o aplicar un descuento hasta cierto %. También puede iniciar una factura o cotización desde cero para un trabajo que llegó sin estar preasignado.

APROBACIÓN: el dueño elige si las facturas del técnico salen directo al cliente (modo automático) o si primero pasan por su revisión (modo manual) — configurable en general o por técnico específico. Las cotizaciones que el técnico arma desde cero (sin que el dueño se las pidiera) SIEMPRE necesitan que el dueño las apruebe antes de mandarse, sin importar el modo.

REPORTES: pestaña Reportes del mismo portal — cuánto facturó y cobró cada técnico, por período y por servicio.

COSTO Y TOPE: $20/mes, hasta 3 técnicos activos incluidos. El técnico NUNCA ve balances generales del negocio, otras facturas, ni información financiera fuera de lo suyo — solo lo que se le asignó o lo que él mismo creó.$md$
);
