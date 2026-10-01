-- 1 oct 2026, #785 (Joel: "pero Victor debe conocer como funciona todo esto
-- al detalle") — añade a la base de conocimiento legal (tabla creada en
-- 0115) dos filas nuevas sobre la Contribución Básica Alterna (CBA) y su
-- relación con las declaraciones informativas 480.6, que es el tema que
-- Joel acaba de pedir que VICTOR domine antes de construir la alerta de
-- #785. No se edita 0115 directamente porque ya corrió en producción —
-- este archivo solo inserta filas nuevas, mismo patrón que 0125/0126.
--
-- Verificado 1 oct 2026 vía hacienda.pr.gov, law.justia.com y taxaldia.com:
--   - CBA = Sección 1021.02 (13 L.P.R.A. § 30062) — contribución paralela a
--     individuos, tasas por tramos empezando en 1% sobre el exceso de
--     $25,000 (y 3% sobre el exceso de $50,000, siguen subiendo).
--   - La limitación de Sec. 1033.17 (comidas/entretenimiento y otras
--     partidas no deducibles, ya en la tabla) aplica también al calcular
--     el ingreso neto sujeto a CBA/CAM, no solo a la contribución regular.
--   - Para que ciertos gastos sean deducibles específicamente para CBA/CAM,
--     hace falta la informativa 480.6 del suplidor Y, en entidades
--     conducto, un informe de Procedimientos Previamente Convenidos (AUP)
--     de un CPA con licencia activa en PR (Cartas Circulares 19-14/20-39).
--     VICTOR CFO no puede confirmar que la 480.6SP se radicó de verdad en
--     SURI ni que existe el AUP — eso pasa fuera de la app.
insert into tax_knowledge_base
  (legal_reference, topic, form_or_schedule, threshold_rule, tax_rate, due_date, actionable_rule, accounting_impact, source_url, verified_at)
values
(
  'Ley 1-2011, Sec. 1021.02 (13 L.P.R.A. § 30062)',
  'Contribución Básica Alterna (CBA) a individuos',
  'Se computa en la Planilla de Individuos junto a la contribución regular — Hacienda cobra la mayor de las dos',
  'Empieza a aplicar sobre ingreso neto sujeto a CBA que exceda $25,000',
  1.00,
  null,
  'La CBA es una contribución paralela a la regular, con MENOS deducciones permitidas, que existe para que un individuo con ingreso alto no pague casi nada de contribución a punta de deducciones. Las tasas suben por tramos: 1% sobre el exceso de $25,000 hasta $50,000, 3% sobre el exceso de $50,000 hasta $75,000, y sigue escalando para ingresos mayores. Un dueño de negocio sole proprietor reporta todo el ingreso/gasto del negocio en su propia planilla personal — así que el ingreso neto del negocio SÍ cuenta para este cálculo.',
  'VICTOR puede usar el "Neto" del Estado de Resultados (ingresos - gastos categorizados del año) como estimado aproximado del ingreso neto del dueño — no es el número exacto de CBA (no ajusta depreciación ni otros add-backs), pero sirve para avisar cuándo el negocio está entrando en zona de riesgo. VICTOR CFO no calcula el monto final de CBA — eso lo hace el contable.',
  'https://www.taxaldia.com/legal/cri-pr/subtitulo-a/capitulo-2/subcapitulo-a/seccion-1021-02/',
  '2026-10-01'
),
(
  'Cartas Circulares de Rentas Internas Núm. 19-14 y 20-39; Sec. 1033.17 (13 L.P.R.A. § 30137)',
  'Gastos no deducibles para CBA/CAM sin informativa 480.6 + informe AUP de CPA',
  'Formularios 480.6A/480.6B/480.6C/480.6SP/480.6EC/480.6F/480.6G + Informe de Procedimientos Previamente Convenidos (AUP) de un CPA con licencia activa en PR',
  'Aplica a los gastos que el negocio quiere deducir específicamente para el cálculo de CBA (individuos) o CAM — Contribución Alterna Mínima (corporaciones)',
  null,
  null,
  'Las limitaciones de partidas no deducibles de la Sec. 1033.17 (ver fila de comidas/entretenimiento) también aplican al calcular el ingreso neto sujeto a CBA/CAM — no solo a la contribución regular. Además, para que ciertos gastos sean deducibles específicamente en el cálculo de CBA/CAM, el contribuyente debe haber radicado la informativa 480.6 correspondiente a cada suplidor/contratista, y en el caso de entidades conducto (pass-through), someter un informe AUP preparado por un CPA con licencia activa en PR junto con la planilla. Si no se somete el AUP, esos gastos no son deducibles para CBA/CAM y la 480.6 de cada socio debe reflejar el ajuste correspondiente.',
  'VICTOR puede avisar cuándo hay pagos a contratistas sin el checklist 480 completo (tabla vendor_480_validation) Y el negocio ya está cerca o sobre el umbral de CBA ($25,000 de ingreso neto) — pero NO puede confirmar si la 480.6SP fue realmente radicada en SURI ni si existe el informe AUP, porque eso ocurre fuera de la app. El aviso es "esto podría afectar tu CBA/CAM, verifícalo con tu contable", nunca una confirmación de que el gasto se perderá.',
  'https://hacienda.pr.gov/publicaciones/carta-circular-de-rentas-internas-num-19-14-cc-ri-19-14',
  '2026-10-01'
);
