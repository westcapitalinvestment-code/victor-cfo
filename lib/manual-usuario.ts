// Manual de Usuario de VICTOR CFO (26 oct 2026, pedido de Joel): una guía por
// módulo, paso a paso, para usuarios. Se muestra en
// /dashboard/manual y se abre desde el botón "Manual de usuario" sobre el chat
// de VICTOR.
//
// FOTOS: cada paso puede traer `foto` (descripción de la captura). La imagen se
// busca en /public/manual/<id-del-módulo>/<número-del-paso>.png (paso 1 = 1.png).
// Si el archivo no existe, la página muestra un recuadro "Captura pendiente" con
// esa descripción — así este mismo texto sirve de guion para tomar las capturas.
//
// Contenido basado en los artículos del manual de VICTOR (tabla manual_articulos)
// y en las pantallas reales. Sin precios de planes a propósito: cambian, y la
// fuente única es victorcfo.com.

export type Audiencia = "usuario";

export type Paso = {
  titulo: string;
  texto: string;
  foto?: string;
};

export type ModuloManual = {
  id: string;
  grupo: string;
  titulo: string;
  icono: string; // clase de Tabler Icons, ej. "ti-home"
  audiencia: Audiencia[];
  plan: string;
  resumen: string;
  donde: string;
  pasos: Paso[];
  ejemplo?: string;
  calculadora?: "vendedor"; // muestra la calculadora de ganancias del vendedor
  consejos?: string[];
  preguntas?: { p: string; r: string }[];
};

export const GRUPOS_MANUAL = [
  "Empezar",
  "Tus finanzas personales",
  "Tu negocio",
  "Tu equipo y tu contable",
  "Tu cuenta",
] as const;

