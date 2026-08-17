-- ============================================================================
-- 0011 — Siembra inicial del motor de categorización (hacienda_categories +
-- merchant_patterns), que ya existía como estructura en 0001_schema_completo.sql
-- (trigger trg_auto_categorize, función match_category, record_user_correction)
-- pero estaba completamente vacío — sin categorías ni patrones, el trigger
-- nunca tenía nada que asignar.
--
-- Mezcla categorías de gasto PERSONAL (para Core: vivienda, supermercado,
-- transporte...) con líneas de negocio pensadas para Anejo M / Schedule C
-- (para Pro/CPA). Las líneas de Anejo M / Schedule C aquí son un punto de
-- partida razonable, NO una verificación legal — antes de usarse para
-- radicar planillas reales, un CPA con licencia debe confirmar cada línea.
-- ============================================================================

INSERT INTO hacienda_categories (nombre, linea_anejo_m, linea_schedule_c, deducible_multiplier, es_home_office, activo) VALUES
  -- Personales (uso diario, sin línea fiscal — no son deducibles de negocio)
  ('Vivienda (renta o hipoteca)', NULL, NULL, 1.0, false, true),
  ('Utilidades (luz, agua, internet)', NULL, NULL, 1.0, false, true),
  ('Supermercado', NULL, NULL, 1.0, false, true),
  ('Restaurantes y comida rápida', NULL, NULL, 1.0, false, true),
  ('Transporte y gasolina', NULL, NULL, 1.0, false, true),
  ('Salud y seguros médicos', NULL, NULL, 1.0, false, true),
  ('Seguros (auto, vida, hogar)', NULL, NULL, 1.0, false, true),
  ('Entretenimiento y suscripciones', NULL, NULL, 1.0, false, true),
  ('Educación', NULL, NULL, 1.0, false, true),
  ('Cuidado personal', NULL, NULL, 1.0, false, true),
  ('Ropa y accesorios', NULL, NULL, 1.0, false, true),
  ('Mascotas', NULL, NULL, 1.0, false, true),
  ('Regalos y donaciones', NULL, NULL, 1.0, false, true),
  ('Pagos de deudas y tarjetas', NULL, NULL, 1.0, false, true),
  ('Ahorro e inversión', NULL, NULL, 1.0, false, true),
  ('Ingresos y depósitos', NULL, NULL, 1.0, false, true),
  -- Negocio (Pro/CPA) — líneas de referencia, confirmar con CPA antes de radicar
  ('Publicidad y mercadeo', 'Anejo M', 'Schedule C - Línea 8', 1.0, false, true),
  ('Comisiones y honorarios pagados', 'Anejo M', 'Schedule C - Línea 10', 1.0, false, true),
  ('Contratistas y servicios profesionales', 'Anejo M', 'Schedule C - Línea 11 / 17', 1.0, false, true),
  ('Materiales y suministros de oficina', 'Anejo M', 'Schedule C - Línea 22', 1.0, false, true),
  ('Renta de local u oficina', 'Anejo M', 'Schedule C - Línea 20b', 1.0, false, true),
  ('Viajes de negocio', 'Anejo M', 'Schedule C - Línea 24a', 1.0, false, true),
  ('Comidas de negocio (50% deducible)', 'Anejo M', 'Schedule C - Línea 24b', 0.5, false, true),
  ('Oficina en el hogar', 'Anejo M', 'Schedule C - Línea 30', 1.0, true, true),
  ('Otros gastos', NULL, 'Schedule C - Línea 27a', 1.0, false, true)
ON CONFLICT DO NOTHING;

