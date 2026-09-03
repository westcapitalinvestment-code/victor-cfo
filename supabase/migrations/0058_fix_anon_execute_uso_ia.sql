-- ============================================================================
-- VICTOR CFO — 0058: Cierra de verdad el acceso anónimo a registrar_uso_ia*
-- ============================================================================
-- Contexto (3 sept 2026): 0057 revocó EXECUTE de `anon` sobre
-- registrar_uso_ia y registrar_uso_ia_detalle, pero Security Advisor las
-- sigue marcando como ejecutables por anon. Causa: en Postgres, el EXECUTE
-- que tiene una función recién creada se le concede por default a PUBLIC
-- (un pseudo-rol que incluye a TODOS los roles, incluido anon) — revocarle
-- el permiso a `anon` puntualmente no quita lo que hereda de PUBLIC. Con
-- handle_new_user() sí funcionó porque ahí se revocó de PUBLIC directamente
-- (0057). Aquí se corrige igual: se revoca de PUBLIC (cierra anon del
-- todo) y se vuelve a conceder solo a `authenticated`, que es como
-- /api/victor/route.ts las llama de verdad (con la sesión del usuario).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.registrar_uso_ia(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_uso_ia(uuid, numeric, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text, text) TO authenticated;
