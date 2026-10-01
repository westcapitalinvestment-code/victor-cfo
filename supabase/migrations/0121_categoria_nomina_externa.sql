-- 1 oct 2026, pedido de Joel (sesión con el Gem CPA, #787): el débito en
-- bloque que hace un procesador de nómina externo (ADP, Paychex, o el
-- propio contable corriendo nómina manual) hoy cae a Transacciones como una
-- sola línea sin forma clara de desglosar — el usuario termina metiéndolo
-- todo bajo una categoría genérica, o no lo categoriza del todo. Esto le da
-- 3 categorías fijas para que, cuando categorice ese retiro, pueda partirlo
-- según el reporte que le manda su procesador (neto / FICA patronal y
-- desempleo / otros beneficios), alimentando el Anejo M correctamente — sin
-- necesitar ninguna integración con ADP/Paychex, es solo mejor estructura
-- de categorización manual.
--
-- hacienda_categories no tiene jerarquía real (ver nota en 0017 sobre
-- categoria_direccion_valida) — el patrón ya establecido en el código es
-- simular sub-categoría con " - " en el nombre (ej. "ATH Móvil - enviado"),
-- así que seguimos el mismo camino en vez de añadir parent_id.
INSERT INTO hacienda_categories (nombre, linea_anejo_m, linea_schedule_c, deducible_multiplier, es_home_office, activo) VALUES
  ('Nómina (externa) - Sueldos y Salarios', 'Anejo M', 'Schedule C - Línea 26', 1.0, false, true),
  ('Nómina (externa) - Contribuciones Patronales (FICA/Desempleo)', 'Anejo M', 'Schedule C - Línea 23', 1.0, false, true),
  ('Nómina (externa) - Otros beneficios', 'Anejo M', 'Schedule C - Línea 14', 1.0, false, true)
ON CONFLICT DO NOTHING;
