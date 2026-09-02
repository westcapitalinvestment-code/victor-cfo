-- 0045_clientes_contacto_secundario.sql (1 sept 2026)
-- Joel venía de FreshBooks, donde para mandar una factura a 2 correos
-- distintos no había más remedio que duplicar el cliente entero (una fila
-- por email). Esto añade un 2do email y un 2do teléfono por cliente, para
-- que un solo cliente pueda tener ambos contactos guardados sin duplicarlo
-- — por ahora es solo de referencia (copiar/pegar a mano al enviar por
-- WhatsApp o email), todavía no hay envío automático a los dos a la vez.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_2 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telefono_2 text;
