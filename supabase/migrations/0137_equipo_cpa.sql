-- ============================================================================
-- VICTOR CFO — 0137: equipo del CPA (el líder invita a su propio staff)
-- 2 oct 2026
-- ============================================================================
-- Caso real de Joel: su contable es Héctor Collazo, pero quien de verdad
-- lo atiende día a día es Josué Rolón, de su equipo. Decisión de Joel
-- ("Opción B"): confía en Héctor para armar su propio equipo sin tener que
-- aprobar a cada persona una por una, pero siempre puede VER quién tiene
-- acceso y QUITARLE el acceso a cualquiera individualmente, sin afectar a
-- Héctor ni a los demás.
--
-- Mecanismo: cuando Josué acepta la invitación de Héctor, hereda
-- automáticamente TODOS los clientes activos de Héctor — no cliente por
-- cliente. Si Héctor consigue un cliente nuevo después, Josué lo hereda
-- solo. Técnicamente cada acceso heredado es una fila normal de
-- account_members (delegated_from_email = el líder), así que TODA la RLS
-- que ya existe en el sistema (business_entities_cpa_read,
-- ivu_tracker_cpa_read, users_cpa_read, etc. — no se toca ninguna) sigue
-- funcionando sin cambios: Josué "es" un CPA más para esas tablas.

ALTER TABLE account_members ADD COLUMN IF NOT EXISTS delegated_from_email text;

COMMENT ON COLUMN account_members.delegated_from_email IS
  'Si no es null, este acceso de CPA fue heredado automáticamente de otro CPA (el líder de su firma) vía cpa_team_invitations — no fue una invitación directa del dueño. El dueño lo puede desactivar individualmente sin afectar al líder.';

-- Invitación pendiente de un CPA líder (ej. Héctor) a un colega de su
-- equipo (ej. Josué). No requiere que el dueño (Joel) haga nada.
CREATE TABLE cpa_team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email text NOT NULL,
  staff_name text,
  staff_email text NOT NULL,
  invitation_token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'pending', -- pending | accepted
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE cpa_team_invitations ENABLE ROW LEVEL SECURITY;

-- El líder solo ve y administra sus propias invitaciones de equipo.
CREATE POLICY cpa_team_invitations_lead_all ON cpa_team_invitations FOR ALL USING (
  lead_email = auth.email()
) WITH CHECK (
  lead_email = auth.email()
);

-- ----------------------------------------------------------------------------
-- Backfill: al aceptar, el colega hereda TODO lo que el líder ya tenga
-- activo hoy. Se llama una sola vez desde /api/cpa-equipo/aceptar.
-- SECURITY DEFINER porque el colega aceptando nunca es el dueño de esas
-- entidades — necesita saltar RLS igual que ya hace el admin client en
-- /api/cpa-invite/accept.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_equipo_cpa(p_lead_email text, p_staff_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO account_members (owner_id, entity_id, member_email, role, active, invited_at, accepted_at, delegated_from_email)
  SELECT am.owner_id, am.entity_id, p_staff_email, 'cpa', true, now(), now(), p_lead_email
  FROM account_members am
  WHERE am.member_email = p_lead_email
    AND am.role = 'cpa'
    AND am.active = true
    AND NOT EXISTS (
      SELECT 1 FROM account_members existing
      WHERE existing.owner_id = am.owner_id
        AND existing.member_email = p_staff_email
        AND (existing.entity_id = am.entity_id OR (existing.entity_id IS NULL AND am.entity_id IS NULL))
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Propagación hacia adelante: si el líder consigue un cliente NUEVO (o
-- recupera uno reactivado) después de tener colegas ya aceptados, ese
-- cliente se hereda solo a todo su equipo — Héctor no tiene que volver a
-- invitar a nadie. El WHEN excluye filas ya delegadas (delegated_from_email
-- no null) para que esto nunca se propague a un "segundo nivel".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_propagar_equipo_cpa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO account_members (owner_id, entity_id, member_email, role, active, invited_at, accepted_at, delegated_from_email)
  SELECT NEW.owner_id, NEW.entity_id, cti.staff_email, 'cpa', true, now(), now(), NEW.member_email
  FROM cpa_team_invitations cti
  WHERE cti.lead_email = NEW.member_email
    AND cti.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM account_members existing
      WHERE existing.owner_id = NEW.owner_id
        AND existing.member_email = cti.staff_email
        AND (existing.entity_id = NEW.entity_id OR (existing.entity_id IS NULL AND NEW.entity_id IS NULL))
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagar_equipo_cpa ON account_members;
CREATE TRIGGER propagar_equipo_cpa
AFTER INSERT OR UPDATE OF active ON account_members
FOR EACH ROW
WHEN (NEW.role = 'cpa' AND NEW.active = true AND NEW.delegated_from_email IS NULL)
EXECUTE FUNCTION trg_propagar_equipo_cpa();

-- ----------------------------------------------------------------------------
-- Revocación en cascada: si el dueño le quita el acceso al LÍDER a un
-- cliente puntual, el acceso heredado de sus colegas a ESE MISMO cliente
-- se desactiva con él (no toca otros clientes del líder ni otros colegas).
-- El dueño siempre puede reactivar a un colega específico después, a mano,
-- si quiere conservarlo aunque el líder se vaya — es una fila normal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_revocar_equipo_cpa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE account_members
  SET active = false
  WHERE owner_id = NEW.owner_id
    AND delegated_from_email = NEW.member_email
    AND (entity_id = NEW.entity_id OR (entity_id IS NULL AND NEW.entity_id IS NULL))
    AND active = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revocar_equipo_cpa ON account_members;
CREATE TRIGGER revocar_equipo_cpa
AFTER UPDATE OF active ON account_members
FOR EACH ROW
WHEN (NEW.role = 'cpa' AND NEW.active = false AND OLD.active = true AND NEW.delegated_from_email IS NULL)
EXECUTE FUNCTION trg_revocar_equipo_cpa();
