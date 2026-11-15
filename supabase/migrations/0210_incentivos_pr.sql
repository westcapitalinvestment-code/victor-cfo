-- ============================================================================
-- VICTOR CFO — 0210: catálogo de incentivos de Puerto Rico (15 nov 2026)
-- ============================================================================
-- Pedido de Joel: que VICTOR sepa qué decreto (Ley 60-2019) o programa del
-- DDEC podría aprovechar cada negocio según sus números y su situación.
--
-- 1) incentivos_pr: catálogo de referencia (lectura para todo usuario
--    autenticado, igual que tax_knowledge_base). Las reglas van en JSON para
--    que el backend las evalúe (Claude comunica, el backend calcula). Solo el
--    founder lo edita (por la API con service role).
-- 2) business_entities: los 3 datos que faltaban para evaluar (industria,
--    fecha de inicio de operaciones y si tiene clientes fuera de PR).
-- 3) incentivos_descartados: lo que el usuario dijo "no me interesa", para
--    no repetírselo.
--
-- Contenido inicial: presentación "Incentivos Contributivos" de la CPA y
-- Lcda. Darissa Hernández (Impetus Group), Cumbre de Desarrollo Económico
-- del Oeste 2026, que resume el Código de Incentivos (Ley 60-2019) y el
-- Reglamento de Programas e Incentivos Económicos del DDEC (MO-DEC-015).
-- VICTOR siempre dice "podrías cualificar": la decisión es del DDEC.
-- ============================================================================

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS industria text,
  ADD COLUMN IF NOT EXISTS fecha_inicio_operaciones date,
  ADD COLUMN IF NOT EXISTS clientes_fuera_pr boolean;

CREATE TABLE IF NOT EXISTS incentivos_pr (
  id text PRIMARY KEY,                       -- slug estable (ej. 'pyme_nueva')
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('decreto', 'programa', 'credito')),
  referencia_legal text,
  resumen text NOT NULL,
  beneficios text NOT NULL,
  requisitos_texto text NOT NULL,
  reglas jsonb NOT NULL DEFAULT '[]'::jsonb, -- condiciones que evalúa lib/incentivos.ts
  tasa_decreto numeric(5,2),                 -- % fijo de contribución sobre ingresos (para el estimado)
  monto_max numeric(12,2),                   -- tope del programa en dólares (para el estimado)
  urgente text,                              -- aviso con fecha/condición que vence
  excluye text,                              -- incompatibilidades conocidas
  como_solicitar text,
  enlace text,
  fuente text,
  verificado_en date,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incentivos_pr ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incentivos_pr_lectura ON incentivos_pr;
CREATE POLICY incentivos_pr_lectura ON incentivos_pr FOR SELECT USING (auth.role() = 'authenticated');
GRANT SELECT ON incentivos_pr TO authenticated;
GRANT ALL ON incentivos_pr TO service_role;

CREATE TABLE IF NOT EXISTS incentivos_descartados (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  incentivo_id text NOT NULL REFERENCES incentivos_pr(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, incentivo_id)
);
ALTER TABLE incentivos_descartados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incentivos_descartados_owner ON incentivos_descartados;
CREATE POLICY incentivos_descartados_owner ON incentivos_descartados
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON incentivos_descartados TO authenticated;
GRANT ALL ON incentivos_descartados TO service_role;

-- ---------------------------------------------------------------------------
-- Catálogo inicial
-- Industrias (business_entities.industria): software, manufactura, turismo,
-- agricultura, agroindustria, creativas, energia, servicios_profesionales,
-- salud, comercio, restaurante, construccion, transporte, otro.
-- ---------------------------------------------------------------------------
INSERT INTO incentivos_pr
  (id, nombre, tipo, referencia_legal, resumen, beneficios, requisitos_texto, reglas, tasa_decreto, monto_max, urgente, excluye, como_solicitar, enlace, fuente, verificado_en, orden)
