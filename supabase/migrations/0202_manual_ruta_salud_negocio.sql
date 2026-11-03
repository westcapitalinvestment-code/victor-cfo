-- ============================================================================
-- VICTOR CFO — 0202: "Ruta de salud del negocio" (orientación general) en el
-- manual consultable (3 nov 2026, pedido de Joel). Se movió del system prompt
-- al manual para no subir el costo de IA en cada llamada: VICTOR lo busca con
-- consultar_manual SOLO cuando el usuario pregunta de estos temas.
-- Criterio: referencias y formas distintas de hacer las cosas (no modelo
-- exacto); sin porcentajes, tasas ni montos como regla; siempre recomendar
-- contador/abogado o una persona de la misma industria con resultados.
-- Solo INSERT/UPSERT en manual_articulos; idempotente. No toca schema.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'ruta-salud-reglas',
  'Ruta de salud del negocio: reglas para orientar (leer primero)',
  'Cómo orientar a un dueño de negocio en precios, crédito, pago al dueño, deducciones, deudas y procesos de servicios.',
  $md$RUTA DE SALUD DEL NEGOCIO — reglas para orientar (aplican a todos los artículos "ruta-salud-*").

- Son REFERENCIAS y formas distintas de hacer las cosas, no un modelo exacto: cada negocio es diferente. Preséntalas como opciones ("hay negocios que...", "una forma común es...").
- No des porcentajes, límites, tasas ni montos como regla (ni de impuestos, ni de crédito, ni de utilización, ni de pagos). Si el usuario pregunta una cifra exacta, di que depende del caso y que lo confirme con su contador (CPA) o abogado.
- Cierra con una recomendación natural, sin repetirla en cada mensaje: que lo converse con su contador o asesor y, si no tiene uno, que busque a una persona que lo guíe, idealmente de su misma industria y con resultados comprobables.
- Usa los datos reales del usuario cuando los tengas (ingresos, gastos, cuentas por cobrar, intereses). No inventes datos.
- Tono de amigo que acompaña: sin regañar y sin prometer ahorros ni resultados.
- ALCANCE: esta guía (los 7 artículos "ruta-salud-*") es TODO el material que existe sobre salud del negocio. No hay herramientas, calculadoras ni módulos adicionales de crédito o salud del negocio, ni contenido pendiente por subir. Nunca digas que te falta material o que alguien va a subir más; si el usuario pide algo que no está aquí, dilo con honestidad y ofrece orientación general con lo que hay.
- Temas: ruta-salud-precio-margen, ruta-salud-credito, ruta-salud-pago-dueno-entidad, ruta-salud-deducciones, ruta-salud-intereses-deuda, ruta-salud-procesos-servicios.$md$
),
(
  'ruta-salud-precio-margen',
  'Ruta de salud: precio y margen para servicios (cómo poner precio, tarifa por hora, margen vs markup)',
  'Orientación general sobre cómo pensar el precio de un servicio, margen vs markup y formas de cobrar.',
  $md$RUTA DE SALUD — PRECIO Y MARGEN (servicios). Orientación general, no modelo exacto (ver "ruta-salud-reglas").

Tu precio no es solo "lo que cobra otro". Una forma de pensarlo: sumar lo que necesitas para pagarte tú, los gastos del negocio, la reserva para impuestos y algo de ganancia, y dividirlo entre las horas que realmente puedes cobrar (que casi siempre son menos que las horas que trabajas, por administración, mercadeo, cotizar, cobrar y días sin clientes).

Margen y markup no son lo mismo: el markup se calcula sobre el costo y el margen sobre el precio. Confundirlos hace cobrar menos de lo que se piensa; conviene decir siempre cuál de los dos se usa.

En servicios el costo incluye tu tiempo y el de tu gente, materiales, subcontratistas, transporte y costos de cobro (como comisiones de tarjeta).

Formas de cobrar: por hora (flexible, pero puede premiar la lentitud); precio fijo por proyecto (necesita alcance claro; lo que salga del alcance es un acuerdo nuevo); iguala mensual (flujo predecible); por valor (cuando el resultado para el cliente se puede medir). Muchos negocios combinan varias.

Qué puede hacer VICTOR: mostrar ingresos por cliente y por servicio y comparar lo que cobra el negocio con lo que le sobra. No fija el precio por el usuario.

Cierra recomendando conversarlo con su contador o con alguien de su industria con resultados.$md$
),
(
  'ruta-salud-credito',
  'Ruta de salud: crédito (qué miran los prestamistas y cómo cuidarlo)',
  'Orientación general sobre qué toman en cuenta los prestamistas y hábitos que ayudan al crédito.',
  $md$RUTA DE SALUD — CRÉDITO. Orientación general, no modelo exacto (ver "ruta-salud-reglas").

Los prestamistas suelen mirar: el historial de pagos, la capacidad de pagar (el flujo de caja), cuánto del crédito disponible se está usando, cuánto capital pone el dueño y qué respalda el préstamo. Cada prestamista pesa estas cosas distinto.

Hábitos que ayudan: pagar a tiempo, no usar el crédito al tope, separar finanzas personales y del negocio, tener estados financieros ordenados y no pedir muchos créditos a la vez.

Qué puede hacer VICTOR: preparar los números que suelen pedir (ingresos, gastos, flujo). No consulta ni garantiza puntuaciones de crédito ni aprobaciones, y no recomienda un préstamo o producto específico.

Cierra recomendando hablar con su banco, contador o asesor.$md$
),
(
  'ruta-salud-pago-dueno-entidad',
  'Ruta de salud: pago al dueño y tipo de entidad (retiro, salario, LLC, corporación)',
  'Orientación general sobre cómo se paga el dueño según cómo está constituido su negocio.',
  $md$RUTA DE SALUD — PAGO AL DUEÑO Y TIPO DE ENTIDAD. Orientación general, no modelo exacto (ver "ruta-salud-reglas"). Ver también la guía de draw vs. salario del prompt.

"Págate primero" es decidir una cantidad para ti con la forma correcta, no sacar lo que haya en el banco.

Cómo se paga un dueño depende de cómo está constituido y tributa su negocio (negocio propio, LLC, sociedad, corporación): en unos casos son retiros, en otros salario y distribuciones o dividendos. Un retiro no es un gasto y no baja la ganancia que tributa. Las tasas y el régimen cambian según el tipo de entidad, y el salario y la distribución de un dueño pueden tributar distinto según cómo tribute la entidad.

Cuándo conviene hablar de cambiar de entidad: crecimiento, empleados, riesgo, ingresos altos, socios, profesión. Cambiar de entidad o decidir cómo pagarse tiene consecuencias fiscales y legales: esa conversación es con su contador y abogado.

Qué puede hacer VICTOR: mostrar cuánto ha retirado frente a lo que el negocio ganó y ayudar a mantener separadas las cuentas personal y del negocio. No decide la entidad ni si un salario es "razonable".$md$
),
(
  'ruta-salud-deducciones',
  'Ruta de salud: deducciones (qué suele poder restar un negocio y cómo no perderlo)',
  'Orientación general sobre gastos que suelen deducirse y hábitos que protegen.',
  $md$RUTA DE SALUD — DEDUCCIONES. Orientación general, no modelo exacto (ver "ruta-salud-reglas").

Idea general: se suele poder restar lo que es común en el negocio, útil para operarlo y pagado para el negocio; si es mixto (personal y negocio), solo la parte de negocio. Se paga contribución sobre lo que se gana, no sobre lo que se cobra.

Lo que más se pierde: vehículo (solo el uso de negocio), comidas de negocio y entretenimiento (suelen tener tratamiento especial), oficina en el hogar (si el espacio se usa para el negocio), equipos grandes (a veces se reparten en años), gastos antes de abrir, seguros, licencias, cuotas profesionales, intereses del negocio y pagos a contratistas bien documentados.

Hábitos que protegen: cuentas separadas, guardar el comprobante el mismo día en la Bóveda y anotar el propósito del gasto cuando no es obvio (con quién y para qué).

Qué puede hacer VICTOR: categorizar gastos, avisar si algo parece personal en cuenta de negocio, mostrar gasto por categoría y guardar comprobantes. Qué es deducible en su caso y cuánto lo decide su contador. No prometas ahorros.$md$
),
(
  'ruta-salud-intereses-deuda',
  'Ruta de salud: intereses y deuda (APR, interés compuesto, pago mínimo, avalancha y bola de nieve)',
  'Orientación general sobre cómo entender el costo de una deuda y formas de ordenar pagos.',
  $md$RUTA DE SALUD — INTERESES Y DEUDA. Orientación general, no modelo exacto (ver "ruta-salud-reglas").

La tasa que anuncian no es lo único que se paga: el APR incluye comisiones y sirve para comparar ofertas. Interés compuesto es interés sobre interés. Una tasa fija normalmente no cambia; una variable sube o baja con el mercado.

Pagar solo el mínimo de una tarjeta hace que casi todo vaya a intereses y alarga mucho la deuda.

Para varias deudas: "avalancha" (el extra a la de tasa más alta) o "bola de nieve" (el extra a la de balance más pequeño). La mejor es la que la persona sí mantiene.

Para pensar si una deuda conviene: ¿genera ingreso o ahorra costo?, ¿su costo es menor que lo que produce?, ¿el flujo aguanta el pago en un mes flojo?, ¿es del negocio o personal?

Señales de alarma que puedes mencionar si ves los datos: solo mínimos varios meses, intereses creciendo, una tarjeta pagando otra, deuda personal pagada desde el negocio.

Qué puede hacer VICTOR: leer APR, balance y pago mínimo cuando se sube un estado de tarjeta, y mostrar cuánto se paga en intereses. No recomienda préstamos ni productos financieros específicos.$md$
),
(
  'ruta-salud-procesos-servicios',
  'Ruta de salud: procesos de un negocio de servicios (contratista vs empleado, cobrar a tiempo, recurrencia, capacidad)',
  'Orientación general para negocios de servicios: clasificar trabajadores, cobrar, ingresos recurrentes y capacidad.',
  $md$RUTA DE SALUD — PROCESOS DE UN NEGOCIO DE SERVICIOS. Orientación general, no modelo exacto (ver "ruta-salud-reglas").

CONTRATISTA VS. EMPLEADO: no lo decide el nombre sino cómo se trabaja de verdad. Se suele mirar quién controla cómo se hace el trabajo, quién asume los riesgos y pone las herramientas, y cómo es la relación (contrato, permanencia, si es el corazón del negocio). VICTOR no clasifica a nadie: orienta y recomienda consultar con su contador o abogado antes, no después. Puede tener consecuencias fiscales y laborales.

COBRAR A TIEMPO: acordar términos antes de empezar, facturar el mismo día, poner link de pago, recordatorios con calendario, revisar las vencidas empezando por las más viejas, depósito en trabajos grandes o clientes nuevos y política de cargo por mora escrita desde el inicio. VICTOR ya tiene depósito en factura/cotización, link de pago y recordatorios automáticos de cobro vencido.

INGRESOS RECURRENTES: iguala mensual, mantenimiento o revisión periódica y paquetes. VICTOR ya tiene facturas recurrentes y Seguimientos para recordar al cliente cuándo le toca su próximo servicio.

CAPACIDAD: se puede vender más de lo que la gente puede hacer. Preguntas que ayudan: ¿cuántas horas cobrables reales tiene el equipo?, ¿qué pasa si llegan más clientes?, ¿el ingreso depende de una sola persona?, ¿cada servicio deja margen para pagar a la persona extra que haría falta? Con los datos reales se puede mostrar ingresos por cliente y por servicio para ver si depende de uno solo.$md$
)
ON CONFLICT (slug) DO UPDATE
  SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido, updated_at = now();
