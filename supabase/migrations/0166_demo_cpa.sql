-- ============================================================================
-- VICTOR CFO — 0166: cuenta demo del CPA contable
-- ============================================================================
-- Marca soporte+democpa@victorcfo.com como cuenta de demostración
-- (users.is_demo = true, ver 0087). Con esa marca, las acciones del Portal CPA
-- que tienen efecto real hacia afuera se simulan en el servidor: invitar
-- cliente nuevo bajo VICTOR Accountant (Stripe + correo), liberar/cancelar
-- invitaciones, invitar colega al equipo (correo) y guardar el perfil de
-- oficina (directorio público). Ver lib/demo.ts.
--
-- También la deja como VICTOR Accountant activada para que el panel
-- "Invitar cliente nuevo" se vea completo desde el primer momento.
-- Idempotente. Requiere que el usuario ya exista en Auth (créalo en
-- Supabase → Authentication → Add user, o regístralo normal).
-- ============================================================================

UPDATE public.users
SET is_demo = true,
    es_contable = true,
    es_firma_accountant = true,
    firma_registro_comerciante = COALESCE(firma_registro_comerciante, 'DEMO-000000'),
    full_name = COALESCE(full_name, 'CPA Demo')
WHERE lower(email) = 'soporte+democpa@victorcfo.com';
