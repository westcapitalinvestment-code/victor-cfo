-- Base de conocimiento legal/contributivo de Puerto Rico para VICTOR (30
-- sept 2026, pedido de Joel: que VICTOR pueda responder preguntas de
-- impuestos que normalmente un usuario le haría a su CPA o buscaría en
-- Hacienda/SURI, con respaldo real en vez de adivinar). Mismo patrón de
-- lectura pública que manual_articulos (migración 0060) — es contenido de
-- referencia, no datos del usuario.
--
-- Contenido verificado contra hacienda.pr.gov antes de insertarlo (30 sept
-- 2026) — Joel pidió una tabla armada por Gemini con 12 filas; de esas, 3
-- tenían errores reales que se corrigieron aquí:
--   1. El relevo de retención (10% -> 6% o 0%) NO nace de la
--      "Determinación Administrativa 19-08" (esa DA real es sobre el
--      Formulario 480.7E de seguros/telecom/publicidad, nada que ver) —
--      la base legal correcta es la Sección 1062.03(g) del Código.
--   2. La deducibilidad de gastos condicionada a la retención no es la
--      Sección 1033.15(a)(1) (esa es de deducciones de INDIVIDUOS, tipo
--      IRA) — es la Sección 1033.01(a), la regla general de "gastos
--      ordinarios y necesarios".
--   3. El límite de comidas/entretenimiento NO es 50% como la regla
--      federal (IRC 274(n)) que Gemini copió sin adaptar — en PR es 25%
--      del gasto, Y ESE 25% tiene un tope adicional de 25% del ingreso
--      bruto del año. Dejarlo en 50% le habría dicho a un negocio que
--      puede deducir el doble de lo que la ley permite.
-- Las "Cartas Circulares 21-03/22-07" que Gemini citó para el layout de
-- radicación masiva no se pudieron confirmar en el repositorio de Hacienda
-- — se dejaron fuera en vez de inventar un número.
create table if not exists tax_knowledge_base (
  id uuid default gen_random_uuid() primary key,
  jurisdiction text not null default 'PR',
  legal_reference text not null,
  topic text not null,
  form_or_schedule text,
  threshold_rule text,
  tax_rate numeric(5,2),
  due_date text,
  actionable_rule text not null,
  accounting_impact text not null,
  source_url text,
  verified_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tax_knowledge_base enable row level security;

-- Lectura pública para cualquier usuario autenticado — es contenido de
-- referencia legal, no datos del usuario (mismo criterio que
-- manual_articulos).
create policy tax_knowledge_base_lectura on tax_knowledge_base
  for select using (auth.role() = 'authenticated');

grant select on tax_knowledge_base to authenticated;

insert into tax_knowledge_base
  (legal_reference, topic, form_or_schedule, threshold_rule, tax_rate, due_date, actionable_rule, accounting_impact, source_url, verified_at)
values
(
  'Ley 1-2011, Sec. 1062.03',
  'Retención en el origen sobre pagos por servicios prestados',
  'Formulario 480.6SP (anual) y Modelo 480.9A (depósito mensual en SURI)',
  'Sobre el EXCESO de los primeros $500 pagados a ese contratista en el año natural — los primeros $500 están exentos',
  10.00,
  'Depósito: día 15 del mes siguiente (480.9A). Informativa 480.6SP: 28 de febrero del año siguiente',
  'Todo pago por servicios prestados en PR por encima de $500 acumulados en el año lleva 10% de retención (6% si el contratista presenta un Certificado de Relevo Parcial vigente de SURI). Antes de aplicar el 6%, confirmar que el certificado esté activo — no asumir.',
  'Si no se hizo la retención y el depósito correspondiente, el gasto puede desautorizarse en la planilla (ver Sec. 1033.01(a) más abajo). Efectiva desde el 1 de enero de 2019.',
  'https://hacienda.pr.gov/comerciantes/patronos-y-agentes-retenedores/retencion-en-servicios-prestados',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 1062.03(g)',
  'Certificado de Relevo de Retención (parcial 6% o total 0%)',
  'Certificado de Relevo — se solicita y se descarga desde SURI',
  'Requiere estar al día con las planillas y sin deudas (o con plan de pago aprobado) ante Hacienda',
  null,
  null,
  'El Secretario de Hacienda está facultado para conceder relevos parciales (retención baja a 6%) o totales (0%) de la retención del 10%. El pagador debe exigir el PDF del certificado vigente con código de verificación de SURI antes de pagar con la tasa reducida — un certificado vencido no aplica.',
  'No reduce la obligación de depositar lo retenido realmente — solo cambia el % aplicable hacia adelante.',
  'https://hacienda.pr.gov/comerciantes/patronos-y-agentes-retenedores/retencion-en-servicios-profesionales-y-o-prestados/que-es-el-certificado-de-relevo-de-retencion-y-como-se-solicita',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 1063.01',
  'Obligación de rendir declaraciones informativas (480.6SP)',
  'Formulario 480.6SP — Declaración Informativa, Servicios Prestados',
  'Pagos acumulados que excedan $500 en el año natural a un mismo suplidor',
  null,
  '28 de febrero del año siguiente (radicación electrónica en SURI); copia al suplidor dentro de los 7 días calendario siguientes',
  'Toda persona que en su industria o negocio pague por servicios profesionales sobre $500 en el año debe radicar la 480.6SP electrónicamente en SURI.',
  'Regla crítica: si no se radica la 480.6SP (o se radica tarde), el gasto puede desautorizarse por completo en la planilla.',
  'https://hacienda.pr.gov/comerciantes/patronos-y-agentes-retenedores/radicacion-de-comprobantes-de-retencion-e-informativas-2025-incluye-2014-al-2024-withholding-informatives-returns-filing-2025-includes-2014-2024',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 1033.01(a)',
  'Deducibilidad de gastos ordinarios y necesarios de un negocio',
  'Planilla Corporativa 480.20 (Anejos) / Planilla Conducto 480.10',
  null,
  null,
  null,
  'Son deducibles los gastos ordinarios y necesarios pagados o incurridos en la explotación de una industria o negocio. Para pagos por servicios, la deducción está condicionada a que se haya cumplido con la retención y el depósito de la Sec. 1062.03 y con la informativa 480.6SP correspondiente.',
  'Aplica al cierre del año fiscal al calcular el ingreso neto sujeto a contribución. Sin la 480.6SP radicada, el gasto puede no ser deducible.',
  'https://law.justia.com/codes/puerto-rico/2020/titulo-13/subtitulo-17/parte-ii/capitulo-1005/subcapitulo-c/30121/',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 4010.01 / Sec. 4020.01',
  'Impuesto sobre Ventas y Uso (IVU) general',
  'Modelo SC 2915 (Planilla Mensual de IVU en SURI)',
  null,
  11.50,
  'Día 20 del mes siguiente al que se efectuaron las ventas',
  'La tasa general de IVU es 11.5% (10.5% estatal + 1% municipal), vigente desde el 1 de julio de 2015. Se computa sobre el volumen de ventas bruto — aclarar con el usuario que esto NO es lo mismo que el neto recibido después de comisiones de procesadores de pago (Stripe, ATH Móvil Business).',
  'Obligatorio para todo comerciante con Certificado de Registro de Comerciante vigente.',
  'https://hacienda.pr.gov/sobre-hacienda/sala-de-prensa-virtual/comunicados-de-prensa/preparado-el-departamento-de-hacienda-ante-la-puesta-en-vigor-del-cambio-en-tasa-del-impuesto-de-ventas-y-uso-ivu',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 4010.01(nn) (enmendada por Ley 159-2015)',
  'IVU especial de 4% en servicios entre comerciantes (B2B)',
  'Modelo SC 2915 (línea de servicios al 4%) y Modelo SC 2916 (certificado)',
  'Ambas partes deben estar registradas en el Registro de Comerciantes de Hacienda',
  4.00,
  'Mismo ciclo mensual que el IVU general (día 20)',
  'Los servicios rendidos por un comerciante registrado a otro comerciante registrado tributan 4% de IVU especial (en vez de 11.5%), vigente desde el 1 de octubre de 2015. El comprador debe presentar el SC 2916 para que el vendedor no cobre el 11.5% completo.',
  'Excluye servicios a consumidores finales — solo aplica transacción comerciante-a-comerciante.',
  'https://hacienda.pr.gov/downloads/pdf/formularios/SC%202916.pdf',
  '2026-09-30'
),
(
  'Modelo SC 2916',
  'Certificado de Compras Exentas / Servicios al 4% especial',
  'Modelo SC 2916 (Certificado de Compras Exentas y Servicios Sujetos al 4% Especial-IVU)',
  'El comprador debe estar en el Registro de Comerciantes y tener Certificado de Revendedor si aplica a reventa',
  null,
  null,
  'Relevo al vendedor de cobrar el IVU básico o el 4% especial — lo completa el comprador registrado. Debe conservarse por 6 años.',
  'Evita que un comerciante acumule crédito de IVU innecesario en compras de inventario para reventa o servicios B2B.',
  'https://hacienda.pr.gov/downloads/pdf/formularios/SC%202916.pdf',
  '2026-09-30'
),
(
  'Ley 60-2019 (Código de Incentivos de Puerto Rico)',
  'Decretos contributivos con tasa preferencial fija',
  'Anejo del decreto DDEC / planilla del negocio exento',
  'Requiere Decreto vigente otorgado por el Departamento de Desarrollo Económico y Comercio (DDEC)',
  4.00,
  null,
  'El ingreso exento de actividades elegibles (exportación de servicios, servicios financieros a extranjeros, ciertas PYMES, entre otras) tributa a una tasa fija preferencial — comúnmente 4%, con variantes (ej. 2% los primeros años para algunas PYMES). NO asumir que un negocio califica solo porque exporta servicios — siempre confirmar que tenga el Decreto firmado.',
  'El decreto es un contrato vinculante con el Gobierno de PR — sin decreto, no aplica la tasa preferencial bajo ningún concepto.',
  'https://www.lexjuris.com/lexlex/Leyes2019/lexl2019060.htm',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 1031.02(a)(33)-(34) y Reglamento 8297',
  'Plan de Reembolso Justificado (Accountable Plan)',
  'Conciliación de gastos reembolsados a empleados/dueños',
  'El empleado debe reportar el gasto dentro de un período razonable (3 meses) y respaldarlo con recibo',
  null,
  null,
  'Los reembolsos de gastos de negocio pagados por un empleado o dueño (gasolina, millaje, viajes, suministros) con fondos personales son deducibles para el negocio y libres de impuestos para la persona SI se hacen bajo un plan de reembolso que califique como "accountable plan": el gasto debe estar relacionado al negocio, reportarse a tiempo, y no exceder lo gastado realmente.',
  'Evita que el reembolso se reclasifique como dividendo constructivo o ingreso tributable al accionista/empleado.',
  'https://hacienda.pr.gov/sites/default/files/publicaciones/2021/06/borrador_reglamento_para_enmendar_el_reg_8297_plan_de_reembolso_y_gastos_vehiculos_de_motor_final_6-25-2021_1.pdf',
  '2026-09-30'
),
(
  'Código de Rentas Internas de PR (ver Reglamento Artículo 1024(e)-1 y renumeración 2011)',
  'Límite en la deducción de comidas y entretenimiento de negocio',
  'Anejos de gastos operacionales en la planilla anual',
  'Topeado además a un 25% del ingreso bruto del año del contribuyente',
  25.00,
  null,
  'OJO — esto NO es la regla federal de 50% (IRC 274(n)): en Puerto Rico solo se puede deducir el 25% del gasto de comidas y entretenimiento directamente relacionado al negocio, y ese 25% tiene además un tope adicional de 25% del ingreso bruto del año. El entretenimiento puro (sin propósito de negocio) no es deducible en absoluto.',
  'Clasificación contable obligatoria — nunca proyectar o asumir que las comidas de negocio se deducen al 50% o al 100%.',
  'https://hacienda.pr.gov/sites/default/files/documentos/inst_entidad_conducto_2019.pdf',
  '2026-09-30'
),
(
  'Ley 1-2011, Sec. 1062.01(b)',
  'Retención de nómina sobre salarios (incluye salario de accionista/oficial)',
  'Comprobante de retención (planilla de empleado W-2 equivalente PR)',
  null,
  null,
  'Depósito según las reglas de Sec. 6080.05, simplificadas a partir de 2019 para alinearse con las reglas federales',
  'Un dueño que se paga a sí mismo un SALARIO por trabajar en su corporación está sujeto a la retención de nómina normal, igual que cualquier empleado — esto es distinto de una distribución de dividendos o un "retiro de dueño" informal (ese término aplica a negocios no incorporados tipo sole proprietorship, no a corporaciones ni LLCs tratadas como corporación).',
  'Confundir salario de accionista con "retiro de dueño" es un error de terminología común mencionado por Joel — en una corporación regular, la compensación por servicios se paga y retiene como salario; lo que no es salario y se distribuye de las ganancias es una distribución de dividendos (con su propio tratamiento contributivo, no cubierto en este artículo).',
  'https://hacienda.pr.gov/publicaciones/boletin-informativo-de-rentas-internas-num-11-16',
  '2026-09-30'
),
(
  'Formulario 480.9A (SURI)',
  'Depósito mensual de la contribución retenida en el origen (servicios)',
  'Cuenta de depósito de retenciones en SURI',
  null,
  null,
  'Día 15 del mes siguiente al mes natural en que se hizo la retención',
  'Lo retenido bajo la Sec. 1062.03 cada mes se deposita en Hacienda vía SURI a más tardar el día 15 del mes siguiente — esto es MENSUAL, no trimestral.',
  'La falta de depósito a tiempo genera penalidad e intereses — VICTOR debe avisar proactivamente cuando se acerque o pase el día 15 con retenciones pendientes de depositar.',
  'https://hacienda.pr.gov/sites/default/files/documentos/480.9_rev._09.16.pdf',
  '2026-09-30'
);
