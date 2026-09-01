-- ============================================================================
-- VICTOR CFO — 0026: anclar el tope de gasto de IA al ciclo de facturación
-- REAL de Stripe, no al mes calendario.
--
-- Problema detectado por Joel (23 agosto 2026) probando el chat: el tope de
-- app/api/victor/route.ts (0018/0019) calculaba el "ritmo parejo" con el día
-- del MES CALENDARIO (ej. hoy 23 de agosto = 23/31 del presupuesto ya
-- disponible). Pero Stripe cobra en un ciclo que rueda desde la fecha en
-- que la persona pagó (23 ago → 23 sept → 23 oct...), no desde el día 1 de
-- cada mes. Eso significa que alguien que se registrara, digamos, el 31 de
-- agosto tendría casi nada de presupuesto ese día — pero el 1 de septiembre
-- el contador de uso_ia_mensual (keyed por 'YYYY-MM') resetearía solo, dando
-- casi un mes completo de presupuesto de golpe, TODAVÍA dentro del mismo
-- ciclo que ya había pagado una vez (su próximo cobro real es el 30 de
-- septiembre) — pudiendo terminar gastando casi el doble del tope pensado
-- por ciclo, comiéndose el margen calculado en 0019/0025.
--
-- Este cambio:
-- 1. Agrega ciclo_inicio/ciclo_fin a users — las fechas del ciclo de
--    facturación actual, que el webhook de Stripe llena en cada activación
--    y renovación (checkout.session.completed / customer.subscription.updated).
-- 2. Renombra uso_ia_mensual.anio_mes → ciclo_clave (mismo tipo, texto) —
--    ahora guarda la fecha de ciclo_inicio (ej. '2026-08-23') para cuentas
--    con Stripe, o sigue usando 'YYYY-MM' como respaldo para cuentas sin
--    ciclo de Stripe (ej. las "trialing" de antes de conectar el checkout).
-- 3. Actualiza registrar_uso_ia() para recibir la clave de ciclo desde el
--    llamador en vez de calcularla internamente con to_char(now(), 'YYYY-MM').
-- ============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ciclo_inicio date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ciclo_fin date;

ALTER TABLE uso_ia_mensual RENAME COLUMN anio_mes TO ciclo_clave;

-- Hay que borrar la versión vieja de 2 parámetros antes de crear la nueva
-- de 3 — Postgres las trataría como funciones distintas (overload) si no
-- se borra la vieja, y el código ya no la llama con esa forma.
DROP FUNCTION IF EXISTS registrar_uso_ia(uuid, numeric);

CREATE OR REPLACE FUNCTION registrar_uso_ia(p_owner_id uuid, p_costo_centavos numeric, p_ciclo_clave text)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'No autorizado para registrar uso de otro usuario.';
  END IF;

  INSERT INTO uso_ia_mensual (owner_id, ciclo_clave, costo_centavos)
  VALUES (p_owner_id, p_ciclo_clave, p_costo_centavos)
  ON CONFLICT (owner_id, ciclo_clave)
  DO UPDATE SET
    costo_centavos = uso_ia_mensual.costo_centavos + EXCLUDED.costo_centavos,
    actualizado_en = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_uso_ia(uuid, numeric, text) TO authenticated;
