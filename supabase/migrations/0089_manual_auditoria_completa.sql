-- ============================================================================
-- VICTOR CFO — 0089: auditoría completa del manual consultable de VICTOR
-- (14 sept 2026, pedido de Joel: "quiero tener un producto completo con su
-- manual de usuario y que Victor lo conozca todo al detalle y sin
-- errores"). Root cause del pedido: 0088 arregló un hueco puntual (VICTOR
-- confundía los adjuntos de evidencia en Facturación con la Bóveda), y eso
-- destapó que el manual llevaba desde el 3-6 sept sin revisarse contra el
-- código real mientras la app seguía creciendo — 4 auditorías en paralelo
-- (Personal, Negocio, Admin/Técnico, Cuenta/Sistema) verificaron los 14
-- artículos existentes línea por línea contra el código y encontraron
-- afirmaciones desactualizadas o directamente falsas (ej. "exportable a
-- CSV" cuando ya no existe CSV, solo Excel/PDF; "reenviar por email" en
-- Facturación cuando ese botón no existe para una factura suelta), además
-- de 6 módulos reales sin ningún artículo (Citas, Categorías, Estado de
-- Resultados, Programa de Socios, Configuración general, Invitar a tu
-- contable/CPA).
--
-- Esta migración deja el manual en 20 artículos: 10 corregidos, 6 nuevos,
-- y 4 sin cambios porque ya estaban precisos y completos (metas, mfa,
-- referidos, equipo-vehiculos-peajes). A propósito NO se documenta el CFO
-- founder dashboard (herramienta interna de Joel con datos de todos los
-- usuarios — filtrar su existencia a un cliente sería un problema de
-- privacidad), y a propósito NO se tocan los 5 permisos adicionales de
-- Secretaria que hoy no hace cumplir ninguna pantalla real (se documenta
-- la limitación honestamente en vez de prometer algo que no existe).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- ARTÍCULOS CORREGIDOS (contenido reemplazado por completo)
-- ----------------------------------------------------------------------------

UPDATE manual_articulos
SET
  titulo = 'Transacciones — categorizar, buscar, duplicados y reporte contable',
  resumen = 'Cómo ver y categorizar tus movimientos, buscar una transacción puntual, gestionar categorías, resolver duplicados, y descargar el reporte para tu contable.',
  contenido = $md$La pantalla "Transacciones" (menú Gastos, ruta /dashboard/gastos) lista tus movimientos de todas las cuentas conectadas.

FILTROS: arriba hay "↓ Reporte para tu contador", el filtro "Cuenta:" (si tienes más de una cuenta conectada, elige varias con checkboxes), "Categoría:" (elige una o "Sin categorizar"), el interruptor grande Gastos/Ingresos, y pills de mes (o "Todo"). Debajo, una tarjeta con los totales del mes: Ingresos, Gastos y Ahorro e inversión (aparte, no cuenta como gasto).

CATEGORIZAR: cada transacción muestra su categoría como texto subrayado — tócala para abrir un buscador y elegir la correcta. El sistema también categoriza solas las que reconoce con alta confianza; mientras más corrijas a mano, más aprende. Las que quedan "Sin categorizar" siempre se muestran (no se limitan al mes) porque son pendientes por resolver — también aparecen en una tarjeta aparte en Inicio.

CATEGORÍA PERSONALIZADA: dentro del filtro "Categoría:", botón "+ Añadir categoría" — escribe el nombre y "Crear". Ese mismo menú tiene, al fondo, "⚙ Gestionar categorías (fusionar, renombrar, eliminar)" — te lleva a /dashboard/categorias, donde puedes arreglar duplicados como "Telefonica" y "Telefonia" fusionando una hacia la otra.

BUSCAR UNA TRANSACCIÓN: debajo de los filtros hay un buscador ("Buscar por nombre o monto..."). Busca por texto en la descripción o, si escribes un número (ej. "245" o "245.00"), también por monto aproximado (±$0.50) — útil cuando el banco no dice nada reconocible ("PAYPAL *INST XFER"). La búsqueda ignora a propósito el mes/categoría/tipo activos: revisa TODO tu historial (hasta 500 resultados) para que encuentres una transacción sin importar dónde quedó categorizada o en qué mes cayó.

POSIBLES DUPLICADOS: si subiste un CSV/PDF de un banco y luego conectaste ese mismo banco por Plaid, puede quedar la misma transacción dos veces. VICTOR las detecta solas y las excluye de tus totales; revísalas en "N posible(s) duplicado(s) →" arriba del título. Si una NO es duplicado de verdad, el botón "No es duplicado" la regresa a la lista normal.

REPORTE PARA TU CONTADOR: dropdown con rangos rápidos (Este mes, Mes anterior, Trimestre, YTD, Año anterior para planillas, Todo) o un rango personalizado con fecha Desde/Hasta — cada uno con dos botones de descarga, Excel y PDF, con la marca VICTOR CFO y columnas de fecha, descripción, categoría, línea de Anejo M/Schedule C, tipo (Gasto/Ingreso/Transferencia) y monto, listos para tu CPA.

PENDIENTES: una transacción marcada "⏳ Pendiente" es un estimado del banco que todavía puede cambiar de monto o descripción cuando el banco la liquide — no es un error de VICTOR.$md$,
  updated_at = now()
WHERE slug = 'transacciones';


UPDATE manual_articulos
SET
  titulo = 'Cuentas — conectar bancos, cuentas manuales, estados de cuenta y su historial',
  resumen = 'Cómo conectar un banco con Plaid, añadir/editar/eliminar una cuenta manual, subir y deshacer un estado de cuenta, ver el historial de subidas, y reconectar un banco caído.',
  contenido = $md$La pantalla "Cuentas" (/dashboard/cuentas) es donde conectas y administras tus bancos y tarjetas.

CONECTAR UN BANCO (Plaid): botón "Conectar banco" (requiere plan Core o superior — en plan Gratis muestra la oferta de upgrade). Antes de abrir la ventana de conexión te pregunta si prefieres traer el historial completo del año o solo desde hoy — recomendado traer el año completo para tener todo listo para las planillas.