export const MODULOS_MANUAL: ModuloManual[] = [
  // ───────────────────────────── EMPEZAR ─────────────────────────────
  {
    id: "empezar",
    grupo: "Empezar",
    titulo: "Primeros pasos",
    icono: "ti-rocket",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Qué es VICTOR CFO, cómo crear tu cuenta, cómo moverte por la app y cómo hablar con VICTOR.",
    donde: "victorcfo.com → Registro",
    pasos: [
      {
        titulo: "Crea tu cuenta",
        texto:
          "Entra a victorcfo.com y toca Registro. Lo más rápido es continuar con Google: en un clic tienes tu cuenta gratis. También puedes registrarte con tu correo y una contraseña. Si alguien te mandó un link de invitación, úsalo: te da el primer mes gratis.",
        foto: "Pantalla de registro con el botón Continuar con Google",
      },
      {
        titulo: "Cuéntale a VICTOR de ti",
        texto:
          "La primera vez, VICTOR te hace unas preguntas cortas (a qué te dedicas, si tienes negocio, si tienes hijos). No es un examen: sirve para que sus consejos y alertas sean para tu situación. Puedes contestar escribiendo o con el micrófono.",
        foto: "Chat de VICTOR en la primera conversación (onboarding)",
      },
      {
        titulo: "Conoce la barra de abajo",
        texto:
          "Abajo tienes los íconos de la app. A la izquierda, lo personal: Inicio, Metas, Documentos, Transacciones y Cuentas. Después de la línea verde, lo del negocio: Facturas, Pagos, Nómina, Admin y Equipo. Al final están Config y, si aplica, otros módulos. Los módulos que tu plan no incluye siguen visibles: al tocarlos te explican cómo activarlos.",
        foto: "Barra inferior completa, con la línea verde que separa personal y negocio",
      },
      {
        titulo: "Habla con VICTOR",
        texto:
          "El círculo verde con la cara de VICTOR (abajo a la derecha) abre el chat. Pregúntale cuánto gastaste este mes, pídele que cree una meta, que anote una cita o que explique cualquier pantalla. Puede crear y actualizar cosas por ti, pero nunca manda dinero ni radica planillas.",
        foto: "Chat de VICTOR abierto con una pregunta y su respuesta",
      },
      {
        titulo: "Cambia entre Personal y tu negocio",
        texto:
          "Si tienes un plan con negocio, arriba aparece un selector de entidad. Escoge tu negocio para ver sus facturas, gastos y metas, o la vista Personal para tus finanzas de casa. Algunos módulos piden una entidad específica y no funcionan con la vista Todas.",
        foto: "Selector de entidad en la barra superior desplegado",
      },
    ],
    consejos: [
      "Instala VICTOR como app en tu celular: en Safari o Chrome, menú Compartir → Agregar a pantalla de inicio. Así recibes avisos y abre más rápido.",
      "Si un módulo te dice que necesita otro plan, no pasa nada: tu información no se pierde, solo no se muestra hasta activarlo.",
    ],
    preguntas: [
      { p: "¿VICTOR mueve mi dinero?", r: "No. VICTOR calcula, organiza y te avisa. Nunca deposita, paga ni radica nada por ti." },
      { p: "¿Qué plan me conviene?", r: "Gratis para organizar tus movimientos; Core para conectar bancos y hablar con VICTOR; Pro/Business si tienes un negocio (facturas, contratistas, equipo)." },
    ],
  },

  // ───────────────────────── FINANZAS PERSONALES ─────────────────────────
  {
    id: "inicio",
    grupo: "Tus finanzas personales",
    titulo: "Inicio",
    icono: "ti-home",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Tu panel principal: cómo vas este mes, lo que está pendiente y las alertas que VICTOR detecta.",
    donde: "Barra inferior → Inicio",
    pasos: [
      {
        titulo: "Lee el resumen del mes",
        texto:
          "Arriba ves tus totales del mes: lo que entró, lo que gastaste y lo que apartaste (ahorro e inversión cuentan aparte, no como gasto). Los montos cambian solos cuando se importan o categorizan movimientos.",
        foto: "Inicio con las tarjetas de Ingresos, Gastos y Ahorrado",
      },
      {
        titulo: "Atiende los pendientes",
        texto:
          "La tarjeta de gastos sin categorizar te lleva directo a Transacciones. Las alertas te avisan de documentos por vencer, citas próximas y patrones raros en tus gastos. Si no hay nada pendiente, la tarjeta no aparece.",
        foto: "Tarjeta de gastos sin categorizar y tarjeta de Alertas",
      },
      {
        titulo: "Revisa tu próxima cita y tus metas",
        texto:
          "La tarjeta Próxima cita muestra la siguiente con un punto de color: rojo si es hoy o mañana, ámbar en pocos días, verde más adelante. Las metas te enseñan cuánto llevas ahorrado.",
        foto: "Tarjeta Próxima cita",
      },
      {
        titulo: "Comparte tu link y gana meses gratis",
        texto:
          "La tarjeta Recibe mes Gratis tiene tu link personal. Cuando alguien se registra con él, empieza con un mes gratis; y tú ganas un mes de tu plan cuando esa persona paga su primera factura.",
        foto: "Tarjeta Recibe mes Gratis con el botón de copiar link",
      },
    ],
    consejos: ["Si eres plan Gratis, aquí también ves tu camino (qué hacer primero con tu dinero) y la tarjeta Págate Primero."],
  },
  {
    id: "cuentas",
    grupo: "Tus finanzas personales",
    titulo: "Cuentas (bancos y tarjetas)",
    icono: "ti-credit-card",
    audiencia: ["usuario"],
    plan: "Conectar banco: Core o superior. Cuentas manuales: todos",
    resumen: "Conecta tu banco, agrega cuentas manuales y sube estados de cuenta para tener todo en un solo lugar.",
    donde: "Barra inferior → Cuentas",
    pasos: [
      {
        titulo: "Conecta tu banco",
        texto:
          "Toca Conectar banco. Antes de abrir la ventana del banco, VICTOR te pregunta si quieres traer el historial del año completo o solo desde hoy. Se recomienda el año completo para tener tus planillas listas. Entras con tus credenciales en la ventana segura de Plaid: VICTOR nunca ve tu contraseña del banco.",
        foto: "Pantalla Cuentas con el botón Conectar banco",
      },
      {
        titulo: "Agrega una cuenta manual",
        texto:
          "Para cuentas sin conexión (por ejemplo, la Apple Card), ve a Cuentas manuales → Añadir cuenta manual. Escribe el nombre, el tipo (banco, tarjeta, préstamo o inversión) y el balance actual. Puedes editarla o eliminarla cuando quieras; al eliminarla se borran también sus transacciones.",
        foto: "Formulario de nueva cuenta manual",
      },
      {
        titulo: "Sube un estado de cuenta",
        texto:
          "En cualquier cuenta, el botón Subir estado de cuenta rellena historial que el banco no trajo. Con CSV, tú indicas qué columna es la fecha, la descripción y el monto. Con PDF (plan Core), VICTOR lee el estado con IA y tú solo revisas y quitas las filas que no apliquen. Cada subida queda en un historial y se puede borrar completa.",
        foto: "Ventana de subir estado de cuenta con la vista previa de filas",
      },
      {
        titulo: "Reconecta si el banco se cae",
        texto:
          "Si cambiaste tu contraseña o venció un código, aparece un aviso rojo arriba con el botón Reconectar. Sigue el mismo flujo y no pierdes historial.",
        foto: "Aviso rojo de banco desconectado con el botón Reconectar",
      },
      {
        titulo: "Asigna cada cuenta a su negocio",
        texto:
          "Si tienes varios negocios, usa el selector Pertenece a: en cada cuenta para indicar de cuál es. Renombrar solo cambia el apodo que ves en VICTOR, nunca el nombre real del banco.",
        foto: "Selector Pertenece a: en una cuenta",
      },
    ],
    consejos: ["Los movimientos pendientes (⏳) son estimados del banco: pueden cambiar de monto cuando el banco los liquida."],
  },
  {
    id: "transacciones",
    grupo: "Tus finanzas personales",
    titulo: "Transacciones",
    icono: "ti-chart-bar",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Ve tus movimientos, corrige categorías, resuelve duplicados y baja el reporte para tu contable.",
    donde: "Barra inferior → Transacciones",
    pasos: [
      {
        titulo: "Filtra lo que quieres ver",
        texto:
          "Arriba escoges la cuenta (puedes marcar varias), la categoría (o Sin categorizar), el interruptor Gastos/Ingresos y el mes. Una tarjeta te da los totales del mes: ingresos, gastos y ahorro e inversión.",
        foto: "Lista de transacciones con los filtros y la tarjeta de totales",
      },
      {
        titulo: "Corrige una categoría",
        texto:
          "Toca la categoría subrayada de un movimiento, busca la correcta y listo. VICTOR categoriza solo lo que reconoce con alta confianza y aprende de tus correcciones. Lo que queda Sin categorizar siempre se muestra, sin importar el mes.",
        foto: "Buscador de categorías abierto sobre una transacción",
      },
      {
        titulo: "Crea una categoría propia",
        texto: "En el filtro de Categoría, toca Añadir categoría, escribe el nombre y Crear.",
        foto: "Opción Añadir categoría en el filtro",
      },
      {
        titulo: "Revisa los posibles duplicados",
        texto:
          "Si subiste un estado y luego conectaste el mismo banco, un movimiento puede quedar dos veces. VICTOR lo detecta y lo saca de tus totales; lo revisas en el aviso de posibles duplicados. Si no era duplicado, toca No es duplicado.",
        foto: "Pantalla de posibles duplicados",
      },
      {
        titulo: "Descarga el reporte para tu contable",
        texto:
          "Con el botón Reporte para tu contable escoges un rango (este mes, trimestre, año…) y bajas un archivo con fecha, descripción, categoría, línea de planilla y monto. Tu contador lo recibe listo para trabajar.",
        foto: "Menú de rangos del reporte para tu contable",
      },
    ],
    ejemplo:
      "Ejemplo: aparece un cargo “SHELL 4421” sin categorizar. Tocas la categoría, eliges Transporte y gasolina, y desde ese momento VICTOR reconoce los cargos de Shell por sí solo.",
    consejos: ["Usa la barra de búsqueda para encontrar un movimiento por nombre o por monto."],
  },
  {
    id: "categorias",
    grupo: "Tus finanzas personales",
    titulo: "Categorías",
    icono: "ti-tags",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Fusiona, renombra y limpia tus categorías para que los reportes salgan ordenados.",
    donde: "Transacciones → Categoría → Gestionar categorías",
    pasos: [
      {
        titulo: "Abre la lista de categorías",
        texto:
          "Al fondo del filtro de Categoría en Transacciones toca Gestionar categorías. Verás todas, con cuántos movimientos tiene cada una y una etiqueta: Personal (la creaste tú) o Global (viene con la app).",
        foto: "Lista de categorías con las etiquetas Personal y Global",
      },
      {
        titulo: "Fusiona categorías repetidas",
        texto:
          "Si tienes “Telefónica” y “Telefonía”, toca Fusionar en una y escoge a cuál mover todo. VICTOR te dice cuántas transacciones se moverán antes de confirmar. Si la de origen es tuya, se borra; si es Global, se queda.",
        foto: "Ventana de fusionar con el contador de transacciones",
      },
      {
        titulo: "Renombra o elimina las tuyas",
        texto:
          "Renombrar y Eliminar solo aplican a categorías Personales. Para eliminar, la categoría debe estar vacía: fusiónala primero si tiene movimientos.",
        foto: "Botones Renombrar y Eliminar en una categoría personal",
      },
    ],
  },
  {
    id: "metas",
    grupo: "Tus finanzas personales",
    titulo: "Metas",
    icono: "ti-target",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Fija una meta de ahorro (personal o de negocio) y mira tu progreso.",
    donde: "Barra inferior → Metas",
    pasos: [
      {
        titulo: "Crea una meta",
        texto: "Toca Nueva, escribe el nombre, el monto que quieres juntar y, si ya tienes algo ahorrado, cuánto. Guardar meta.",
        foto: "Formulario de nueva meta",
      },
      {
        titulo: "Actualiza lo ahorrado",
        texto:
          "Entra a Editar / eliminar y cambia el campo Ya tienes ahorrado por el NUEVO TOTAL (no se suma, se reemplaza). Para borrar la meta, toca Eliminar meta dos veces.",
        foto: "Meta con la barra de progreso y la pantalla de edición",
      },
      {
        titulo: "Hazlo hablando con VICTOR",
        texto:
          "Dile “quiero ahorrar $5,000 para vacaciones en diciembre” o “le añadí $100 al fondo de emergencia”. Es la única forma de ponerle fecha límite a una meta.",
        foto: "Chat creando una meta con fecha",
      },
    ],
    consejos: ["Las metas de negocio piden tener un negocio creado y seleccionado arriba (no la vista Todas)."],
  },
  {
    id: "documentos",
    grupo: "Tus finanzas personales",
    titulo: "Bóveda de documentos",
    icono: "ti-file-text",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Guarda licencias, pólizas, permisos y contratos con su fecha de vencimiento y recibe avisos antes de que venzan.",
    donde: "Barra inferior → Documentos",
    pasos: [
      {
        titulo: "Sube un documento",
        texto:
          "Toca Nuevo documento. Escribe el nombre, escoge el tipo (Seguro, Permiso, Contrato, Licencia u Otro) y la fecha de vencimiento (obligatoria). Con Tomar foto abres la cámara; con Elegir archivo(s) subes uno o varios, por ejemplo el frente y el reverso de una licencia, cada uno con su etiqueta.",
        foto: "Formulario de nuevo documento con los botones Tomar foto y Elegir archivo",
      },
      {
        titulo: "Recibe los avisos",
        texto:
          "VICTOR te avisa a los 90, 30 y 7 días antes de que venza, por notificación al celular, en su saludo diario y en la tarjeta de Alertas de Inicio. Si renuevas y cambias la fecha, los avisos empiezan de cero.",
        foto: "Lista de documentos con sus fechas y la alerta en Inicio",
      },
      {
        titulo: "Edita o elimina",
        texto: "En Editar cambias nombre, tipo o fecha, ves o borras archivos sueltos y agregas más. Eliminar documento borra todo (pide confirmar dos veces).",
        foto: "Pantalla de editar documento",
      },
    ],
    consejos: ["Por chat VICTOR puede crear el registro y la fecha, pero la foto o el PDF hay que subirlos desde esta pantalla."],
  },
  {
    id: "citas",
    grupo: "Tus finanzas personales",
    titulo: "Citas",
    icono: "ti-calendar-event",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "Anota turnos y citas (con su costo estimado) y recibe avisos el día antes y el mismo día.",
    donde: "Documentos → Citas, o la tarjeta Próxima cita en Inicio",
    pasos: [
      {
        titulo: "Crea una cita",
        texto: "Toca Nueva: título y fecha son obligatorios; hora, costo estimado y una nota son opcionales. El costo sirve para saber si necesitas llevar efectivo.",
        foto: "Formulario de nueva cita",
      },
      {
        titulo: "Recibe los avisos",
        texto: "VICTOR te avisa un día antes y el mismo día, por notificación y en su saludo diario. Si cambias la fecha o la hora, los avisos empiezan de nuevo.",
        foto: "Tarjeta Próxima cita en Inicio",
      },
      {
        titulo: "Cierra la cita",
        texto:
          "Marca Ya pasó / completada para que deje de avisar. Las citas pasadas no se borran: quedan tachadas al final para que veas cuánto costaron.",
        foto: "Lista de citas con una cita pasada tachada",
      },
      {
        titulo: "Pídeselo a VICTOR",
        texto:
          "Dile “anótame una cita con la endodoncista el jueves a las 3 pm”. También puede reagendar, marcarla completada o añadir notas nuevas sin borrar las anteriores (útil para seguimientos con el mismo médico).",
        foto: "Chat creando una cita",
      },
    ],
  },

  // ───────────────────────────── TU NEGOCIO ─────────────────────────────
  {
    id: "negocio",
    grupo: "Tu negocio",
    titulo: "Crear y configurar tu negocio",
    icono: "ti-building-store",
    audiencia: ["usuario"],
    plan: "Pro o Business",
    resumen: "Crea la entidad de tu negocio, ponle logo y datos fiscales, y activa las formas de cobro.",
    donde: "Selector de entidad → Editar negocio",
    pasos: [
      {
        titulo: "Crea tu entidad",
        texto:
          "Desde el selector de entidad arriba, toca Nueva y llena el perfil: nombre del negocio, dirección, teléfono, correo y logo. Cada entidad tiene sus propias facturas, clientes, cuentas y metas.",
        foto: "Formulario de nueva entidad, pestaña Perfil",
      },
      {
        titulo: "Completa lo fiscal",
        texto: "En la pestaña Fiscal van los datos para tus facturas e impuestos, como el tratamiento del IVU o Sales Tax y tus certificados.",
        foto: "Pestaña Fiscal del negocio",
      },
      {
        titulo: "Configura tus facturas",
        texto:
          "En la pestaña Facturas escoges tu color de marca, el pie de factura y los métodos de cobro que aceptas (ATH Móvil, transferencia, cheque, tarjeta con Stripe). Lo que configures aquí aparece en el PDF que ve tu cliente.",
        foto: "Pestaña Facturas con los métodos de cobro",
      },
      {
        titulo: "Conecta las cuentas del negocio",
        texto: "En Cuentas, asigna cada banco o tarjeta a su negocio con el selector Pertenece a:, para que los gastos no se mezclen con los personales.",
        foto: "Cuentas con el selector de negocio",
      },
    ],
    consejos: ["Si manejas más de un negocio, el selector de entidad de la barra superior es lo primero que debes revisar antes de crear una factura."],
  },
  {
    id: "facturacion",
    grupo: "Tu negocio",
    titulo: "Facturación",
    icono: "ti-file-invoice",
    audiencia: ["usuario"],
    plan: "Pro o Business",
    resumen: "Clientes, catálogo de servicios, facturas, cotizaciones, cobros y reportes en un solo portal.",
    donde: "Barra inferior → Facturas",
    pasos: [
      {
        titulo: "Registra a tu cliente",
        texto:
          "En la pestaña Clientes, toca Nuevo: nombre, correo, teléfono, dirección y, si aplica, el porcentaje de retención que ese cliente te hace. Puedes importar muchos de una vez desde un CSV o Excel (por ejemplo de FreshBooks). Un cliente se puede archivar sin perder su historial.",
        foto: "Pestaña Clientes con el botón Nuevo y la opción Importar CSV",
      },
      {
        titulo: "Arma tu catálogo de servicios",
        texto:
          "En Servicios guardas una vez cada trabajo que ofreces (nombre, descripción, precio, si lleva IVU). Después lo escoges al facturar en vez de escribirlo de cero. Cada servicio puede tener un recordatorio de seguimiento (por ejemplo, volver a verlo en 6 meses).",
        foto: "Catálogo de servicios",
      },
      {
        titulo: "Crea una factura",
        texto:
          "Toca Nueva. Escoge el cliente (el buscador te ayuda), la fecha y una o varias líneas del catálogo o libres. VICTOR calcula el IVU, la retención del cliente y el total. Puedes pedir un depósito, marcarla como recurrente (semanal, quincenal o mensual) o asignarla a un técnico.",
        foto: "Nueva factura con varias líneas y el total",
      },
      {
        titulo: "Envíala",
        texto:
          "En el detalle de la factura descarga el PDF, mándala por WhatsApp (el mensaje no lleva el monto; el cliente lo ve al abrir el PDF) o por email. Las recurrentes se generan y se envían solas en su fecha si el cliente tiene correo.",
        foto: "Detalle de factura con los botones PDF, WhatsApp y Enviar por email",
      },
      {
        titulo: "Registra el pago",
        texto:
          "Toca Registrar pago, escoge el método (ATH Móvil, ATH Móvil Business, transferencia, cheque, efectivo o tarjeta) y la fecha real. Una factura pagada ya no cambia de líneas ni de total; solo puedes corregir el método o la fecha.",
        foto: "Ventana de registrar pago con el método y la fecha",
      },
      {
        titulo: "Usa las cotizaciones",
        texto: "Una cotización funciona igual que una factura. Cuando el cliente la aprueba, la conviertes en factura con un botón, sin rehacer las líneas.",
        foto: "Cotización aprobada con el botón Convertir en factura",
      },
      {
        titulo: "Mira tus reportes",
        texto: "La pestaña Reportes resume lo facturado y lo cobrado, por cliente y por servicio, y las retenciones que te hicieron. Se exporta a PDF y Excel.",
        foto: "Pestaña Reportes",
      },
    ],
    ejemplo:
      "Ejemplo: AireFrío PR limpia el aire de un hotel. Escoge el cliente Hotel Costa Azul, agrega la línea “Mantenimiento de chiller” del catálogo, la marca recurrente mensual y envía. Cada mes se genera sola y le llega por correo.",
    consejos: [
      "Duplicar, anular, notas de crédito y recordatorios de cobro vencido están en el detalle de cada factura.",
      "El cliente puede ver sus facturas en un portal en línea con un link único.",
    ],
    preguntas: [
      { p: "Me equivoqué en una factura ya pagada.", r: "Puedes corregir el método y la fecha de pago. Para cambiar montos, anúlala y crea una nota de crédito o una factura nueva." },
    ],
  },
  {
    id: "cobros",
    grupo: "Tu negocio",
    titulo: "Cobrar: tarjeta, ATH Móvil y QR",
    icono: "ti-qrcode",
    audiencia: ["usuario"],
    plan: "Pro o Business",
    resumen: "Activa el cobro con tarjeta y ATH Móvil Business, y cobra en persona con un QR en segundos.",
    donde: "Editar negocio → pestaña Facturas · Facturas → ⚡ Cobro",
    pasos: [
      {
        titulo: "Conecta Stripe para cobrar con tarjeta",
        texto:
          "Edita tu negocio, pestaña Facturas, y toca Conectar Stripe. El dinero cae directo a tu cuenta; VICTOR no lo toca. Si Stripe aún te pide verificar identidad o cuenta bancaria, el botón dice Continuar hasta que termines.",
        foto: "Sección Cobro con tarjeta y el botón Conectar Stripe",
      },
      {
        titulo: "Activa ATH Móvil Business",
        texto:
          "Pega tu Public Token de ATH Móvil Business (en la app de ATH Business: Ajustes → Configuración de Ecommerce). Debe ser una cuenta Business; la personal no tiene esa opción.",
        foto: "Campo del Public Token de ATH Móvil",
      },
      {
        titulo: "Cobra una factura con QR",
        texto:
          "En el detalle de una factura sin pagar toca Mostrar QR para cobrar. El QR lleva el total exacto. Tu cliente lo escanea con la cámara normal del teléfono (no con la app de ATH) y escoge tarjeta o ATH Móvil.",
        foto: "Factura con el QR de cobro",
      },
      {
        titulo: "Usa Cobro rápido cuando no hay factura",
        texto: "En Facturas toca ⚡ Cobro, escribe solo el monto (el cliente es opcional) y el QR se abre al instante. VICTOR crea por debajo una factura mínima.",
        foto: "Pantalla de Cobro rápido con el monto",
      },
    ],
    consejos: [
      "El cliente puede pagar con más métodos (cuotas, ACH, Cash App) si tú los activas en tu propio panel de Stripe.",
      "El pago por ATH Móvil se verifica de verdad antes de marcar la factura como pagada.",
    ],
  },
  {
    id: "pagos",
    grupo: "Tu negocio",
    titulo: "Pagos a contratistas",
    icono: "ti-cash",
    audiencia: ["usuario"],
    plan: "Add-on de Pagos en Pro; incluido en Business",
    resumen: "Paga a tus contratistas, calcula la retención de Hacienda y saca los reportes para el 480.6SP.",
    donde: "Barra inferior → Pagos",
    pasos: [
      {
        titulo: "Agrega a tu contratista",
        texto:
          "En Contratistas, toca Nuevo: nombre, dirección postal, número de seguro social o EIN, si es individuo o corporación y su banca para pagos ACH. Si tiene Certificado de Relevo, súbelo con su fecha de expiración: sin relevo vigente no se aplica la retención reducida.",
        foto: "Formulario de nuevo contratista",
      },
      {
        titulo: "Escoge la fecha de la corrida",
        texto:
          "En la pestaña Pagos, la tarjeta Corrida de pago te deja escoger la frecuencia (semanal, bisemanal, quincenal o mensual). Marca una vez la fecha de tu corrida y VICTOR calcula las siguientes. Las flechas ‹ › mueven a la corrida anterior o siguiente y el botón verde te lleva a la próxima que te toca, sin abrir el calendario.",
        foto: "Tarjeta Corrida de pago con las flechas y el botón Próxima corrida",
      },
      {
        titulo: "Escribe los montos",
        texto:
          "Pon el monto bruto de cada contratista. VICTOR calcula la retención automáticamente (sobre lo que pasa de los primeros $500 del año) y muestra el neto. Los pagos históricos puedes importarlos de un CSV para que el acumulado no empiece en cero.",
        foto: "Corrida con montos, retención y neto por contratista",
      },
      {
        titulo: "Registra y paga",
        texto:
          "Registrar corrida guarda todo. Después puedes descargar el archivo ACH para subirlo al portal de tu banco, o copiar nombres y montos. VICTOR no manda el dinero. También puedes preparar cheques en PDF.",
        foto: "Corrida registrada con el botón Descargar archivo ACH",
      },
      {
        titulo: "Saca el reporte de retenciones",
        texto:
          "En Reportes ves lo retenido por mes y trimestre y bajas el 480.6SP del año en Excel o PDF para tu contable. El indicador de depósito te recuerda que el depósito de la retención es mensual (antes del día 15).",
        foto: "Pestaña Reportes con el resumen por contratista",
      },
    ],
    consejos: [
      "El pago se registra con la fecha que pongas: si tiras el pago el lunes aunque la corrida sea el miércoles, registra la fecha en que realmente lo enviaste.",
      "Para el trato de cada pago ante Hacienda, confirma con tu contador.",
    ],
  },
  {
    id: "nomina",
    grupo: "Tu negocio",
    titulo: "Nómina",
    icono: "ti-receipt-2",
    audiencia: ["usuario"],
    plan: "Add-on de Nómina en Pro; incluido en Business",
    resumen: "Calcula la nómina de tus empleados (W-2) de Puerto Rico: retenciones, costo patronal, talonarios y depósitos.",
    donde: "Barra inferior → Nómina",
    pasos: [
      {
        titulo: "Agrega tus empleados",
        texto:
          "En la pestaña Empleados toca Agregar empleado: nombre, últimos 4 dígitos del seguro social (nunca el número completo), frecuencia de pago, si es sueldo o por hora y su tarifa, más los datos del Formulario 499 R-4.",
        foto: "Formulario de nuevo empleado",
      },
      {
        titulo: "Corre la nómina",
        texto:
          "En Corrida escoge la frecuencia, el periodo y la fecha de pago; marca a quién le pagas y escribe horas, comisiones, bonos y otras deducciones. Toca Calcular nómina para ver retenciones del empleado, costo patronal, montos a depositar y el asiento contable.",
        foto: "Corrida de nómina con el resumen calculado",
      },
      {
        titulo: "Guarda y entrega los talonarios",
        texto:
          "Al guardar, la corrida queda en Historial. Desde ahí imprimes o guardas en PDF un talonario por empleado (con logo) o los envías por email.",
        foto: "Historial con el botón Talonarios de la corrida",
      },
      {
        titulo: "Cuida licencias y tasas",
        texto:
          "En Licencias llevas los saldos de vacaciones y enfermedad. En Tasas configuras las reglas del patrono (SUTA, CFSE, Bono de Navidad, tipos de bono). Reportes y Auditoría muestran por empleado y quién hizo qué.",
        foto: "Pestaña Tasas con las reglas del patrono",
      },
    ],
    consejos: [
      "VICTOR calcula; no radica planillas ni deposita. Varias tasas están marcadas “por confirmar” con tu contable: trata los resultados como estimados.",
      "Tu contable puede ayudarte con la nómina si le das permiso en el módulo.",
    ],
  },

  // ─────────────────────── TU EQUIPO Y TU CONTABLE ───────────────────────
  {
    id: "equipo",
    grupo: "Tu equipo y tu contable",
    titulo: "Equipo: técnicos y peajes",
    icono: "ti-users",
    audiencia: ["usuario"],
    plan: "Pro o Business (add-on de Técnicos en Pro, hasta 3)",
    resumen: "Da a tus técnicos un link con PIN para facturar y cobrar desde el celular, y controla los peajes por vehículo.",
    donde: "Barra inferior → Equipo",
    pasos: [
      {
        titulo: "Crea un técnico",
        texto:
          "En Técnicos toca Nuevo técnico: nombre, teléfono y un PIN de 4 dígitos. VICTOR genera un link personal. El PIN solo se ve esa vez; si se pierde, usa Restablecer PIN. Manda el link por WhatsApp con Reenviar link.",
        foto: "Formulario de nuevo técnico y su link personal",
      },
      {
        titulo: "Asigna trabajos",
        texto: "Al crear una factura o cotización, usa Asignar a técnico. El técnico la ve en su celular, agrega servicios, toma foto de evidencia y la firma del cliente.",
        foto: "Nueva factura con el campo Asignar a técnico",
      },
      {
        titulo: "Decide quién aprueba",
        texto:
          "Elige si las facturas del técnico salen directo al cliente o si primero pasan por ti. Las cotizaciones que el técnico arma por su cuenta siempre necesitan tu aprobación.",
        foto: "Configuración de aprobación del técnico",
      },
      {
        titulo: "Controla los peajes",
        texto:
          "En la pestaña Peajes registra tus vehículos por placa, sube el PDF de AutoExpreso del mes y VICTOR lo lee: cada cruce se vincula a su vehículo y ves cuánto gastó cada carro. No sustituye la categorización de gastos del banco.",
        foto: "Pestaña Peajes con el reporte por placa",
      },
      {
        titulo: "Mide el trabajo",
        texto: "En Reportes ves cuánto facturó y cobró cada técnico por período y por servicio.",
        foto: "Reporte por técnico",
      },
    ],
    consejos: ["El técnico nunca ve los balances ni las demás facturas de tu negocio: solo lo que le asignaste o lo que él creó."],
  },
  {
    id: "admin",
    grupo: "Tu equipo y tu contable",
    titulo: "Admin y Secretaria",
    icono: "ti-user-cog",
    audiencia: ["usuario"],
    plan: "Pro o Business",
    resumen: "Da acceso a una secretaria o administrador con su propio login, sin ver tus finanzas personales.",
    donde: "Barra inferior → Admin",
    pasos: [
      {
        titulo: "Invita a la persona",
        texto:
          "Con el negocio seleccionado (no la vista Todas), toca Añadir, escoge el nivel (Secretaria o Administrador), escribe su nombre y correo, y envía la invitación.",
        foto: "Formulario de invitar secretaria o administrador",
      },
      {
        titulo: "Ajusta sus permisos",
        texto:
          "La Secretaria siempre ve clientes, crea facturas y registra cobros; tú prendes o apagas 5 permisos extra (ver ingresos, ver gastos, cambiar precios, créditos en Hacienda y reportes de años anteriores). El Administrador los tiene todos y además ve Pagos, Metas, Bóveda y Cuentas (esta última solo para ver).",
        foto: "Permisos de la secretaria",
      },
      {
        titulo: "Ella acepta y entra",
        texto: "A la persona le llega un correo para crear su contraseña. Al entrar va directo a su portal, limitado al negocio al que la invitaste.",
        foto: "Portal de la secretaria",
      },
    ],
    consejos: ["Ninguno de los dos niveles ve jamás tus finanzas personales ni otros negocios. Puedes quitar el acceso cuando quieras desde la misma pantalla."],
  },
  {
    id: "contable",
    grupo: "Tu equipo y tu contable",
    titulo: "Invita a tu contable (CPA)",
    icono: "ti-user-check",
    audiencia: ["usuario"],
    plan: "Cualquier plan",
    resumen: "Dale a tu contador un portal de solo lectura con lo que necesita, gratis para ti y para él.",
    donde: "Inicio → Invita a tu contable",
    pasos: [
      {
        titulo: "Envía la invitación",
        texto: "Escribe el nombre (opcional) y el correo de tu contador, agrega un mensaje si quieres y toca Invitar.",
        foto: "Formulario de invitar contable",
      },
      {
        titulo: "Tu contador acepta",
        texto: "Abre el link del correo y crea su contraseña, o entra con la que ya tiene si atiende a otros clientes de VICTOR. Queda conectado automáticamente.",
        foto: "Pantalla de aceptar invitación",
      },
      {
        titulo: "Qué ve",
        texto:
          "Un portal de solo lectura: tus negocios compartidos, facturación, pagos y retenciones, el estado de resultados y reportes que puede descargar. Tú decides si también puede ver lo personal.",
        foto: "Portal del contable con la lista de clientes",
      },
    ],
    consejos: ["Estado de Resultados: en Transacciones del negocio, menú Reporte para tu contador → Ver Estado de Resultados. Es el año mes a mes por categoría, en Excel y PDF."],
  },

  // ───────────────────────────── TU CUENTA ─────────────────────────────
  {
    id: "configuracion",
    grupo: "Tu cuenta",
    titulo: "Configuración y seguridad",
    icono: "ti-settings",
    audiencia: ["usuario"],
    plan: "Todos los planes",
    resumen: "PIN, verificación en dos pasos, notificaciones, sesión, plan y eliminación de cuenta.",
    donde: "Barra inferior → Config",
    pasos: [
      {
        titulo: "Activa el PIN de bloqueo",
        texto: "Un PIN de 4 dígitos traba la pantalla de la app cada vez que la abres. Es un candado rápido; la protección real de la cuenta es la verificación en dos pasos.",
        foto: "Tarjeta de PIN de bloqueo",
      },
      {
        titulo: "Activa la verificación en dos pasos (MFA)",
        texto:
          "Toca Activar, escanea el QR con Google Authenticator o Authy y escribe el código de 6 dígitos. Se muestran 10 códigos de respaldo una sola vez: guárdalos. Usar un código de respaldo desactiva el MFA para que puedas volver a configurarlo.",
        foto: "QR de MFA y los códigos de respaldo",
      },
      {
        titulo: "Activa las notificaciones",
        texto: "Recibe avisos de documentos por vencer y gastos sin categorizar. Requiere tener VICTOR instalado como app (Agregar a pantalla de inicio).",
        foto: "Botón de notificaciones",
      },
      {
        titulo: "Elige el cierre por inactividad",
        texto: "Escoge cuánto tiempo sin usar la app antes de pedir acceso de nuevo: 15 min, 30 min, 1 hora, 4 horas o Nunca. Con PIN activo solo vuelve a pedir el PIN.",
        foto: "Selector de cierre por inactividad",
      },
      {
        titulo: "Gestiona tu plan y créditos de IA",
        texto:
          "Gestionar mi plan abre el portal de Stripe para cambiar la tarjeta, ver recibos o cancelar. Si agotas tu límite mensual de chat con VICTOR, Comprar créditos de IA añade más en un pago único; lo que no uses pasa al próximo ciclo.",
        foto: "Tarjetas de plan y de créditos de IA",
      },
      {
        titulo: "Comparte y gana",
        texto: "Invita y ganen los dos: tu link personal está aquí y en la tarjeta de Inicio.",
        foto: "Sección de referidos con tu link",
      },
      {
        titulo: "Eliminar tu cuenta",
        texto:
          "Está en la Zona de peligro, al fondo. Pide tu contraseña y escribir ELIMINAR. La suscripción se cancela al final del período pagado y tienes 30 días para arrepentirte con el botón Cancelar eliminación.",
        foto: "Zona de peligro",
      },
    ],
  },

];

export function modulosParaAudiencia(a: Audiencia | "todos"): ModuloManual[] {
  return a === "todos" ? MODULOS_MANUAL : MODULOS_MANUAL.filter((m) => m.audiencia.includes(a));
}
