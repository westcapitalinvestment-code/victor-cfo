-- Nómina: reglas confirmadas por el CPA (Héctor), oct. 2026.
--  * SINOT no aplica a choferes (pagan Seguro Choferil), domésticos ni agrícolas.
--  * Empleados de 26 años o menos: primeros $40,000 de salario exentos de contribución sobre ingresos (retención).
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS exento_sinot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joven_exento boolean NOT NULL DEFAULT false;

-- Fecha de nacimiento: la exención de 26 años o menos se decide por la edad al día del pago.
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