CUENTA MANUAL (ej. Apple Card, o cualquier cuenta sin integración): sección "Cuentas manuales" → "+ Añadir cuenta manual" — pide nombre, tipo (banco, tarjeta de crédito, préstamo, inversión) y balance actual. Tocar el balance directamente lo deja actualizar rápido con un solo número; el botón "Editar" abre un formulario completo para corregir nombre, tipo, balance, o (si tienes entidades de negocio) reasignarla a otra entidad, todo junto. "Eliminar" la borra por completo — también borra las transacciones que hayas importado a esa cuenta — y pide confirmar.

SUBIR ESTADO DE CUENTA: botón "Subir estado de cuenta" en cualquier cuenta (Plaid o manual), para rellenar historial que el banco no trajo completo. Dos formas: CSV/QuickBooks (gratis, tú mapeas las columnas de fecha/descripción/monto) o PDF (requiere Core, VICTOR lee el PDF del banco con IA y extrae balance/APR/pago mínimo si el PDF los trae; tú revisas la lista y quitas filas que no apliquen antes de confirmar). Justo después de importar, si te equivocaste de cuenta, hay un botón "¿Subiste esto a la cuenta equivocada? Deshacer" que borra esa tanda completa al instante.

VER ESTADOS SUBIDOS: botón "Ver estados subidos" en cualquier cuenta — abre el historial de cada CSV/PDF que le has subido (fecha, cuántas transacciones importó, duplicadas que se saltó, y si el PDF trajo APR/balance/pago mínimo), con un botón "Borrar" en cada fila para deshacer una importación vieja en cualquier momento, no solo justo después de subirla.

RECONECTAR UN BANCO: si un banco pierde la conexión (cambiaste tu contraseña, venció un código), aparece un aviso rojo arriba con botón "Reconectar" — abre el mismo flujo de conexión para renovar el acceso, sin perder historial.

CUENTA DE NEGOCIO: VICTOR detecta solo, por el nombre, si una cuenta parece de negocio. Si tienes varias entidades de negocio (plan Pro), puedes asignar cada cuenta a la entidad correcta con el selector "Pertenece a:" en cada cuenta (Plaid o manual).

RENOMBRAR, SINCRONIZAR Y DESCONECTAR: en cuentas de Plaid, "Renombrar" cambia solo el apodo que ves en VICTOR (nunca el nombre real del banco). El botón "Sincronizar transacciones" (abajo de la pantalla) fuerza traer lo más nuevo de todos tus bancos conectados en ese momento, sin esperar la sincronización automática nocturna. "Desconectar", en la lista de Bancos conectados, te pregunta si además quieres borrar el historial ya importado de ese banco o conservarlo como referencia.$md$,
  updated_at = now()
WHERE slug = 'cuentas';


UPDATE manual_articulos
SET
  resumen = 'Cómo guardar licencias, pólizas y permisos, recibir avisos antes de que venzan, y llegar a Citas desde la misma pantalla.',
  contenido = $md$La "Bóveda" (/dashboard/documentos, o /dashboard/negocio/documentos para negocio) guarda documentos importantes con fecha de vencimiento — licencias, permisos, pólizas de seguro, contratos, marbete, etc. Arriba de la lista hay dos pestañas, "Documentos" y "Citas →" — viven juntas porque ambas generan avisos con la misma lógica de días antes de una fecha.

SUBIR UN DOCUMENTO: "Nuevo documento" — nombre, tipo (Seguro, Permiso, Contrato, Licencia, Otro) y fecha de vencimiento (obligatoria). Puedes tomar la foto directo con "📷 Tomar foto" (abre la cámara del celular) o elegir uno o varios archivos con "📁 Elegir archivo(s)" — por ejemplo el frente y el reverso de una licencia, cada uno con su propia etiqueta opcional ("Frente", "Página 2"). Los archivos son opcionales al crear — se pueden subir después desde Editar.

AVISOS: recibes un aviso a los 90, 30 y 7 días antes de que venza un documento — por notificación push al celular y en el saludo diario de VICTOR, además de la tarjeta "Alertas" en Inicio. Si renuevas el documento y cambias la fecha, el ciclo de avisos arranca de cero.

EDITAR: cambia nombre, tipo o fecha, ve/borra archivos individuales, o añade más. "Eliminar documento" borra todo (pide confirmar dos veces).

HABLANDO CON VICTOR: puedes pedirle que cree el registro y ponga la fecha de vencimiento por chat, pero la foto o el PDF del documento hay que subirlos desde la pantalla — eso no se puede hacer por chat.$md$,
  updated_at = now()
WHERE slug = 'boveda';


UPDATE manual_articulos
SET
  contenido = $md$Facturación vive en la pestaña "Facturas" del negocio (plan Pro/Pro+, una entidad de negocio activa). Es un portal con varias pestañas: Facturas, Cotizaciones, Clientes, Servicios, Reportes.

CLIENTES: antes de facturar hace falta un cliente — nombre, email, teléfono, dirección, y si aplica, el % de retención que ese cliente te hace (6%, 10%, o relevo total). Se pueden importar en lote desde un CSV o Excel de FreshBooks. Un cliente se puede archivar (no aparece más en los selectores) sin perder su historial, y solo se puede eliminar si nunca tuvo facturas ni cotizaciones.

IMPORTAR FACTURAS HISTÓRICAS: botón "Importar CSV" arriba de la lista de facturas (pestaña Facturas), con "Ver importaciones" al lado para revisar o borrar por completo una importación anterior. Es para subir de una vez todo lo que ya facturaste ANTES de empezar a usar VICTOR — sin esto, los reportes y análisis de VICTOR solo ven lo creado dentro de la app desde que la empezaste a usar. Se sube una hoja (Excel o CSV, de FreshBooks/QuickBooks o armada a mano) y se mapean las columnas — solo 3 son obligatorias: cliente, fecha de emisión y monto (subtotal). El resto (número de factura, fecha de vencimiento, % de retención, % de IVU, total ya calculado, estado, fecha de pago) es opcional. Si un cliente de la hoja no existe todavía, VICTOR lo crea solo. No duplica si subes el mismo archivo dos veces (compara cliente + número de factura). Si tu archivo es un reporte de "Pagos recibidos" de FreshBooks (varias filas por el mismo pago — una con el monto cobrado, otra con la retención), hay un checkbox especial que agrupa esas filas por número de factura y marca todo como pagado de una vez, en vez del modo normal de una fila por factura.

