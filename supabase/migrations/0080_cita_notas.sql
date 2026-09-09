-- ============================================================================
-- VICTOR CFO — 0080: tabla cita_notas (historial acumulado de notas por cita)
-- ============================================================================
-- Pedido de Joel vía conversación con VICTOR dentro de la app (9 sept 2026):
-- `actualizar_cita` no tenía forma de añadir una nota DESPUÉS de creada la
-- cita — solo se podía escribir una al crearla (columna citas.notas, de una
-- sola línea que se sobreescribe cada vez que se edita). Para que sirva de
-- verdad en seguimientos reales (cita médica con diagnóstico, reunión de
-- negocio con próximos pasos, y sobre todo relaciones recurrentes — mismo
-- médico o mismo contacto varias veces), hace falta que cada nota nueva
-- quede como una entrada propia con su fecha, no que borre la anterior.
--
-- citas.notas (0030) se queda igual, para la nota inicial que se escribe al
-- crear la cita (desde el chat o el formulario manual de /dashboard/citas).
-- cita_notas es el historial que se va acumulando DESPUÉS, exclusivamente
-- vía el tool actualizar_cita del chat — VICTOR nunca sobreescribe una nota
-- vieja, siempre añade una fila nueva.
--
-- Sin owner_id propio a propósito: la cita ya es la fuente de verdad de a
-- quién pertenece, así que RLS va por join contra citas.owner_id (mismo
-- patrón que ya usa cotizacion_items contra cotizaciones, por ejemplo).
-- ============================================================================

CREATE TABLE cita_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id uuid NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
  nota text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX cita_notas_cita_idx ON cita_notas (cita_id, created_at DESC);

ALTER TABLE cita_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY cita_notas_access ON cita_notas FOR ALL USING (
  EXISTS (SELECT 1 FROM citas WHERE citas.id = cita_notas.cita_id AND citas.owner_id = auth.uid())
);

GRANT ALL ON cita_notas TO authenticated;
