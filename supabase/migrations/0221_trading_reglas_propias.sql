-- ============================================================================
-- VICTOR CFO — 0221: reglas propias del trader + checks por trade (19 nov 2026)
-- - trading_reglas_propias: cada usuario escribe sus reglas (ej. "Tendencia a
--   favor en H1"). Solo el dueño (RLS).
-- - trade_checks: por trade y regla, si la cumplió (true) o no (false). Si no
--   hay fila, no la marcó. Al borrar la regla o el trade se borran sus checks.
-- - Manual de VICTOR actualizado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trading_reglas_propias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 120),
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_reglas_propias_owner_idx ON trading_reglas_propias (owner_id, orden);

CREATE TABLE IF NOT EXISTS trade_checks (
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  regla_id uuid NOT NULL REFERENCES trading_reglas_propias(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cumplida boolean NOT NULL,
  PRIMARY KEY (trade_id, regla_id)
);
CREATE INDEX IF NOT EXISTS trade_checks_owner_idx ON trade_checks (owner_id);
CREATE INDEX IF NOT EXISTS trade_checks_regla_idx ON trade_checks (regla_id);

ALTER TABLE trading_reglas_propias ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trading_reglas_propias_owner ON trading_reglas_propias;
CREATE POLICY trading_reglas_propias_owner ON trading_reglas_propias FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS trade_checks_owner ON trade_checks;
CREATE POLICY trade_checks_owner ON trade_checks FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT ALL ON trading_reglas_propias, trade_checks TO authenticated;
GRANT ALL ON trading_reglas_propias, trade_checks TO service_role;

UPDATE manual_articulos SET contenido = contenido || $md$

MI CHECKLIST (reglas propias): en Riesgo, la tarjeta "Mi checklist para entrar" deja escribir reglas propias (ej. "Tendencia a favor en H1", "Esperé confirmación de vela", "No operé en noticias"), editarlas, ordenarlas con las flechas y borrarlas (al borrar una se borran sus marcas). En la Bitácora, al abrir un trade sale cada regla con ✓ (la cumplí) o ✗ (no la cumplí); se pulsa otra vez para desmarcar y se guarda con Guardar. Si marca todas, "¿Cumplí mi plan?" se pone solo (Sí si cumplió todas, No si falló alguna) y se puede cambiar a mano. En Estadísticas, la tabla "Mi checklist" muestra por regla cuántas veces la cumplió, y aciertos y promedio por trade cuando la cumple vs cuando no; y "Lo que dicen tus números" dice cuál regla le hace más diferencia. Estas reglas son solo de la web: el guardián de MT5 no las revisa (él cumple las reglas de riesgo).$md$
WHERE slug = 'trading';