SERVICIOS (catálogo): cada servicio que ofreces se guarda una vez (nombre, descripción, precio, tipo — precio fijo, por hora, por proyecto o recurrente — y si aplica IVU) y se reutiliza al armar una factura o cotización en vez de escribir todo de cero cada vez.

NUEVA FACTURA: se eligen cliente, fecha, y una o varias líneas (del catálogo de Servicios o libres, con nombre + descripción + cantidad + precio). El sistema calcula IVU (si la entidad lo cobra), retención del cliente (si aplica), y el total. Se puede pedir un depósito. Se puede marcar "¿Es recurrente?" (semanal/quincenal/mensual) — VICTOR genera sola la próxima factura en su fecha y, si el cliente tiene email guardado, se la manda automáticamente por correo y queda "enviada" (si no tiene email, la deja en borrador para enviarla a mano, por ejemplo por WhatsApp). También se puede asignar a un técnico del módulo Equipo, si el addon de Técnicos está activo.

ENVIAR: desde el detalle de la factura hay botones para descargar el PDF y reenviarla por WhatsApp (abre un link con el mensaje ya escrito, sin el monto — el cliente lo ve al abrir el PDF). IMPORTANTE: hoy NO hay un botón para mandar una factura puntual por correo desde la pantalla — el único envío automático por email es el de facturas recurrentes (ver NUEVA FACTURA). Para una factura de una sola vez, el email se manda a mano por fuera de VICTOR, o se usa WhatsApp / descarga de PDF. Si la entidad tiene Stripe activo (ver cobro con tarjeta), aparece también el botón "💳 Cobrar con tarjeta" para generar un link de pago real que el cliente paga ahí mismo — la factura se marca pagada sola cuando el cliente paga.

EVIDENCIA DEL TRABAJO (botones Foto/Añadir): en el detalle de una factura o cotización hay una sección aparte llamada "Evidencia del trabajo". El botón 📷 Foto abre la cámara del celular directamente; el botón 📁 Añadir deja escoger uno o varios archivos ya guardados en el teléfono (fotos o PDF). Sirve para adjuntar evidencia del trabajo hecho (fotos del servicio, recibos, etc.) directamente a ESA factura o cotización específica. IMPORTANTE: esto NO es la Bóveda — la Bóveda es para documentos generales del negocio con fecha de vencimiento (licencias, pólizas); estos adjuntos viven pegados a la factura/cotización y cualquiera con acceso a ella los ve ahí mismo, sin fecha de vencimiento ni alertas.

REGISTRAR PAGO: en el detalle de la factura, botón "Registrar pago" — se elige método (ATH Móvil, ATH Móvil Business, Transferencia, Cheque, Efectivo, Tarjeta, Otro) y fecha real del pago. Una vez pagada, el método y la fecha se pueden corregir después con el botón "Editar" que aparece junto al método de pago mostrado en la factura — pero la pantalla completa de "Editar factura" (cliente, líneas, montos) queda bloqueada por completo en cuanto la factura está pagada, con el mensaje "Esta factura ya está pagada — no se puede editar. Si algo está mal, contacta soporte", por integridad contable.

COTIZACIONES: mismo flujo que Nueva Factura, pero termina en "aprobada" o "rechazada" según el cliente; una cotización aprobada se convierte en factura con un botón, sin tener que rehacer las líneas.

REPORTES: dentro del mismo portal, filtros por período (este mes, trimestre, este año, todo, o rango personalizado) y filtros avanzados por cliente, servicio, categoría, estado o email — con distintas "vistas" del mismo resumen: por cliente, por servicio, por categoría, cliente+servicio, retenciones para SURI, o flujo de cobro. Muestra facturado/cobrado, créditos en Hacienda (lo que tus clientes te retuvieron), y gasto de procesamiento de pagos (ATH Móvil Business/Stripe) — exportable a PDF y a Excel, ambos con el logo del negocio y la marca VICTOR CFO.$md$,
  updated_at = now()
WHERE slug = 'facturacion';


UPDATE manual_articulos
SET
  contenido = $md$"Pagos" (dentro del negocio, plan Pro) es para pagarle a tus contratistas y calcular la retención de Hacienda. Tiene 3 pestañas: Pagos, Contratistas, Reportes.

AÑADIR CONTRATISTA: pestaña Contratistas → "+ Nuevo" — nombre (obligatorio), Tax ID/SSN (opcional), y tipo: 480.6B (sujeto a retención, con su % — normalmente 10%) o 480.6A (exento, 0% automático). Se puede editar o "Archivar" (no se elimina, para no perder su historial).

CORRIDA DE PAGO: pestaña Pagos → tarjeta "Corrida de pago" — pones el monto bruto a cada contratista que le vas a pagar ese día, la retención se calcula sola (editable si hace falta un % distinto puntual), y ves el neto. "Registrar corrida" guarda todo. IMPORTANTE: VICTOR no manda el dinero ni genera un archivo ACH — solo calcula los montos; después de guardar te da una tarjeta con botón "Copiar" para pegar los nombres y montos directo en el portal ACH de tu banco (BPPR).

ADJUNTAR FACTURA DEL CONTRATISTA: junto a cada contratista en la Corrida de pago hay un ícono de clip — tócalo para adjuntar la factura o comprobante que te dio el contratista por ese pago (foto o PDF). Se puede adjuntar al momento de armar la corrida o después, volviendo a entrar a esa corrida ya guardada. El número junto al clip muestra cuántos archivos ya tiene esa retención. Queda guardado junto a esa corrida de pago, para tu récord y el de tu CPA — tampoco tiene que ver con la Bóveda.

REPORTE TRIMESTRAL: pestaña Reportes — filtros por trimestre (con selector Q1-Q4 y año) o rango personalizado, y por contratista específico o todos. Resumen bruto/retenido/neto por período, exportable a PDF o a Excel (con logo y marca VICTOR CFO) — es lo que le entregas a tu CPA para el 480.6A/B.

VALIDACIÓN 480 (nombre/dirección/tax ID): esa casilla todavía no tiene pantalla para que tú la llenes — hoy solo la ve tu CPA (de solo lectura) en su portal, y siempre va a mostrar "Faltan datos" porque no hay forma de confirmarlo desde la app todavía.$md$,
  updated_at = now()
WHERE slug = 'pagos';


