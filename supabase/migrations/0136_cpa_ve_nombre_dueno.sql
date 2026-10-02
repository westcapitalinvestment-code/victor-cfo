-- ============================================================================
-- VICTOR CFO — 0136: el CPA puede ver el nombre del dueño de cada entidad
-- que tiene asignada — 2 oct 2026
-- ============================================================================
-- Pregunta de Joel viendo la lista de clientes del Portal CPA: "¿habrá
-- alguna manera de saber a quién le pertenecen las entidades? pq alguien
-- puede tener 2 o más [entidades] como yo y el contable quizás no recuerde
-- el nombre de la entidad pero sí de quién es".
--
-- Hoy la política users_self (0001) solo deja a cada usuario leer SU PROPIA
-- fila — un CPA no tenía ningún permiso para leer la fila del dueño en
-- `users`, así que /cpa (app/cpa/page.tsx) no podía mostrar "VIP Medical
-- Development — de Joel Valentín" junto al nombre de la entidad.
--
-- Esta política es ADITIVA (no toca users_self) y sigue el mismo patrón que
-- business_entities_cpa_read (0003): un CPA puede leer la fila de `users`
-- de un dueño SOLO SI ese dueño lo invitó como cpa en account_members. No
-- abre acceso a ningún otro usuario de la plataforma.
-- ============================================================================

CREATE POLICY users_cpa_read ON users FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = users.id
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role = 'cpa'
  )
);
