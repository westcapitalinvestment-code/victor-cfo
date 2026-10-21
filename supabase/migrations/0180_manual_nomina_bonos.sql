-- 0180: manual Nómina — tipos de bono y bono de productividad (21 oct 2026).
-- Se agrega al artículo 'nomina'; idempotente.
UPDATE manual_articulos
SET contenido = contenido || $md$

OTROS BONOS (pestañas Tasas y Corrida):
- TIPOS DE BONO: en Tasas, "Otros bonos", el patrono escribe los nombres de bono que usa separados por coma (ej. Productividad, Desempeño, Referido, Asistencia). Si lo deja vacío se usa una lista sugerida. En la Corrida, cuando un empleado tiene un monto en Bonos, aparece "Tipo de bono" para escoger el nombre; queda anotado en el recibo y la corrida. El tipo es solo informativo: no cambia cómo se calculan las retenciones.
- BONO DE PRODUCTIVIDAD: en Tasas se configura el porcentaje del resultado (ventas, producción, lo que el patrono mida), una meta mínima opcional (por debajo no hay bono) y un tope opcional por empleado. En la Corrida, la tarjeta "Bono de productividad": el patrono escribe el resultado de cada empleado, VICTOR calcula el bono sugerido, el patrono puede cambiar cada monto y pulsa "Aplicar bonos de productividad a esta corrida", que lo pasa al campo Bonos. Si no hay porcentaje configurado, el patrono escribe el monto a mano.
- Los bonos se tratan como salario sujeto a retención en el cálculo. Si el bono tiene un trato contributivo especial, lo confirma el contable. Las reglas son del patrono, no consejo legal.$md$
WHERE slug = 'nomina' AND contenido NOT LIKE '%OTROS BONOS (pestañas Tasas y Corrida)%';