UPDATE manual_articulos
SET
  contenido = $md$Equipo le da a un técnico de campo (plomero, electricista, instalador, etc.) su propio link para completar y cobrar un trabajo desde su celular, sin necesitar cuenta ni contraseña — solo un PIN de 4 dígitos. Vive en "Equipo" (menú del negocio, plan Pro/Pro+), con 5 pestañas: Panel, Técnicos, Gastos, Peajes, Reportes.

PANEL: lo que está pasando hoy — 3 métricas (facturado hoy, cobrado hoy, pendientes por aprobar), chips para filtrar por técnico, la lista "Trabajos de hoy" con botón "Aprobar y enviar" en cada factura marcada como pendiente de revisión, cotizaciones que un técnico ya tiene asignadas y listas para convertir en factura en el trabajo, cotizaciones NUEVAS que un técnico armó desde cero y esperan tu aprobación (con opción de aprobar, ver detalle, o rechazar), y un roster corto de "Tu equipo" con cuántos trabajos hizo cada técnico hoy.

CÓMO CREAR UN TÉCNICO: pestaña Técnicos → "+ Nuevo técnico". Se pide nombre, teléfono, y un PIN de 4 dígitos (se puede vincular a un contratista que ya esté guardado en Pagos, para que la retención 480.6 salga a nombre de la misma persona). Al crearlo, VICTOR genera un link personal único para ese técnico — ese es el ÚNICO momento en que se puede ver el PIN en claro; si se pierde, hay que "Restablecer PIN" para generar uno nuevo. El link se manda por WhatsApp con el botón "Reenviar link".

CÓMO ES LA PANTALLA DEL TÉCNICO (portal aparte, /tecnico): no es parte del dashboard normal del dueño — no tiene topbar, bottom nav, ni el PIN de bloqueo de la app; es una pantalla aparte, pensada para el celular, a la que se llega solo con el link personal de ese técnico. Sin sesión activa, pide su PIN de 4 dígitos en un teclado numérico; si se equivoca 5 veces seguidas, la pantalla se bloquea con "Demasiados intentos. Pide al dueño del negocio que revise tu link o PIN" — no se desbloquea sola, hay que "Restablecer PIN" desde Técnicos. Si ya inició sesión antes, reabrir el link no le vuelve a pedir el PIN (queda una sesión guardada). Un botón "Salir" cierra esa sesión.

QUÉ VE EL TÉCNICO AL ENTRAR: "Hola, {su nombre}" y el nombre del negocio; si el modo de aprobación está en "manual", un aviso fijo: "Cada factura que completes se envía primero al dueño para aprobación antes de salir al cliente." Desde ahí tiene hasta 4 accesos según los permisos que le diste: "Nueva factura" (siempre visible), "Cobrar" (solo si tiene permiso de cobrar facturas vencidas), "Cotizar algo nuevo" (siempre visible), y "Reportar gasto" (solo si configuraste al menos un tipo de gasto con evidencia en la pestaña Gastos). Debajo ve dos listas propias — "Cotizaciones aprobadas" (listas para convertir en factura con un botón "Empezar") y "Tus tareas asignadas" (facturas que le dejaste ya armadas) — nunca ve tareas de otro técnico ni del dueño.

CREAR UNA FACTURA DESDE SU CELULAR: escoge o busca el cliente (solo puede CREAR uno nuevo si tiene ese permiso), añade ítems del catálogo de servicios (precio automático) o uno libre con descripción/cantidad/precio. Si NO tiene permiso de ver precios, no ve ni los precios ni el total — solo las descripciones. Un descuento solo lo puede aplicar si tiene ese permiso, y el sistema lo topa solo al % máximo que le configuraste (no deja escribir más aunque lo intente). Puede tomar foto de evidencia y capturar la firma del cliente dibujándola con el dedo — pero el sistema NO exige foto ni firma para enviar, solo que haya al menos un ítem. El botón final dice "Enviar para aprobación" (modo manual) o "Finalizar y enviar al cliente" (modo automático); en modo automático, justo después le sale un mini-formulario "¿Ya cobraste?" para marcarla pagada ahí mismo.

COBRAR UNA FACTURA VENCIDA (con ese permiso): busca al cliente, ve TODAS sus facturas pendientes de cobro (enviada, vista o vencida — no solo las técnicamente vencidas), de CUALQUIER técnico o del dueño, escoge cuál y el método, y confirma. Cobrar una factura que él mismo acaba de completar siempre se permite, tenga o no ese permiso.

COTIZAR ALGO NUEVO: mismo patrón que una factura pero sin evidencia, firma, ni cobro — y SIEMPRE termina esperando la aprobación del dueño antes de mandarse al cliente, sin importar el modo automático/manual.

APROBACIÓN (lo que configura el dueño): eliges si las facturas del técnico salen directo al cliente (automático) o pasan primero por tu revisión (manual) — configurable en general o por técnico específico. Las cotizaciones armadas por el técnico desde cero SIEMPRE necesitan tu aprobación, sin importar el modo.

GASTOS (evidencia de gastos del técnico + reconciliación bancaria): pestaña Gastos, para negocios donde un técnico puede pasar un gasto (ej. gasolina de su carro) como si fuera de la tarjeta corporativa. Tú configuras primero qué "tipos de gasto" requieren evidencia (ej. Gasolina, Peajes, Materiales) y opcionalmente los vinculas a una categoría de Hacienda para que VICTOR los compare automático contra las transacciones reales del banco. Desde su celular, el técnico reporta cada gasto con tipo, monto, fecha, nota opcional, y una foto de la factura/recibo (la foto SÍ es obligatoria ahí) — el sistema intenta emparejarlo solo contra la transacción del banco apenas se sube. Aquí, del lado del dueño, ves la lista de evidencia por técnico con estado "✓ Casó con el banco" o "Pendiente de casar", y una tarjeta de alerta roja "Sin evidencia" con las transacciones bancarias en esas categorías que NINGÚN técnico respaldó — la bandera real para detectar mal uso.

PEAJES: pestaña Peajes — ver artículo aparte "equipo-vehiculos-peajes". Es un sistema totalmente separado de Gastos: Peajes se basa en el estado de cuenta oficial de AutoExpreso por placa, mientras que Gastos depende de que el técnico se acuerde de reportar con foto.

REPORTES: pestaña Reportes — cuánto facturó y cobró cada técnico, por período y por servicio.

