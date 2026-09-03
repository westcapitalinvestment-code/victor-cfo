-- ============================================================================
-- VICTOR CFO — 0061: manual de usuario, resto de la app (3 sept 2026, pedido
-- de Joel: "creo que el manual debe incluir el funcionamiento de toda la app
-- ... transacciones, metas, boveda, cuentas y cobros, reportes ... por si un
-- usuario se tranca en un paso"). Continúa la 0060 (que cubrió Facturación,
-- Admin/Secretaria y Equipo) con los 6 módulos que faltaban.
--
-- No hace falta tocar schema ni código — consultar_manual (lib/victor/tools.ts)
-- y el system prompt ya buscan sobre TODA la tabla manual_articulos sin
-- límite de cantidad, así que estos 6 artículos quedan disponibles para
-- VICTOR en cuanto se corre esta migración.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'transacciones',
  'Transacciones — categorizar, duplicados y reporte contable',
  'Cómo ver y categorizar tus movimientos, resolver duplicados, y descargar el reporte para tu contable.',
  $md$La pantalla "Transacciones" (menú Gastos, ruta /dashboard/gastos) lista tus movimientos de todas las cuentas conectadas.

FILTROS: arriba hay "↓ Reporte para tu contable", el filtro "Cuenta:" (si tienes más de una cuenta conectada, elige varias con checkboxes), "Categoría:" (elige una o "Sin categorizar"), el interruptor grande Gastos/Ingresos, y pills de mes (o "Todo"). Debajo, una tarjeta con los totales del mes: Ingresos, Gastos y Ahorro e inversión (aparte, no cuenta como gasto).

CATEGORIZAR: cada transacción muestra su categoría como texto subrayado — tócala para abrir un buscador y elegir la correcta. El sistema también categoriza solo las que reconoce con alta confianza; mientras más corrijas a mano, más aprende. Las que quedan "Sin categorizar" siempre se muestran (no se limitan al mes) porque son pendientes por resolver — también aparecen en una tarjeta aparte en Inicio.

CATEGORÍA PERSONALIZADA: dentro del filtro "Categoría:", botón "+ Añadir categoría" — escribe el nombre y "Crear".

POSIBLES DUPLICADOS: si subiste un CSV/PDF de un banco y luego conectaste ese mismo banco por Plaid, puede quedar la misma transacción dos veces. VICTOR las detecta solas y las excluye de tus totales; revísalas en "N posible(s) duplicado(s) →" arriba del título. Si una NO es duplicado de verdad, el botón "No es duplicado" la regresa a la lista normal.

REPORTE PARA TU CONTABLE: dropdown con rangos rápidos (Este mes, Mes anterior, Trimestre, YTD, Año anterior, Todo) o un rango personalizado — descarga un CSV con fecha, descripción, categoría, línea de Anejo M/Schedule C y monto, listo para tu CPA.

