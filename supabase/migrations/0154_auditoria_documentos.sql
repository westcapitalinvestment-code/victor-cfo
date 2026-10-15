-- Auditoría de la Bóveda (15 oct 2026, pedido de Joel: "que en Auditoría
-- salgan los cambios importantes de documentos, con filtro por fecha y hora").
--
-- Antes audit_log solo recibía correcciones de categoría. Ahora triggers en
-- documents / document_files escriben ahí cada alta, edición, renovación y
-- borrado de documentos de NEGOCIO (audit_log es por entidad), con quién lo
-- hizo. audit_log sigue siendo solo lectura para los clientes: los triggers son
-- SECURITY DEFINER.
--
-- Quién actuó:
--  * Con sesión de usuario (auth.uid()): dueño si es el owner_id; si no, el rol
--    de su fila en account_members (admin / cpa).
--  * Sin sesión (service role — la API de la Bóveda del contable): rol 'cpa' y
--    el correo viene de documents.ultimo_editor_email, que la API fija antes de
--    cada escritura.

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_email text;
CREATE INDEX IF NOT EXISTS audit_log_entity_created_idx ON audit_log (entity_id, created_at DESC);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS ultimo_editor_email text;

CREATE OR REPLACE FUNCTION audit_actor(p_owner uuid, p_editor_email text, OUT o_id uuid, OUT o_role text, OUT o_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mail text;
  v_rol text;
BEGIN
  IF v_uid IS NULL THEN
    o_id := NULL;
    o_email := p_editor_email;
    o_role := CASE WHEN p_editor_email IS NOT NULL THEN 'cpa' ELSE 'system' END;
    RETURN;
  END IF;
  o_id := v_uid;
  v_mail := auth.email();
  o_email := v_mail;
  IF v_uid = p_owner THEN
    o_role := 'owner';
  ELSE
    SELECT am.role INTO v_rol FROM account_members am
      WHERE am.owner_id = p_owner AND lower(am.member_email) = lower(v_mail) AND am.active = true
      ORDER BY (am.role = 'admin') DESC LIMIT 1;
    o_role := COALESCE(v_rol, 'owner');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_audit_documents() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  a record;
  v_action text;
  v_changes jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF r.entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'documento_creado';
    v_changes := jsonb_build_object('documento', NEW.nombre, 'tipo', NEW.tipo,
                   'fecha_vencimiento', NEW.fecha_vencimiento, 'compartido_con_contable', NEW.compartir_contador);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'documento_eliminado';
    v_changes := jsonb_build_object('documento', OLD.nombre, 'tipo', OLD.tipo);
  ELSE
    IF NEW.fecha_vencimiento IS DISTINCT FROM OLD.fecha_vencimiento THEN
      v_action := 'documento_renovado';
    ELSIF NEW.nombre IS DISTINCT FROM OLD.nombre
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.compartir_contador IS DISTINCT FROM OLD.compartir_contador THEN
      v_action := 'documento_editado';
    ELSE
      RETURN NULL; -- cambios internos (banderas de alerta, etc.) no se auditan
    END IF;
    v_changes := jsonb_build_object('documento', NEW.nombre,
                   'nombre_anterior', CASE WHEN NEW.nombre IS DISTINCT FROM OLD.nombre THEN OLD.nombre END,
                   'fecha_anterior', OLD.fecha_vencimiento, 'fecha_nueva', NEW.fecha_vencimiento,
                   'compartido_antes', OLD.compartir_contador, 'compartido_ahora', NEW.compartir_contador);
  END IF;

  SELECT * INTO a FROM audit_actor(r.owner_id, r.ultimo_editor_email);
  INSERT INTO audit_log (actor_id, actor_role, actor_email, entity_id, action, target_table, target_id, changes)
  VALUES (a.o_id, a.o_role, a.o_email, r.entity_id, v_action, 'documents', r.id, v_changes);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_documents ON documents;
CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION trg_audit_documents();

CREATE OR REPLACE FUNCTION trg_audit_document_files() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  a record;
  v_doc uuid;
BEGIN
  v_doc := COALESCE(NEW.document_id, OLD.document_id);
  SELECT id, owner_id, entity_id, nombre, ultimo_editor_email INTO d FROM documents WHERE id = v_doc;
  IF NOT FOUND OR d.entity_id IS NULL THEN
    RETURN NULL; -- documento ya borrado (cascada) o personal
  END IF;
  SELECT * INTO a FROM audit_actor(d.owner_id, d.ultimo_editor_email);
  INSERT INTO audit_log (actor_id, actor_role, actor_email, entity_id, action, target_table, target_id, changes)
  VALUES (a.o_id, a.o_role, a.o_email, d.entity_id,
          CASE WHEN TG_OP = 'INSERT' THEN 'archivo_agregado' ELSE 'archivo_eliminado' END,
          'document_files', COALESCE(NEW.id, OLD.id),
          jsonb_build_object('documento', d.nombre, 'archivo', COALESCE(NEW.etiqueta, OLD.etiqueta)));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_document_files ON document_files;
CREATE TRIGGER audit_document_files AFTER INSERT OR DELETE ON document_files
  FOR EACH ROW EXECUTE FUNCTION trg_audit_document_files();