LO QUE EL TÉCNICO NUNCA VE: balances de cuentas bancarias, otras facturas fuera de lo suyo, información de otros técnicos, ni nada de las finanzas del dueño — todas las consultas filtran siempre por su propio id (la única excepción es cobrar facturas vencidas de otros, y solo con ese permiso puntual).

COSTO Y TOPE: $20/mes, hasta 3 técnicos activos incluidos.$md$,
  updated_at = now()
WHERE slug = 'equipo-tecnicos';


UPDATE manual_articulos
SET
  contenido = $md$Esto reúne los reportes fiscales que no son de Facturación ni de Pagos.

CRÉDITOS EN HACIENDA: tarjeta dentro de Facturación (portal del negocio) y en su pestaña Reportes — muestra el total que tus CLIENTES te han retenido y depositado a tu nombre en las facturas del período. Es el reflejo opuesto de la retención 480.6 de Pagos (ahí eres tú reteniendo a tus contratistas).

IVU (semáforo de cuadre): existe como pantalla, pero SOLO en el portal de tu contador (de solo lectura) — compara lo declarado en SURI contra tus depósitos bancarios. Hoy no hay ninguna forma de cargarle datos desde la app, así que siempre va a aparecer vacío. Si necesitas esto, coordínalo directamente con tu CPA por ahora.

PAGOS ESTIMADOS TRIMESTRALES: no hay pantalla de registro. Lo que sí existe es una sugerencia automática en Inicio ("Acciones recomendadas → Reserva de impuestos") que calcula el 25% de tu ganancia de negocio como referencia de cuánto apartar, y VICTOR te avisa por chat cuando conviene recordarte que en PR estos pagos vencen en abril, junio, septiembre y enero — siempre aclarando que es un estimado, no el monto exacto que determina tu CPA.

ANEJO M / MODELO 480.20-482: no existe un botón para generar esas planillas oficiales. Lo que sí tienes como apoyo para que tu CPA las llene: el Excel o PDF de "Reporte para tu contador" en Transacciones (ya trae la línea de Anejo M/Schedule C por cada movimiento) y el reporte de Pagos para el 480.6A/B.

ESTADO DE RESULTADOS: si necesitas ver ingresos y gastos de un negocio mes a mes en una sola tabla (para tu CPA o para entender el año completo), eso vive en su propia pantalla — ver artículo "estado-resultados". No hay todavía un "Paquete para el contable" automático (PDF+Excel combinando todo) — eso sigue en el roadmap, no está construido.$md$,
  updated_at = now()
WHERE slug = 'reportes-hacienda';


UPDATE manual_articulos
SET
  contenido = $md$Admin/Secretaria le da a otra persona su PROPIO login (su propio correo y contraseña, nunca las del dueño) para ayudar con la facturación de un negocio específico, sin exponerle las finanzas personales del dueño ni las de otras entidades.

CÓMO INVITAR: desde "Admin" en el menú del negocio (plan Pro/Pro+, se administra por negocio — hay que tener seleccionada la entidad específica, no la vista "Todas"). Botón "+ Añadir" abre un formulario:
1. Nivel de acceso: Secretaria ($10/mes) o Administrador ($20/mes).
2. Nombre completo y el email al que le va a llegar la invitación.
3. Si es Secretaria, 5 permisos adicionales que se prenden/apagan a mano (ver ingresos del mes, ver gastos del negocio, cambiar precios del catálogo, ver créditos en Hacienda, ver reportes de años anteriores). Si es Administrador, esos 5 vienen todos incluidos por defecto y no se pueden editar.

DIFERENCIA ENTRE LOS DOS NIVELES:
- Secretaria: siempre puede ver clientes, crear facturas, registrar cobros, y ver pendientes. Nada más.
- Administrador: todo lo de Secretaria, más 4 secciones completas — Pagos (a contratistas), Metas de negocio, Bóveda de documentos, y Cuentas (solo para VER balances, nunca puede conectar ni desconectar un banco).

Ninguno de los dos niveles ve jamás las finanzas PERSONALES del dueño, ni de otra entidad de negocio distinta a la que fue invitado.

OJO CON LOS 5 PERMISOS ADICIONALES: quedan guardados al invitar, pero hoy ninguno de los 5 se hace cumplir dentro del portal — no existe todavía ninguna pantalla de Gastos, Créditos en Hacienda, ni Reportes dentro de "/admin" a la que esos toggles puedan aplicar, así que prenderlos o apagarlos no cambia nada de lo que la Secretaria ve en este momento. Si el dueño pregunta por uno de esos permisos puntuales, hay que aclarárselo así — es una pieza que quedó pendiente de una fase posterior, no algo ya activo.

CÓMO ACEPTA LA PERSONA INVITADA: le llega un correo con un link para crear su propia contraseña (o entrar si ya tiene cuenta en VICTOR). Al confirmar, queda con acceso activo y entra directo a su portal.

SU PORTAL — LO QUE VE Y HACE EL ADMIN/SECRETARIA DESDE SU PROPIA PANTALLA: al hacer login entra directo a "/admin" (nunca ve el dashboard normal del dueño ni un selector de entidad) — está atado a la ÚNICA entidad a la que fue invitado; si intenta entrar a la URL de otra entidad a mano, el sistema lo regresa a la suya. Si es Secretaria, solo ve la pestaña Facturación, sin barra de secciones. Si es Administrador, ve además una barra de pestañas propia arriba — Facturación, Pagos, Metas, Bóveda, Cuentas — que son los MISMOS componentes que usa el dueño, con los datos reales del negocio.

DENTRO DE FACTURACIÓN (aplica a los dos niveles, no solo a Secretaria): a diferencia del dueño, que ve 5 pestañas (Facturas, Clientes, Servicios, Cotizaciones, Reportes), el admin/secretaria SOLO ve Facturas y Clientes — nunca el catálogo de Servicios, ni Cotizaciones, ni Reportes, tampoco si es Administrador. Al crear una Nueva Factura tiene el mismo formulario que el dueño (cliente, líneas del catálogo o libres, IVU, retención, depósito, ¿es recurrente?), EXCEPTO que nunca aparece la opción "Asignar a técnico" — esa queda reservada al dueño, así el negocio tenga Equipo/técnicos activo o no. En el detalle de una factura puede descargar el PDF, reenviarla por WhatsApp, y "Registrar pago" si todavía no está cobrada — pero NO puede Editarla, NO puede Eliminarla, y si ya está pagada NO puede corregir después el método o la fecha de pago (esa opción de corregir solo la ve el dueño).

