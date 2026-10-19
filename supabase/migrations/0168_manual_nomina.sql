-- ============================================================================
-- VICTOR CFO — 0168: manual de usuario — módulo Nómina (19 oct 2026, pedido
-- de Joel: "que Victor lo reconozca todo").
--
-- Mismo patrón que 0084/0156: un artículo en manual_articulos que VICTOR lee
-- con consultar_manual. No toca schema. El módulo se construyó en la
-- migración 0167 (tablas payroll_*) y lib/nomina.ts (motor de cálculo).
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'nomina',
  'Nómina — cálculo de nómina de Puerto Rico (retenciones, costo patronal, recibos, depósitos y asiento)',
  'Módulo Nómina: VICTOR calcula la nómina de los empleados en Puerto Rico — retención de Hacienda (499 R-4), Seguro Social, Medicare, SINOT, costo patronal (FICA, SUTA, FUTA, CFSE), recibo por empleado, montos a depositar y asiento contable. Addon de $24.99/mes para Pro, incluido en Business. VICTOR calcula; no radica ni deposita.',
  $md$QUÉ ES: el módulo "Nómina" (ícono al lado de Pagos en el menú del negocio) calcula la nómina de los EMPLEADOS (W-2) de una entidad de negocio en Puerto Rico. Es distinto de "Pagos", que es para CONTRATISTAS (retención 480.6SP). Si el usuario paga a alguien como contratista independiente, es Pagos; si es empleado con 499 R-4, es Nómina.

PRECIO Y QUIÉN LO TIENE: addon de $24.99/mes para el plan Pro (se activa con un botón en la propia pantalla de Nómina, se prorratea). El plan Business lo INCLUYE sin cobrarlo aparte — si un cliente Pro con Nómina sube a Business, el cobro del addon se quita solo. Core no tiene negocio, así que no aplica. Solo el dueño de la cuenta lo usa (todavía no está abierto a Secretaria/Administrador).

LO QUE VICTOR HACE Y LO QUE NO: VICTOR CALCULA. NUNCA radica planillas, deposita en el IRS/Hacienda/DTRH ni paga el cheque del empleado — eso lo hace el dueño o su contable con los montos que VICTOR le da. Tampoco genera el W-2/499R-2 ni los formularios 941-PR/499 R-1B/940-PR: da los montos para llenarlos.

CONFIGURACIÓN (una sola vez): (1) pestaña "Empleados" → "Agregar empleado": nombre, últimos 4 dígitos del Seguro Social (NO se guarda el número completo), frecuencia (semanal, bisemanal, quincenal o mensual), si es salario fijo o por hora y la tarifa, y los datos del Formulario 499 R-4 (estado civil, exención personal completa/compartida/ninguna, dependientes y dependientes universitarios, retención adicional voluntaria). También deducciones voluntarias por periodo (plan médico, 401(k) de PR) y si está cubierto por el Seguro de Choferes. Si el empleado ya cobró parte del año antes de usar VICTOR, se escribe lo acumulado para que los topes cuenten bien. (2) pestaña "Tasas" → tasas de la entidad: SUTA (la asigna el DTRH según la experiencia del patrono), tasa y póliza de CFSE (según el riesgo del negocio) y si paga FUTA.

CÓMO SE CORRE UNA NÓMINA: pestaña "Corrida" → se escoge la frecuencia, el periodo y la fecha de pago → se marca a quién se le paga y se escriben las horas (regulares y extra), comisiones, bonos u otras deducciones del periodo → "Calcular nómina". La pantalla muestra el resumen, los montos a depositar, el asiento contable y el recibo de cada empleado. Si todo está bien, "Aprobar y guardar corrida" la guarda; solo entonces cuenta para los acumulados del año. Una corrida guardada se puede eliminar desde "Historial" (los acumulados vuelven a como estaban).

