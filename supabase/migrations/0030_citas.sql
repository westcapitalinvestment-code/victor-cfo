-- ============================================================================
-- VICTOR CFO — 0030: tabla citas (Calendario/Citas) — Core, dentro de Bóveda.
-- ============================================================================
-- Nace de un caso real: Joel le pidió a VICTOR que le anotara una cita con
-- una endodoncista (28 agosto 2026) y VICTOR prometió avisarle el día antes
-- y el mismo día — pero esa promesa no tenía dónde vivir: no existía tabla,
-- tool, ni cron que la respaldara, así que el aviso no iba a llegar solo.
--
-- Distinto de `documents` (0001) a propósito: una cita NO se renueva (una
-- vez pasa, queda "hecha"), necesita HORA además de fecha, y le interesa un
-- costo_estimado (para que VICTOR pueda cruzarlo con el efectivo disponible,
-- como hizo a mano en esa conversación). Por eso es tabla propia, no un
-- tipo más dentro de documents — evita meter ramas condicionales en cada
-- pantalla/tool/cron que ya usa documents.
--
-- Vive en su propia ruta (/dashboard/citas), sin ícono nuevo en el bottom
-- nav — se llega desde la tarjeta "Próxima cita" en Inicio y desde un link
-- dentro de la pantalla de Bóveda, igual que /dashboard/clientes hoy.
-- ============================================================================

CREATE TABLE citas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  fecha date NOT NULL,
  hora time,
  costo_estimado numeric,
  notas text,
  recordatorio_1dia boolean DEFAULT false,    -- ya se avisó "es mañana" (cron push)
  recordatorio_mismodia boolean DEFAULT false, -- ya se avisó "es hoy" (cron push)
  hecha boolean DEFAULT false,                -- true = ya pasó/se marcó completada, deja de generar avisos
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX citas_owner_fecha_idx ON citas (owner_id, fecha);

ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que documents_access (0001) — sin el chequeo de
-- account_members que sí tiene goals, porque documents tampoco lo tiene y
-- una cita vive en el mismo espacio "personal" que los documentos.
CREATE POLICY citas_access ON citas FOR ALL USING (owner_id = auth.uid());

GRANT ALL ON citas TO authenticated;
