-- ============================================================================
-- VICTOR CFO — 0203: aclara el ALCANCE de la guía "ruta-salud-*" (3 nov 2026,
-- pedido de Joel). VICTOR decía que faltaba material por subir; la guía
-- (migración 0202) es todo lo que hay. Solo UPSERT del artículo de reglas;
-- idempotente. No toca schema.
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
)
ON CONFLICT (slug) DO UPDATE
  SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido, updated_at = now();