QUÉ CALCULA: (A) RETENCIONES DEL EMPLEADO: Seguro Social 6.2% hasta el tope anual federal ($184,500 en 2026), Medicare 1.45% sin tope, Medicare adicional 0.9% solo sobre lo que pase de $200,000 en el año, contribución sobre ingresos de Puerto Rico por el método porcentual (anualiza el salario, resta exención + dependientes + deducción fija del 499 R-4, aplica los tramos de Hacienda y lo divide entre los periodos del año, más la retención adicional), SINOT y, si aplica, el Seguro de Choferes. (B) COSTO PATRONAL (lo paga la corporación, no sale del cheque): FICA patronal (6.2% y 1.45%), FUTA (0.6% neto sobre los primeros $7,000), SUTA sobre los primeros $7,000 con la tasa de la entidad, SINOT patronal y la provisión de CFSE (salario × tasa de la póliza; se paga por póliza, no con la corrida).

SALIDAS: (1) el recibo del empleado — bruto, cada descuento y neto. (2) Montos a depositar: IRS Formulario 941-PR (FICA empleado + patronal), Hacienda Formulario 499 R-1B (vía SURI), DTRH (SUTA + SINOT + choferil), IRS FUTA (940-PR) y la provisión de CFSE, con un vencimiento ESTIMADO (último día del mes siguiente al trimestre) — el usuario debe confirmar la fecha real con su contable. (3) El asiento contable de la corrida: débito a Sueldos y Salarios y a Contribuciones Patronales; crédito a Retenciones por Pagar, Deducciones Voluntarias por Pagar (si hay), Impuestos Patronales por Pagar y Banco (neto a desembolsar). Se puede bajar en CSV y siempre cuadra.

IMPORTANTE — NÚMEROS POR CONFIRMAR: varias tasas y reglas (SINOT, choferil, exenciones y dependientes del 499 R-4, deducción fija por estado civil, multiplicador de horas extra, tasa SUTA por defecto y el crédito FUTA) vienen marcadas "por confirmar" en la pestaña "Tasas" hasta que el contable del usuario las valide. Mientras tanto los resultados son un ESTIMADO. Si el usuario pregunta si los números son exactos, dilo con claridad: son un estimado hasta que su contable confirme esas tasas, y la retención de Hacienda hay que validarla contra la tabla oficial de SURI. Cuando se confirma una tasa se corrige en la tabla de parámetros; no hace falta una nueva versión de la app. La retención de Hacienda no incluye el factor de ajuste gradual, y para empleados choferes no se modelan las reglas especiales de Seguro Social/SINOT.

LO QUE VICTOR PUEDE CONSULTAR POR EL USUARIO: la herramienta resumen_nomina trae empleados, últimas corridas, acumulado del año y los depósitos pendientes; estimar_costo_empleado calcula, sin guardar nada, cuánto cuesta y cuánto cobra neto un empleado hipotético (ej. "¿cuánto me cuesta contratar a alguien a $2,000 quincenal?"). NUNCA inventes montos de nómina: usa esas herramientas.

CONTABLE: el contable invitado del usuario ve la Nómina en su portal (pestaña "Nómina" de la entidad, solo lectura): empleados (solo últimos 4 del SSN), corridas aprobadas con depósitos y asiento, acumulado del año por empleado y tasas. Las corridas sin aprobar no se ven. Requiere la migración 0169.

NÓMINA EXTERNA (ADP, Paychex, el contable): sigue funcionando. Si el usuario ya paga la nómina por un servicio externo, no necesita este módulo; VICTOR categoriza esos pagos del banco como siempre. Este módulo es para quien quiere calcular y llevar la nómina dentro de VICTOR.

CÓMO ACTIVARLO: en el menú del negocio, ícono "Nómina" → botón "Activar addon". Si el plan es Business ya está activo sin costo. En la cuenta demo el módulo viene activado con empleados de ejemplo.$md$
)
ON CONFLICT (slug) DO UPDATE
  SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido;

-- El artículo de Pagos debe dejar claro que la nómina de empleados ya tiene su módulo.
UPDATE manual_articulos
SET contenido = contenido || $md$

NÓMINA DE EMPLEADOS: Pagos es solo para CONTRATISTAS (480.6SP). La nómina de empleados W-2 (retenciones, FICA, SUTA, CFSE, recibo y asiento) vive en el módulo "Nómina", un addon de $24.99/mes incluido en Business — ver el artículo "nomina".$md$
WHERE slug = 'pagos' AND contenido NOT LIKE '%NÓMINA DE EMPLEADOS: Pagos es solo%';