PENDIENTES: una transacción marcada "⏳ Pendiente" es un estimado del banco que todavía puede cambiar de monto o descripción cuando el banco la liquide — no es un error de VICTOR.$md$
),
(
  'cuentas',
  'Cuentas — conectar bancos, cuentas manuales y estados de cuenta',
  'Cómo conectar un banco con Plaid, añadir una cuenta manual, subir un estado de cuenta y reconectar un banco caído.',
  $md$La pantalla "Cuentas" (/dashboard/cuentas) es donde conectas y administras tus bancos y tarjetas.

CONECTAR UN BANCO (Plaid): botón "Conectar banco" (requiere plan Core o superior — en plan Gratis muestra la oferta de upgrade). Antes de abrir la ventana de conexión te pregunta si prefieres traer el historial completo del año o solo desde hoy — recomendado traer el año completo para tener todo listo para las planillas.

CUENTA MANUAL (ej. Apple Card, o cualquier cuenta sin integración): sección "Cuentas manuales" → "+ Añadir cuenta manual" — pide nombre, tipo (banco, tarjeta de crédito, préstamo, inversión) y balance actual. Se puede editar o eliminar en cualquier momento (eliminar borra también las transacciones importadas a esa cuenta).

SUBIR ESTADO DE CUENTA: botón "Subir estado de cuenta" en cualquier cuenta (Plaid o manual), para rellenar historial que el banco no trajo completo. Dos formas: CSV/QuickBooks (gratis, tú mapeas las columnas de fecha/descripción/monto) o PDF (requiere Core, VICTOR lee el PDF del banco con IA automáticamente, tú solo revisas y quitas filas que no apliquen).

RECONECTAR UN BANCO: si un banco pierde la conexión (cambiaste tu contraseña, venció un código), aparece un aviso rojo arriba con botón "Reconectar" — abre el mismo flujo de conexión para renovar el acceso, sin perder historial.

CUENTA DE NEGOCIO: VICTOR detecta solo, por el nombre, si una cuenta parece de negocio. Si tienes varias entidades de negocio (plan Pro), puedes asignar cada cuenta a la entidad correcta con el selector "Pertenece a:" en cada cuenta.

RENOMBRAR: en cuentas de Plaid, el botón "Renombrar" cambia solo el apodo que ves en VICTOR (nunca el nombre real del banco). Para dejar de ver un banco completo, usa "Desconectar" en la lista de Bancos conectados.$md$
),
(
  'metas',
  'Metas — ahorrar para un objetivo, personal o de negocio',
  'Cómo crear una meta de ahorro, actualizar el progreso, y hacerlo hablando con VICTOR en vez de la pantalla.',
  $md$"Metas" (/dashboard/metas, o /dashboard/negocio/metas para metas del negocio) te deja fijar objetivos de ahorro con progreso visible.

CREAR: botón "+ Nueva" — pide nombre de la meta, monto objetivo, y opcionalmente cuánto ya tienes ahorrado. "Guardar meta".

ACTUALIZAR PROGRESO: entra a "Editar / eliminar" desde la meta y cambia el campo "Ya tienes ahorrado" al nuevo TOTAL acumulado (no es sumar, es reemplazar por el total). También puedes eliminar la meta ahí (pide tocar "Eliminar meta" dos veces para confirmar).

METAS DE NEGOCIO: requieren tener al menos una entidad de negocio creada, y ver una entidad específica seleccionada arriba (no "Todas").

HABLANDO CON VICTOR: puedes decirle directamente "quiero ahorrar $5,000 para vacaciones en diciembre" o "le añadí $100 al fondo de emergencia" y VICTOR crea o actualiza la meta por ti — de hecho es la ÚNICA forma de ponerle fecha límite a una meta, porque la pantalla no tiene ese campo.$md$
),
(
  'boveda',
  'Bóveda — documentos con fecha de vencimiento',
  'Cómo guardar licencias, pólizas y permisos, y recibir avisos antes de que venzan.',
  $md$La "Bóveda" (/dashboard/documentos, o /dashboard/negocio/documentos para negocio) guarda documentos importantes con fecha de vencimiento — licencias, permisos, pólizas de seguro, contratos, marbete, etc.

SUBIR UN DOCUMENTO: "Nuevo documento" — nombre, tipo (Seguro, Permiso, Contrato, Licencia, Otro) y fecha de vencimiento (obligatoria). Puedes tomar la foto directo con "📷 Tomar foto" (abre la cámara del celular) o elegir uno o varios archivos con "📁 Elegir archivo(s)" — por ejemplo el frente y el reverso de una licencia, cada uno con su propia etiqueta opcional ("Frente", "Página 2"). Los archivos son opcionales al crear — se pueden subir después desde Editar.

AVISOS: recibes un aviso a los 90, 30 y 7 días antes de que venza un documento — por notificación push al celular y en el saludo diario de VICTOR, además de la tarjeta "Alertas" en Inicio. Si renuevas el documento y cambias la fecha, el ciclo de avisos arranca de cero.

EDITAR: cambia nombre, tipo o fecha, ve/borra archivos individuales, o añade más. "Eliminar documento" borra todo (pide confirmar dos veces).

HABLANDO CON VICTOR: puedes pedirle que cree el registro y ponga la fecha de vencimiento por chat, pero la foto o el PDF del documento hay que subirlos desde la pantalla — eso no se puede hacer por chat.$md$
),
(
  'pagos',
  'Pagos — pagar a contratistas y calcular la retención 480.6',
  'Cómo añadir contratistas, registrar una corrida de pago con retención automática, y sacar el reporte trimestral para el 480.6A/B. Plan Pro.',
  $md$"Pagos" (dentro del negocio, plan Pro) es para pagarle a tus contratistas y calcular la retención de Hacienda. Tiene 3 pestañas: Pagos, Contratistas, Reportes.

AÑADIR CONTRATISTA: pestaña Contratistas → "+ Nuevo" — nombre (obligatorio), Tax ID/SSN (opcional), y tipo: 480.6B (sujeto a retención, con su % — normalmente 10%) o 480.6A (exento, 0% automático). Se puede editar o "Archivar" (no se elimina, para no perder su historial).

CORRIDA DE PAGO: pestaña Pagos → tarjeta "Corrida de pago" — pones el monto bruto a cada contratista que le vas a pagar ese día, la retención se calcula sola (editable si hace falta un % distinto puntual), y ves el neto. "Registrar corrida" guarda todo. IMPORTANTE: VICTOR no manda el dinero ni genera un archivo ACH — solo calcula los montos; después de guardar te da una tarjeta con botón "Copiar" para pegar los nombres y montos directo en el portal ACH de tu banco (BPPR).

REPORTE TRIMESTRAL: pestaña Reportes — resumen bruto/retenido/neto por período y por contratista, exportable a PDF o CSV. Es lo que le entregas a tu CPA para el 480.6A/B.

VALIDACIÓN 480 (nombre/dirección/tax ID): esa casilla todavía no tiene pantalla para que tú la llenes — hoy solo la ve tu CPA (de solo lectura) en su portal, y siempre va a mostrar "Faltan datos" porque no hay forma de confirmarlo desde la app todavía.$md$
),
(
  'reportes-hacienda',
  'Reportes y Hacienda — IVU, créditos y pagos estimados',
  'Qué existe hoy en VICTOR sobre IVU, créditos en Hacienda y pagos estimados trimestrales, y qué todavía no tiene pantalla propia.',
  $md$Esto reúne los reportes fiscales que no son de Facturación ni de Pagos.

CRÉDITOS EN HACIENDA: tarjeta dentro de Facturación (portal del negocio) y en su pestaña Reportes — muestra el total que tus CLIENTES te han retenido y depositado a tu nombre en las facturas del período. Es el reflejo opuesto de la retención 480.6 de Pagos (ahí eres tú reteniendo a tus contratistas).

IVU (semáforo de cuadre): existe como pantalla, pero SOLO en el portal de tu contador (de solo lectura) — compara lo declarado en SURI contra tus depósitos bancarios. Hoy no hay ninguna forma de cargarle datos desde la app, así que siempre va a aparecer vacío. Si necesitas esto, coordínalo directamente con tu CPA por ahora.

PAGOS ESTIMADOS TRIMESTRALES: no hay pantalla de registro. Lo que sí existe es una sugerencia automática en Inicio ("Acciones recomendadas → Reserva de impuestos") que calcula el 25% de tu ganancia de negocio como referencia de cuánto apartar, y VICTOR te avisa por chat cuando conviene recordarte que en PR estos pagos vencen en abril, junio, septiembre y enero — siempre aclarando que es un estimado, no el monto exacto que determina tu CPA.

ANEJO M / MODELO 480.20-482: no existe un botón para generar esas planillas oficiales. Lo que sí tienes como apoyo para que tu CPA las llene: el CSV de "Reporte para tu contable" en Transacciones (ya trae la línea de Anejo M/Schedule C por cada movimiento) y el reporte de Pagos para el 480.6A/B.$md$
);