CUENTAS (exclusivo de Administrador): lista de balances de todas las cuentas conectadas por Plaid MÁS las cuentas manuales asignadas a esa entidad — solo lectura, nunca hay botón de conectar, desconectar ni sincronizar un banco.

COSTO: se cobra por persona, no por negocio — un dueño puede tener varias secretarias y/o administradores a la vez, cada uno su propio cargo mensual ($10 o $20) que se suma automáticamente a la suscripción de Stripe del dueño desde que se manda la invitación (no desde que se acepta). Se puede quitar a alguien en cualquier momento desde la misma pantalla de Admin, y el cargo se detiene.$md$,
  updated_at = now()
WHERE slug = 'admin-secretaria';


UPDATE manual_articulos
SET
  resumen = 'Cómo comprar créditos extra de IA si se acaba el límite mensual de conversación con VICTOR (packs de $10 o $20), y qué pasa con lo que no se usa.',
  contenido = $md$Cada plan tiene un límite mensual de cuánto se puede hablar con VICTOR (el chat), pensado para que nadie se quede sin conversar por costo, pero también para que el gasto real de IA no se dispare. Cuando ese límite se acerca o se acaba, "Créditos extra de IA" (Configuración) es la salida.

CÓMO COMPRAR: dos botones en Configuración — $10 o $20 — cada uno abre un Stripe Checkout de PAGO ÚNICO (no es una suscripción nueva, es un top-up de una vez). Al confirmarse el pago, se añade presupuesto de IA al ciclo de facturación ACTUAL del usuario: el pack de $10 da $7.00 de crédito, el pack de $20 da $14.70 (un poco más del doble limpio — trae un bono extra por llevar el pack grande, marcado como "Mejor valor" en el botón). La diferencia entre lo pagado y el crédito otorgado es margen del negocio sobre el costo real de Anthropic, igual que hace cualquier proveedor de IA con sus créditos de API.

DISPONIBILIDAD INMEDIATA: a diferencia del límite normal del plan (que se reparte "parejo" a lo largo del mes para que no se gaste todo el día 1), el crédito comprado está disponible COMPLETO desde el momento en que Stripe confirma el pago — se compró para usarse ya, no para racionarlo.

LO QUE NO SE USA NO SE PIERDE: si sobra crédito al cerrar el ciclo, rueda automáticamente al ciclo siguiente cuando se renueva la suscripción — no hay que gastarlo todo antes de que se acabe el mes.

SE PUEDE COMPRAR VARIAS VECES: no hay límite de cuántos packs se pueden comprar (de $10, de $20, o mezclados) si se sigue necesitando más — cada compra queda registrada (fecha, monto, sesión de Stripe) para auditoría y soporte.$md$,
  updated_at = now()
WHERE slug = 'creditos-ia';


UPDATE manual_articulos
SET
  contenido = $md$Cobro con tarjeta vive en el tab "Facturas" de la entidad de negocio, junto a los checkboxes de métodos de cobro (ATH Móvil, Transferencia/ACH, Cheque). Solo aparece editando una entidad que ya existe.

ACTIVAR: botón "Conectar Stripe" — crea o conecta la cuenta de Stripe Connect Standard del negocio. El dinero le cae directo al dueño del negocio; VICTOR nunca lo toca ni cobra comisión propia. Mientras la cuenta de Stripe no termine su propio proceso de verificación (identidad, cuenta bancaria), el estado queda "Falta terminar de configurarlo en Stripe" — hay que volver a apretar el botón (ahora dice "Continuar") para terminar ese proceso en Stripe.

FEE REAL DE STRIPE (esto NO es un cobro de VICTOR): Stripe sí cobra su propia comisión por cada pago con tarjeta procesado, estándar de la industria: 2.9% + $0.30 por transacción, descontado automáticamente antes de que el dinero llegue al balance del dueño. VICTOR muestra este estimado en pantalla al momento de registrar el cobro para que no sea sorpresa en Reportes — no hay forma de evitarlo ni de que VICTOR lo absorba.

CÓMO SE COBRA: cada factura con Stripe activo genera un link de pago real (Stripe Checkout) — el mismo link vive en el PDF de la factura y en el correo de facturas recurrentes, es estable (no expira aunque el cliente lo abra días después) y reutiliza la sesión de pago mientras siga válida en vez de crear una nueva cada vez.

MÁS FORMAS DE PAGO PARA EL CLIENTE (Klarna, Afterpay, Affirm, pagar en cuotas, ACH, Cash App Pay, etc.): el checkout de Stripe que arma VICTOR no limita a solo "tarjeta" — muestra automáticamente cualquier método que el dueño del negocio tenga PRENDIDO en su propio Stripe Dashboard (Settings → Payment methods, dentro de SU cuenta de Stripe, no en VICTOR). O sea, para que a un cliente le salga la opción de pagar en cuotas con Klarna/Afterpay/Affirm, o pagar por transferencia bancaria directa (ACH) o Cash App Pay, el dueño del negocio solo tiene que entrar a su Stripe Dashboard y activarlos ahí — VICTOR no necesita ningún cambio para que aparezcan.

Cosas a saber sobre Klarna/Afterpay/Affirm específicamente: son para pagar en cuotas (ej. "pay in 4"), tienen límites de monto (normalmente entre $1 y $10,000 por transacción, varía por proveedor), y dependen de que Stripe los tenga disponibles para el país/moneda de la cuenta (negocios de EEUU en USD normalmente califican). No hay garantía de que Stripe apruebe cada método para cada cuenta — es una decisión de Stripe basada en el perfil de riesgo del negocio, no algo que VICTOR controle.$md$,
  updated_at = now()
WHERE slug = 'cobro-tarjeta-stripe';


-- ----------------------------------------------------------------------------
-- ARTÍCULOS NUEVOS (módulos reales sin cobertura hasta hoy)
-- ----------------------------------------------------------------------------

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'citas',
  'Citas — anotar turnos y recibir avisos antes de que lleguen',
  'Cómo anotar una cita puntual (médica, trámite, reunión), qué avisos manda VICTOR, y cómo llevar un historial de notas por cita hablando con VICTOR.',
  $md$"Citas" (/dashboard/citas, o dentro de Bóveda de negocio para citas de negocio) vive junto a Bóveda — se llega tocando la pestaña "Citas →" arriba de la lista de documentos, o desde la tarjeta "Próxima cita" en Inicio.

