-- ============================================================================
-- VICTOR CFO — 0057: Fix de los 13 warnings de Supabase Security Advisor
-- ============================================================================
-- Contexto (3 sept 2026): Joel compartió el reporte de Security Advisor.
-- 12 de los 13 warnings se arreglan aquí; el warning #13 (Leaked Password
-- Protection Disabled) no es SQL — se activa con un toggle en el Dashboard
-- de Supabase (Authentication → Sign In / Providers → "Leaked password
-- protection"), Joel lo activa a mano.
--
-- PARTE 1 — 5 funciones del motor de categorización nunca tuvieron
-- `search_path` fijo (function_search_path_mutable). Sin esto, si alguna
-- vez alguien con privilegios de crear objetos usara un esquema distinto
-- en su search_path, estas funciones podrían resolver sin querer a una
-- tabla/función de otro esquema con el mismo nombre en vez de la de
-- `public`. Riesgo bajo en la práctica hoy (nadie más tiene acceso de
-- creación de objetos), pero es gratis cerrarlo.
--
-- PARTE 2 — match_category(text, uuid) es un overload huérfano: desde
-- 0017 todo el código llama solo a la versión de 3 argumentos
-- (text, uuid, text). Se elimina en vez de parchear — menos superficie,
-- un warning del linter menos.
--
-- PARTE 3 — el fix real, no cosmético: registrar_uso_ia y
-- registrar_uso_ia_detalle son SECURITY DEFINER y hoy son ejecutables vía
-- RPC pública tanto por `anon` como por `authenticated`. Su guardia interna
-- es `IF auth.uid() IS NOT NULL AND auth.uid() != p_owner_id THEN RAISE
-- EXCEPTION` — esa condición es FALSA cuando auth.uid() ES NULL (o sea,
-- sin sesión), así que hoy un usuario anónimo puede llamar estas funciones
-- con el owner_id de OTRO usuario real y costo_centavos arbitrario, sin
-- que la verificación dispare nunca. Eso infla uso_ia_mensual de esa
-- cuenta y puede activar su tope de "restringido_hora" (VICTOR se le
-- corta a 1 mensaje/hora) sin que esa persona haya hecho nada. Se revoca
-- EXECUTE de `anon`; se deja intacto para `authenticated`, que es como la
-- app las llama de verdad (desde /api/victor, con la sesión del usuario).
--
-- handle_new_user() es la función del trigger on_auth_user_created
-- (auth.users) — depende de NEW, que solo existe en contexto de trigger,
-- así que llamarla directo por RPC solo daría error. No es explotable,
-- pero no tiene ningún motivo para estar expuesta — se revoca EXECUTE de
-- todos los roles (el trigger sigue funcionando igual: la ejecución vía
-- trigger no depende de que el rol que hace el INSERT tenga EXECUTE sobre
-- la función).
-- ============================================================================


-- PARTE 1 — search_path fijo
ALTER FUNCTION public.normalize_description(text) SET search_path = public;
ALTER FUNCTION public.match_category(text, uuid, text) SET search_path = public;
ALTER FUNCTION public.trigger_auto_categorize() SET search_path = public;
ALTER FUNCTION public.record_user_correction(uuid, uuid, text, integer, uuid, text) SET search_path = public;
ALTER FUNCTION public.categoria_direccion_valida(text, text) SET search_path = public;


-- PARTE 2 — elimina el overload huérfano de match_category
DROP FUNCTION IF EXISTS public.match_category(text, uuid);


-- PARTE 3 — cierra el hueco real de acceso anónimo
REVOKE EXECUTE ON FUNCTION public.registrar_uso_ia(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
