-- ============================================================================
-- VICTOR CFO — 0206: guía "ruta-crecimiento" en el manual consultable
-- (3 nov 2026, pedido de Joel, a raíz del video de los 6 sistemas de un
-- negocio). Orientación general, sin cifras como regla; VICTOR la busca con
-- consultar_manual solo cuando el usuario pregunta de ventas/clientes/mercadeo
-- o de la pestaña Estadísticas. Solo UPSERT/UPDATE en manual_articulos;
-- idempotente. No toca schema.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'ruta-crecimiento',
  'Ruta de crecimiento: conseguir y mantener clientes (mercadeo, ventas, retención, referidos) y pestaña Estadísticas',
  'Los 6 sistemas de un negocio que crece y cómo leer las Estadísticas de Facturación de VICTOR.',
  $md$RUTA DE CRECIMIENTO — conseguir y mantener clientes. Orientación general, no modelo exacto. Aplican las reglas de "ruta-salud-reglas": opciones y ejemplos ("hay negocios que..."), sin porcentajes ni montos como regla, sin prometer resultados, y cerrar con una recomendación natural de conversarlo con su contador/asesor o con alguien de su industria con resultados.

IDEA: un negocio que crece suele ordenar seis sistemas. No hace falta tenerlos todos perfectos; sirven para ver dónde se está perdiendo gente.

1) ATRACCIÓN (cómo se enteran de que existes). Es mercadeo y suele ser el primer problema. Formas comunes: contenido útil en redes, referidos, presencia en Google, alianzas con negocios complementarios, anuncios, eventos. Pregunta guía: ¿dónde está hoy tu cliente ideal y qué le llama la atención? VICTOR no hace mercadeo por el usuario ni garantiza resultados.

2) AUTORIDAD (por qué confiarían en ti). Tu historia o forma de explicar lo que haces, lo que dicen otros (reseñas) y casos de éxito/testimonios. Hábito sencillo: pedir una reseña o testimonio después de un trabajo bien hecho, con permiso del cliente.

3) CONVERSIÓN (de interesado a cliente). Pasos habituales: entender qué necesita (calificar), explicar (educar), una propuesta clara (cotización) y el cierre. Dar seguimiento a cotizaciones sin respuesta suele ayudar. En VICTOR: cotizaciones, facturas con depósito y link de pago.

4) ENTREGA Y RETENCIÓN. Cumplir lo prometido y estar pendiente después. En VICTOR: facturas recurrentes y Seguimientos para recordar cuándo le toca volver a cada cliente.

5) REFERIDOS. Un buen servicio puede llevar a que te recomienden; algunos negocios agradecen con un detalle o recompensa. Preguntar a los clientes que ya repiten suele ser un buen comienzo.

6) INFORMACIÓN (indicadores). Mirar números simples con regularidad para ver si se avanza: clientes nuevos, de dónde llegan, cuánto cuesta conseguirlos, cuántas cotizaciones se cierran, cuántos clientes vuelven y cuánto depende el ingreso de pocos clientes.

PESTAÑA ESTADÍSTICAS (Facturación, Pro/Business). Todo se calcula solo con los datos de la cuenta; no hay que escribir nada a mano. Muestra, por período (30 días, 90 días o 12 meses):
- Clientes nuevos y comparación con el período anterior.
- Por dónde entraron: el canal sale de la tienda Shopify (red social, buscador, directo) o del campo opcional "origen" que envía una integración (Zapier/API). Clientes creados a mano aparecen como "Manual / sin identificar": VICTOR NO conoce cómo se enteraron si nadie lo registró; no lo inventes.
- Costo por cliente nuevo: gasto categorizado como "Publicidad y mercadeo" dividido entre clientes nuevos del período (solo si hay ambos datos).
- Ventas: cobrado, ticket promedio, y si hay cotizaciones, enviadas y tasa de cierre.
- Cobrado por canal y reembolsos/créditos (si los hay).
- Retención: clientes que repiten, clientes dormidos (pagaron antes y llevan más de 6 meses sin volver), seguimientos vencidos, e ingreso mensual recurrente y recurrentes detenidos si usa cobros recurrentes.
- Dependencia: qué parte de lo cobrado aporta su mejor cliente y sus 3 mejores.
Son referencias de su propio negocio, no metas ni un veredicto. Si un número se ve alto o bajo, invita a mirar el contexto (temporada, un trabajo grande, un cliente puntual) y a conversarlo con su contador o asesor.

NEGOCIOS VIRTUALES E INFLUENCERS: suelen vender sin cotizaciones (por link de pago, tienda o membresía), así que las Estadísticas ocultan la parte de cotizaciones y destacan canal de venta, ingreso recurrente, reembolsos y dependencia de pocos clientes o auspiciadores.

QUÉ PUEDE HACER VICTOR: leer sus Estadísticas, explicar qué significa cada indicador, sugerir con tono de amigo qué mirar (cotizaciones sin respuesta, clientes dormidos, seguimientos vencidos, dependencia de un cliente) y ayudar a ordenar clientes y servicios. QUÉ NO HACE: no diseña campañas, no promete ventas, no mide visitas de redes ni anuncios, y no decide por el usuario.$md$
)
ON CONFLICT (slug) DO UPDATE
  SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido, updated_at = now();

-- Alcance: la guía incluye también "ruta-crecimiento" (evita que VICTOR diga
-- que faltan artículos o que la guía son solo los 7 de ruta-salud).
UPDATE manual_articulos
   SET contenido = replace(
         replace(contenido,
           'esta guía (los 7 artículos "ruta-salud-*") es TODO el material',
           'esta guía (los artículos "ruta-salud-*" y "ruta-crecimiento") es TODO el material'),
         '- Temas: ruta-salud-precio-margen,',
         '- Temas: ruta-crecimiento (conseguir clientes, mercadeo, retención, Estadísticas), ruta-salud-precio-margen,'),
       updated_at = now()
 WHERE slug = 'ruta-salud-reglas';