CREAR: botón "+ Nueva" — pide título, fecha (obligatoria), hora (opcional) y costo estimado (opcional, útil para citas donde puede hacer falta llevar efectivo — VICTOR puede cruzarlo contra tu disponible si se lo pides por chat), más una nota opcional de una sola línea.

EDITAR: entra a "Editar" desde la lista — cambia título, fecha, hora, costo estimado, o la nota (el campo Notas se REEMPLAZA cada vez que lo editas desde la pantalla, no se acumula). También hay una casilla "Ya pasó / completada" para marcarla hecha a mano y que deje de generar avisos. Si cambias la fecha u hora, los avisos (día antes / mismo día) arrancan de cero. "Eliminar cita" la borra (pide tocar dos veces para confirmar); una cita que ya pasó NO desaparece sola de la lista — se muestra tachada y atenuada al final, para conservar el historial de cuánto costó al final.

AVISOS: VICTOR avisa un día antes y el mismo día de cada cita, por notificación push y dentro del saludo diario — la tarjeta "Próxima cita" en Inicio también la muestra con un punto de color (rojo si es hoy/mañana, ámbar si es en pocos días, verde más adelante).

HABLANDO CON VICTOR: puedes pedirle "anótame una cita con la endodoncista el jueves a las 3pm" y la crea directo. También puedes pedirle que reagende, marque una cita como completada, o AÑADA una nota nueva (ej. "el doctor dijo que hay que volver en 3 meses") — a diferencia del campo Notas de la pantalla, cada nota que agregas por chat se guarda APARTE, sin borrar las anteriores, así que con el tiempo queda un historial completo de cada seguimiento (útil sobre todo si ves al mismo médico o contacto varias veces). Ese historial acumulado solo lo ve VICTOR (no hay pantalla que lo liste hoy) — pregúntale a VICTOR directamente si quieres repasarlo. Para borrar una cita, VICTOR siempre confirma primero en el chat — nunca la borra en el mismo turno en que la mencionas por primera vez.$md$
),
(
  'categorias',
  'Categorías — fusionar, renombrar y eliminar',
  'Cómo arreglar categorías duplicadas o mal escritas (ej. "Telefonica" vs "Telefonia") sin perder el historial de transacciones.',
  $md$"Categorías" (/dashboard/categorias, se llega desde "⚙ Gestionar categorías" al fondo del dropdown de Categoría en Transacciones) lista TODAS tus categorías — las tuyas y las del catálogo global compartido — con cuántas transacciones tiene cada una.

PERSONAL VS. GLOBAL: cada categoría trae una etiqueta "Personal" (la creaste tú) o "Global" (viene del catálogo compartido con el que arranca toda cuenta nueva). Las globales no se pueden renombrar ni eliminar — solo fusionar HACIA otra. Las categorías no dependen de si estás viendo Personal o una entidad de negocio: son las mismas en toda tu cuenta.

FUSIONAR: botón "Fusionar" en cualquier categoría — eliges a cuál otra mover TODAS sus transacciones. Si la categoría de origen es tuya (Personal), además de mover las transacciones la borra; si es Global, solo mueve las transacciones y la categoría global se queda (no se puede borrar). Te pide confirmar cuántas transacciones se van a mover antes de hacerlo — es la forma correcta de arreglar algo como "Telefonica" y "Telefonia" siendo la misma cosa.

RENOMBRAR: solo disponible en tus categorías propias (Personal) — botón "Renombrar", escribes el nombre nuevo y "Guardar".

ELIMINAR: solo disponible en tus categorías propias, y solo funciona si esa categoría ya no tiene ninguna transacción (fusiónala primero si tiene).$md$
),
(
  'estado-resultados',
  'Estado de Resultados — ingresos y gastos mes a mes, por entidad',
  'Cómo ver el Estado de Resultados de un negocio (matriz mes a mes del año, con línea de referencia de Schedule C), y descargarlo en Excel o PDF para tu contador.',
  $md$El Estado de Resultados es una tabla del año completo, mes a mes, con los ingresos y gastos de UNA entidad de negocio específica — exclusivo de negocio, nunca mezcla transacciones personales.

CÓMO LLEGAR: dentro de "Transacciones" del negocio (/dashboard/negocio/gastos), dropdown "↓ Reporte para tu contador" → "📊 Ver Estado de Resultados". Solo aparece cuando tienes una entidad específica seleccionada arriba (no en vista "Todas"), porque el reporte es siempre de un solo negocio a la vez.

QUÉ MUESTRA: una fila por cada categoría de ingreso y de gasto que tuvo movimiento ese año, con una columna por mes (Ene-Dic) y una columna de Total, más los totales de "Total ingresos", "Total gastos" y "Utilidad neta" al final. Cada categoría trae, debajo de su nombre, la línea de referencia del Schedule C (formulario federal) a la que corresponde — si tu CPA te confirma los números reales de línea del Anejo M de Puerto Rico, se pueden añadir aparte más adelante.

CAMBIAR DE AÑO: flechas "← [año anterior]" y "[año siguiente] →" junto al título.

DESCARGAR: botones "↓ Excel" y "↓ PDF" arriba de la tabla — ambos con el logo de la entidad y la marca VICTOR CFO, listos para mandarle a tu contador.

QUÉ NO ES: no genera el Anejo M ni el 480.20 en sí (esas planillas oficiales las llena tu CPA) — es una vista de apoyo para que él tenga los números organizados por mes sin tener que pedírtelos sueltos. Tampoco existe todavía un "Paquete para el contable" que junte esto con otros reportes en un solo archivo — sigue en el roadmap.$md$
),
(
  'programa-socios',
  'Programa de Socios / Embajadores — comisión en efectivo por traer clientes (CPAs, influencers)',
  'Cómo aplicar al Programa de Socios (distinto del referido peer-to-peer), cuánto paga por cliente traído a Core o Pro, y cómo se cobra la comisión.',
  $md$El Programa de Socios es DISTINTO del referido peer-to-peer (el del link ?ref= en Configuración) — aquí el "socio" no tiene que ser cliente de VICTOR CFO (un influencer puede aplicar sin haberse registrado nunca), y la recompensa es EFECTIVO real por transferencia/ATH Business, no un crédito en el saldo de Stripe.

QUIÉN APLICA: CPAs/contadores, influencers, o cualquier persona con red y ganas de promocionar VICTOR activamente en Puerto Rico — formulario público en /socios (sin necesitar cuenta). Se pide nombre, email, teléfono, tipo (CPA/Contador, Influencer, Otro) y cómo planea promocionarlo, más aceptar los Términos del Programa de Socios.

APROBACIÓN: la solicitud entra "pendiente" — el equipo de VICTOR la revisa y aprueba a mano. Solo cuando se aprueba se genera un código corto para compartir (ej. "ANA-CPA"); nadie puede compartir un link de una solicitud todavía sin revisar.

CUÁNTO PAGA: comisión fija por cliente traído que empieza a pagar de verdad — $7.00 si entra a Core, $25.00 si entra a Pro (aproximadamente la mitad de cada plan) — UNA sola vez por cliente, SIN tope anual (a diferencia del referido peer-to-peer): mientras más clientes reales traiga el socio, más cobra. Si el referido entra a Pro, la comisión no se libera hasta que haya evidencia real de actividad de negocio (mismo guardarraíl anti-fraude que el programa peer-to-peer).

CÓMO SE PAGA: el pago es MANUAL — se transfiere por fuera de la app (ACH/ATH Business) y se marca la comisión como pagada. El socio llena su propia información bancaria en una página protegida por un link único de un solo uso (no la escribe nadie más a mano por él), y esos datos se cifran antes de guardarse.

OJO CON HACIENDA: como es efectivo real (no un descuento en cuenta), aplica la retención de la 1062.03 pasados los primeros $1,500/año a un mismo socio — si un socio cruza ese umbral, eso se coordina por fuera de la app.$md$
),
(
  'configuracion',
  'Configuración — PIN, notificaciones, sesión por inactividad, plan, cuenta',
  'Todo lo que vive en Configuración fuera de MFA/Créditos IA/Referidos: PIN de bloqueo, notificaciones push, cierre de sesión por inactividad, gestionar o cancelar el plan, editar nombre/email/teléfono, y eliminar la cuenta.',
  $md$La pantalla "Configuración" (/dashboard/config) reúne todo lo de cuenta y sistema en un solo lugar.

BLOQUEO CON PIN: un PIN de 4 dígitos que traba la pantalla de la app cada vez que se abre o se regresa a ella, aunque la sesión de verdad siga activa — es una traba rápida, no el mecanismo real de seguridad de la cuenta (eso es MFA). Se activa/desactiva/cambia desde su propia tarjeta.

NOTIFICACIONES: activa avisos push de documentos por vencer y gastos sin categorizar. Solo funciona si VICTOR CFO está instalado como app (Safari/Chrome → "Compartir"/menú → "Agregar a pantalla de inicio") — en un tab normal del navegador, el botón avisa que hace falta instalar primero en vez de fallar en silencio.

CERRAR SESIÓN POR INACTIVIDAD: elige cuánto tiempo sin usar la app antes de que se vuelva a pedir acceso — opciones de 15 min, 30 min, 1 hora, 4 horas, o Nunca. Si hay un PIN activado, pasado ese tiempo solo vuelve a pedir el PIN (no cierra sesión de verdad); si no hay PIN, cierra la sesión real y hay que entrar de nuevo con la contraseña.

GESTIONAR MI PLAN: botón que abre el Customer Portal de Stripe — ahí (fuera de VICTOR) se cambia la tarjeta, se revisan los recibos, o se cancela la suscripción. VICTOR no duplica esa pantalla dentro de la app a propósito, para no reinventar algo que Stripe ya hace de forma segura.

EDITAR CUENTA: cambiar nombre, teléfono o email desde la tarjeta "Cuenta". Nombre y teléfono se guardan al instante. El email es distinto: cambiar el correo no se aplica de inmediato — Supabase manda un correo de confirmación (puede pedir confirmar desde el correo viejo Y el nuevo) y el cambio solo entra en vigor cuando se completa esa confirmación.

ELIMINAR CUENTA (auto-eliminación): en la "Zona de peligro", al fondo de Configuración. Pide escribir la contraseña y la palabra "ELIMINAR" para confirmar — es irreversible pasado el plazo de gracia. Al confirmar: la suscripción se cancela al final del período ya pagado, y la cuenta queda archivada 30 días (se puede cancelar la eliminación en cualquier momento dentro de ese plazo, desde la misma pantalla, que muestra la fecha exacta y un botón "Cancelar eliminación"). Pasados los 30 días, se borra todo de forma permanente — se conservan solo facturas y pagos ya emitidos, por obligación contable.

SOPORTE: tarjeta con un botón directo a soporte@westcapitalventuresllc.com, visible para todos los planes (incluyendo plan gratis, que no tiene acceso al chat de VICTOR para preguntar nada).$md$
),
(
  'invitar-contable',
  'Invitar a tu contable/CPA — acceso de solo lectura, gratis',
  'Cómo invitar a tu CPA o contador a VICTOR sin costo adicional, y qué puede ver una vez acepta.',
  $md$Desde "Invita a tu contable" (accesible desde Inicio) puedes darle acceso a tu contador o CPA para que vea lo que necesita sin pagar nada extra — ni tú ni él. Disponible para cualquier plan, Core o Pro.

CÓMO INVITAR: escribe el nombre (opcional) y el correo de tu contador, y opcionalmente un mensaje personal — botón "Invitar". Le llega un correo avisándole que lo invitaste (si el envío automático no está disponible en ese momento, la invitación queda guardada igual y puedes avisarle tú mismo mientras tanto).

CÓMO ACEPTA TU CONTADOR: abre el link del correo, crea su propia contraseña (o entra con su contraseña si ya tiene cuenta de VICTOR por otro cliente — un mismo contador puede atender a varios dueños con un solo login) y queda conectado automáticamente.

QUÉ VE TU CONTADOR: un portal de SOLO LECTURA en /cpa — nunca puede cambiar nada. Ve la lista de negocios que le compartieron (los tuyos, y los de cualquier otro cliente que también lo haya invitado), con el IVU pendiente de depositar del período actual y el próximo vencimiento de contribución estimada trimestral por cliente. Desde ahí entra al detalle de cada negocio para ver más a fondo.$md$
);