VALUES
(
  'pyme_nueva',
  'Decreto PYME Nueva',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Sec. 2012.01 y Sec. 1020.01(a)(48)',
  'La versión más favorable del decreto para negocios nuevos y pequeños en una actividad elegible (software, manufactura, turismo, agroindustria, etc.).',
  '2% fijo de contribución sobre ingresos los primeros 5 años del decreto y 4% después · 100% de exención en propiedad mueble e inmueble por 5 años (75% después) · 100% de exención en patentes municipales por 5 años (50% después) · 100% de exención en dividendos · Crédito de 30% de las compras de productos manufacturados en PR · Arrendamiento de propiedades de PRIDCO por $1 por 3 años. Decreto de 15 años (negociable por 15 más).',
  'Actividad elegible bajo algún capítulo del Código · Volumen de negocio promedio de $3 millones o menos · Entidad nueva que no había comenzado operaciones cuando se aprobó la Ley 60 (1 julio 2019) · Que NO haya tenido volumen de negocio (ventas) todavía.',
  '[{"t":"elegible_decreto"},{"t":"inicio_desde","v":"2019-07-01"},{"t":"sin_ventas"},{"t":"ventas_max","v":3000000}]',
  2, NULL,
  'Solo aplica si el negocio todavía NO ha tenido ventas. Consúltalo con tu CPA o abogado ANTES de facturar tu primera venta.',
  NULL,
  'Solicitud de decreto ante la Oficina de Incentivos del DDEC, normalmente a través de un abogado o CPA que trabaje decretos.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 10
),
(
  'decreto_manufactura_software',
  'Decreto de Manufactura (incluye software y apps)',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Capítulo 6, Sec. 2061.01',
  'Cubre manufactura y también el desarrollo de programas y aplicaciones reproducibles en escala comercial con ingresos por licencias, suscripciones o cargos por servicio (SaaS), centros de datos, videojuegos y licenciamiento de propiedad intangible.',
  '4% fijo de contribución sobre ingresos · 100% de exención en dividendos y distribuciones · 75% de exención en contribución sobre la propiedad (CRIM) · 50% de exención en patentes y arbitrios municipales · 75% de exención en arbitrios de construcción · Exención flexible: puedes escoger qué años usar. Decreto de 15 años (negociable por 15 más).',
  'Dedicarse a una actividad elegible del Capítulo 6: manufactura, desarrollo de software o aplicaciones reproducibles a escala comercial, procesamiento de datos, licenciamiento de propiedad intangible, agroindustria con valor añadido, reciclaje, investigación y desarrollo, entre otras.',
  '[{"t":"industria","en":["software","manufactura","agroindustria","energia"]}]',
  4, NULL, NULL, NULL,
  'Solicitud de decreto ante la Oficina de Incentivos del DDEC.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 20
),
(
  'decreto_exportacion_servicios',
  'Decreto de Exportación de Servicios',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Capítulo 3',
  'Para negocios en PR que prestan servicios a clientes fuera de Puerto Rico.',
  'Beneficios generales de los decretos del Código: tasa fija preferencial de contribución sobre ingresos (4%), 100% de exención en dividendos y exenciones parciales en propiedad y patentes municipales. Decreto de 15 años.',
  'Prestar desde Puerto Rico servicios elegibles a personas o negocios FUERA de Puerto Rico. Los servicios a clientes en PR no cualifican.',
  '[{"t":"clientes_fuera_pr"}]',
  4, NULL, NULL, NULL,
  'Solicitud de decreto ante la Oficina de Incentivos del DDEC.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026) — lista el Capítulo 3; confirmar detalles con el DDEC',
  '2026-11-15', 30
),
(
  'decreto_turismo',
  'Decreto de Economía del Visitante (Turismo)',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Capítulo 5, Sec. 2051.01',
  'Para hoteles, paradores, posadas, casas de huéspedes, B&B, hostales, villas, agrohospedajes, glamping, marinas turísticas, turismo náutico, médico y ecoturismo, parques temáticos, entre otros. El alquiler a corto plazo (short-term rental) NO es actividad turística elegible.',
  'Beneficios generales del decreto (4% de contribución sobre ingresos de desarrollo turístico, 100% de exención en dividendos, 75% CRIM, 50% patentes) · 100% de exención en IVU de artículos usados en la actividad turística · 90% de exención en derechos de instrumentos públicos y Registro de la Propiedad · Crédito por inversión turística de 40% (o 30% alterno con adelanto). Los créditos se pueden vender.',
  'Operar o administrar una actividad turística elegible que cumpla el mínimo de unidades de su categoría (ej. B&B 3–6 habitaciones, casa de huéspedes 7–25, hotel 15 o más) y tener el endoso de la Compañía de Turismo cuando aplique.',
  '[{"t":"industria","en":["turismo"]}]',
  4, NULL, NULL, NULL,
  'Solicitud de decreto ante la Oficina de Incentivos del DDEC, con el endoso de la Compañía de Turismo.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 40
),
(
  'decreto_agroindustria',
  'Decreto de Agroindustrias',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Capítulo 8, Sec. 2081.01',
  'Para negocios agropecuarios: cultivo de la tierra, crianza de animales, empaque y clasificación de productos agrícolas de PR, pesca comercial, acuacultura, flores y ornamentales, hidropónicos, entre otros.',
  '90% de exención sobre el ingreso de la actividad agrícola · 100% de exención en contribución sobre la propiedad · 100% de exención en patente municipal · 100% de exención en IVU y arbitrios.',
  'Ser agricultor bona fide (o negocio agroindustrial con recomendación del Secretario de Agricultura) dedicado a una actividad agrícola elegible.',
  '[{"t":"industria","en":["agricultura","agroindustria"]}]',
  NULL, NULL, NULL, NULL,
  'Certificación de agricultor bona fide en el Departamento de Agricultura y solicitud de decreto ante el DDEC.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 50
),
(
  'joven_empresario',
  'Decreto de Joven Empresario',
  'decreto',
  'Código de Incentivos (Ley 60-2019), Secs. 1020.02(9) y 2100.01',
  'Para jóvenes de 16 a 35 años que empiezan su primer negocio en Puerto Rico.',
  'Exención TOTAL de contribución sobre el ingreso neto hasta $500,000 · Exención TOTAL de contribución sobre la propiedad · Exención TOTAL de patente municipal · Decreto de 3 años.',
  'Ser residente de PR y tener entre 16 y 35 años · Diploma de escuela superior o equivalente · Negocio nuevo operado exclusivamente por jóvenes empresarios · Comenzar la operación principal en o después de presentar la solicitud · No haber operado por afiliadas ni ser una reorganización · Un solo negocio por joven empresario.',
  '[{"t":"residente_pr"},{"t":"edad_entre","min":16,"max":35},{"t":"sin_ventas"}]',
  0, NULL,
  'Hay que solicitarlo ANTES de comenzar las operaciones y solo hasta los 35 años.',
  NULL,
  'Solicitud de decreto ante la Oficina de Incentivos del DDEC.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 60
),
(
  'ddec_pyme_innovadora',
  'Incentivo PYME Innovadora (DDEC)',
  'programa',
  'Reglamento de Programas e Incentivos Económicos del DDEC (MO-DEC-015)',
  'Subvención (grant) para PYMEs que invierten en investigación y desarrollo en ciencia y tecnología para iniciar o escalar y comercializar sus innovaciones.',
  'Subvención de hasta $200,000. Se puede usar para nómina, renta, mercadeo, utilidades, servicios profesionales, maquinaria y equipo, gastos de I&D y solicitudes de patentes.',
  'Ventas brutas menores de $3 millones · Investigación y desarrollo en sectores estratégicos (manufactura avanzada, bioeconomía, ciencias ambientales, energía, tecnología) · Mantener operaciones e I&D en PR · Demostrar que la I&D mejora el valor comercial · Si tiene menos de 3 años, experiencia empresarial previa.',
  '[{"t":"industria","en":["software","manufactura","energia","agroindustria"]},{"t":"ventas_max","v":3000000}]',
  NULL, 200000, NULL,
  'No se puede combinar con programas de incentivos en efectivo discrecionales (cash grants) del Código de Incentivos.',
  'Orientación del DDEC: 787-758-4747 · premprende@ddec.pr.gov',
  'https://www.desarrollo.pr.gov/ayudas-e-incentivos?tab=pymes',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 70
),
(
  'ddec_capital_semilla',
  'Pareo de Capital Semilla (DDEC)',
  'programa',
  'Reglamento MO-DEC-015',
  'El DDEC parea el dinero que el emprendedor pone como capital operacional de su PYME.',
  'Hasta $15,000 para PYMEs nuevas y hasta $35,000 para PYMEs existentes, en pareo de fondos para maquinaria y equipo, salarios, renta, software y licencias, entre otros.',
  'Ser PYME (nueva o existente) y aportar fondos propios que el DDEC parea. Ver requisitos completos en el reglamento.',
  '[{"t":"ventas_max","v":3000000}]',
  NULL, 35000, NULL, NULL,
  'Solicitud en el portal del DDEC (Ayudas e Incentivos · PyMEs).',
  'https://www.desarrollo.pr.gov/incentivo-de-capital-semilla-para-pymes-de-nuevas',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 80
),
(
  'ddec_maquinaria_equipo',
  'Incentivo para Maquinaria y Equipo (DDEC)',
  'programa',
  'Reglamento MO-DEC-015',
  'Ayuda para comprar o mejorar maquinaria, equipo y programas informáticos que aumenten la productividad.',
  '50% del costo total, hasta $50,000, para adquirir maquinaria y equipo, programas informáticos, o reparar y mejorar maquinaria existente.',
  'Demostrar aumento en la calidad de producción, eficiencia y reducción de costos.',
  '[{"t":"ventas_max","v":3000000}]',
  NULL, 50000, NULL, NULL,
  'Solicitud en refuerzoeconomico.ddec.pr.gov',
  'https://refuerzoeconomico.ddec.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 90
),
(
  'ddec_mercadeo_exterior',
  'Mercadeo Local y al Exterior para Empresas (DDEC)',
  'programa',
  'Reglamento MO-DEC-015',
  'Reembolso de campañas para promocionar en el exterior (y también en PR) los productos y servicios de empresas locales elegibles a decreto.',
  'Reembolso del 50% de los gastos elegibles, hasta $50,000, por 18 meses: publicidad, materiales promocionales, exhibiciones, estudios de mercado, registros de marca y certificaciones para exportar.',
  'Empresa elegible a decreto bajo la Ley 60 con ventas anuales de hasta $10 millones.',
  '[{"t":"elegible_decreto"},{"t":"ventas_max","v":10000000}]',
  NULL, 50000, NULL, NULL,
  'Solicitud en el portal del DDEC (Ayudas e Incentivos · PyMEs).',
  'https://www.desarrollo.pr.gov/ayudas-e-incentivos?tab=pymes',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 100
),
(
  'ddec_mercadeo_local',
  'Mercadeo Local y al Exterior para PYMEs Locales (DDEC)',
  'programa',
  'Reglamento MO-DEC-015',
  'Reembolso para PYMEs locales que NO son elegibles a decreto, para promocionar sus productos y servicios en PR y en el exterior.',
  'Reembolso del 50% de los gastos elegibles, hasta $10,000, por 18 meses: mercadeo digital, página web, redes sociales, posicionamiento en buscadores, exhibiciones y degustaciones.',
  'PYME local no elegible a decreto · Ventas anuales de $3 millones o menos · 25 empleados a tiempo completo o menos.',
  '[{"t":"no_elegible_decreto"},{"t":"ventas_max","v":3000000},{"t":"empleados_max","v":25}]',
  NULL, 10000, NULL, NULL,
  'Solicitud en el portal del DDEC (Ayudas e Incentivos · PyMEs).',
  'https://www.desarrollo.pr.gov/incentivo-pymes',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 110
),
(
  'juvempleo',
  'Juvempleo (DDEC)',
  'programa',
  'Reglamento MO-DEC-015',
  'Programa de primera experiencia laboral: el negocio recibe a un joven y el programa subsidia sus horas de trabajo.',
  'Hasta 950 horas de experiencia laboral subsidiadas para jóvenes de 18 a 29 años en su último año o recién graduados (técnico, vocacional, asociado, bachillerato, maestría o doctorado). La tarifa se aumentó a $11 la hora.',
  'Tener empleados o estar listo para recibir a un joven en su primera experiencia laboral (hasta 1 año después de su graduación).',
  '[{"t":"empleados_min","v":1}]',
  NULL, NULL, NULL, NULL,
  'Solicitud en el portal del DDEC (Ayudas e Incentivos · PyMEs).',
  'https://www.desarrollo.pr.gov/ayudas-e-incentivos?tab=pymes',
  'Presentación Incentivos Contributivos (Impetus Group, 2026)',
  '2026-11-15', 120
),
(
  'credito_id',
  'Crédito Contributivo por Investigación y Desarrollo',
  'credito',
  'Código de Incentivos (Ley 60-2019), Sec. 3030.01',
  'Para negocios que ya tienen decreto y hacen investigación y desarrollo en Puerto Rico.',
  'Crédito de hasta 50% de la inversión elegible en I&D: 50% del crédito el año de la inversión y el resto en años siguientes. El crédito se puede vender total o parcialmente.',
  'Tener un decreto bajo el Código o leyes anteriores · Inversión elegible en I&D en PR · Reinvertir en I&D en PR una cantidad igual al crédito recibido · Aprobación del Secretario del DDEC.',
  '[{"t":"tiene_decreto"}]',
  NULL, NULL, NULL, NULL,
  'Solicitud ante el DDEC con la documentación de la inversión en I&D.',
  'https://www.desarrollo.pr.gov',
  'Presentación Incentivos Contributivos (Impetus Group, 2026); Ley 60-2019',
  '2026-11-15', 130
)
ON CONFLICT (id) DO NOTHING;