-- Patrones globales (entity_id NULL = aplican a cualquier cuenta, personal o
-- de negocio) para comercios muy comunes, ya "confirmed" para que el trigger
-- los use de inmediato (confidence >= 0.85). Quedan marcados is_personal=true
-- porque para la mayoría de los usuarios (Core) estos son gastos personales;
-- si un negocio corrige uno, el feedback loop (record_user_correction) crea
-- su propio patrón por entidad que gana prioridad sobre este global.
INSERT INTO merchant_patterns (entity_id, pattern, sample_raw_description, hacienda_category_id, is_personal, confidence, status, source) VALUES
  (NULL, 'UBER%',            'Uber trip',              (SELECT id FROM hacienda_categories WHERE nombre = 'Transporte y gasolina'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'LYFT%',            'Lyft ride',              (SELECT id FROM hacienda_categories WHERE nombre = 'Transporte y gasolina'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'SHELL%',           'Shell gas',              (SELECT id FROM hacienda_categories WHERE nombre = 'Transporte y gasolina'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'PUMA ENERGY%',     'Puma gas',               (SELECT id FROM hacienda_categories WHERE nombre = 'Transporte y gasolina'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'TOTAL PETROL%',    'Total gas',              (SELECT id FROM hacienda_categories WHERE nombre = 'Transporte y gasolina'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'NETFLIX%',         'Netflix.com',            (SELECT id FROM hacienda_categories WHERE nombre = 'Entretenimiento y suscripciones'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'SPOTIFY%',         'Spotify',                (SELECT id FROM hacienda_categories WHERE nombre = 'Entretenimiento y suscripciones'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'DISNEY PLUS%',     'Disney+',                (SELECT id FROM hacienda_categories WHERE nombre = 'Entretenimiento y suscripciones'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'HBO%',             'HBO Max',                (SELECT id FROM hacienda_categories WHERE nombre = 'Entretenimiento y suscripciones'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'AMAZON%',          'Amazon.com',             (SELECT id FROM hacienda_categories WHERE nombre = 'Ropa y accesorios'), true, 0.85, 'confirmed', 'system'),
  (NULL, 'WALMART%',         'Walmart',                (SELECT id FROM hacienda_categories WHERE nombre = 'Supermercado'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'PUEBLO%',          'Supermercado Pueblo',    (SELECT id FROM hacienda_categories WHERE nombre = 'Supermercado'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'ECONO%',           'Econo supermercado',     (SELECT id FROM hacienda_categories WHERE nombre = 'Supermercado'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'AMIGO%',           'Supermercado Amigo',     (SELECT id FROM hacienda_categories WHERE nombre = 'Supermercado'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'SELECTOS%',        'Selectos supermercado',  (SELECT id FROM hacienda_categories WHERE nombre = 'Supermercado'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'MCDONALD%',        'McDonalds',              (SELECT id FROM hacienda_categories WHERE nombre = 'Restaurantes y comida rápida'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'BURGER KING%',     'Burger King',            (SELECT id FROM hacienda_categories WHERE nombre = 'Restaurantes y comida rápida'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'KFC%',             'KFC',                    (SELECT id FROM hacienda_categories WHERE nombre = 'Restaurantes y comida rápida'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'STARBUCKS%',       'Starbucks',              (SELECT id FROM hacienda_categories WHERE nombre = 'Restaurantes y comida rápida'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'CVS%',             'CVS Pharmacy',           (SELECT id FROM hacienda_categories WHERE nombre = 'Salud y seguros médicos'), true, 0.85, 'confirmed', 'system'),
  (NULL, 'WALGREENS%',       'Walgreens',              (SELECT id FROM hacienda_categories WHERE nombre = 'Salud y seguros médicos'), true, 0.85, 'confirmed', 'system'),
  (NULL, 'AT&T%',            'AT&T',                   (SELECT id FROM hacienda_categories WHERE nombre = 'Utilidades (luz, agua, internet)'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'CLARO%',           'Claro',                  (SELECT id FROM hacienda_categories WHERE nombre = 'Utilidades (luz, agua, internet)'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'LIBERTY%',         'Liberty',                (SELECT id FROM hacienda_categories WHERE nombre = 'Utilidades (luz, agua, internet)'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'LUMA%',            'LUMA Energy',            (SELECT id FROM hacienda_categories WHERE nombre = 'Utilidades (luz, agua, internet)'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'AAA %',            'AAA (Autoridad de Acueductos)', (SELECT id FROM hacienda_categories WHERE nombre = 'Utilidades (luz, agua, internet)'), true, 0.85, 'confirmed', 'system'),
  (NULL, 'GYM%',             'Gimnasio',               (SELECT id FROM hacienda_categories WHERE nombre = 'Cuidado personal'), true, 0.85, 'confirmed', 'system'),
  (NULL, 'PLANET FITNESS%',  'Planet Fitness',         (SELECT id FROM hacienda_categories WHERE nombre = 'Cuidado personal'), true, 0.9, 'confirmed', 'system'),
  (NULL, 'CREDIT CARD%PAYMENT%', 'Pago de tarjeta de crédito', (SELECT id FROM hacienda_categories WHERE nombre = 'Pagos de deudas y tarjetas'), true, 0.85, 'confirmed', 'system')
ON CONFLICT DO NOTHING;
