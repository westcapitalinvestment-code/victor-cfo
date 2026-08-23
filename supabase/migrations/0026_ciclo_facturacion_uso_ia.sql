ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ciclo_inicio date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ciclo_fin date;

ALTER TABLE uso_ia_mensual RENAME COLUMN anio_mes TO ciclo_clave;

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
