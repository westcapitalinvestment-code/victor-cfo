-- 1 oct 2026, #784 (pregunta de Joel: "pero estas seguro que es 50% y es
-- el 25% de 50%?"): la categoría sembrada en 0011 decía "Comidas de
-- negocio (50% deducible)" con deducible_multiplier=0.5 — ese 50% es la
-- regla FEDERAL (IRC 274(n)), no la de Puerto Rico. La migración 0115 ya
-- había dejado documentada la corrección (tax_knowledge_base) pero nunca
-- se aplicó a la categoría real ni al texto que VICTOR le muestra al
-- usuario, así que el dato incorrecto seguía viviendo en dos sitios.
--
-- Nota de numeración (1 oct 2026): el Código usa doble numeración — 1
-- L.P.R.A. § 30137 es el número "de código" (el que usa law.justia.com),
-- y su equivalente en la numeración "popular" que usa Hacienda en sus
-- propias cartas/determinaciones es la Sección 1033.17 (confirmado porque
-- Hacienda cita "Sección 1033.17(a)" para las mismas cláusulas (16)-(17)
-- de gastos entre partes relacionadas que están en el texto de §30137).
-- El borrador de #784 había escrito "1033.15" por error — no es esa
-- sección (esa es de deducciones de individuos, ej. IRA).
--
-- Texto exacto verificado en 1 L.P.R.A. § 30137(e)(1)(A) (30 sept/1 oct
-- 2026, vía law.justia.com — Código de Rentas Internas para un Nuevo
-- Puerto Rico):
--   "...para los años contributivos comenzados después del 31 de
--   diciembre de 2018, el monto deducible de gastos por concepto de
--   comidas y entretenimiento estará limitado a veinticinco (25) por
--   ciento del monto realmente pagado o incurrido, hasta un máximo de
--   veinticinco (25) por ciento del ingreso bruto del año contributivo."
-- O sea: 25% del gasto, Y ADEMÁS un tope de 25% del ingreso bruto del
-- año — dos límites de 25%, no un 50% plano. (El 50% sí aplica, pero a
-- otra categoría distinta: viaje/hospedaje, §30137(e)(2)(A) — eso no es
-- esta categoría.)
--
-- Alcance de #784 decidido con Joel: VICTOR CFO no radica la planilla, así
-- que no vamos a calcular el monto deducible real (requeriría el ingreso
-- bruto del año, que no es un campo estructurado hoy). Lo único que nos
-- toca es categorizar bien y dejarle al contable la nota correcta — el
-- cálculo del tope lo hace el contable con los números que ya tiene.
update hacienda_categories
set
  nombre = 'Comidas y entretenimiento de negocio',
  deducible_multiplier = 0.25,
  disclaimer = 'Límite de PR (no es la regla federal de 50%): deducible hasta 25% de lo pagado, con un tope adicional de 25% del ingreso bruto del año (Sección 1033.17(e) / 1 L.P.R.A. § 30137(e)(1)(A)). VICTOR CFO no calcula el tope final — tu contable lo aplica con el ingreso bruto real del año.'
where nombre = 'Comidas de negocio (50% deducible)';
