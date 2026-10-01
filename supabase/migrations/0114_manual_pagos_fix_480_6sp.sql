-- Corrige el artículo del manual (slug 'pagos', insertado en la migración
-- 0061) que seguía diciendo "reporte trimestral para el 480.6A/B" — texto
-- que consultar_manual le sirve a VICTOR tal cual, así que un usuario podía
-- preguntarle y VICTOR repetir el error. La migración 0061 ya corrió en
-- producción, así que esto se arregla con un UPDATE, no editando ese
-- archivo viejo (30 sept 2026, Fase 1 — ver 0112/0113 para el resto del
-- fix de 480.6SP).
update manual_articulos
set
  titulo = 'Pagos — pagar a contratistas y calcular la retención (Modelo 480.6SP)',
  resumen ='Cómo añadir contratistas (individuo o corporación), registrar una corrida de pago con retención automática sobre el exceso de $500, ver el depósito MENSUAL que hay que hacer en SURI (480.9A) y exportar la 480.6SP al cierre del año. Plan Pro.',
  contenido = $md$"Pagos" (dentro del negocio, plan Pro) es para pagarle a tus contratistas y calcular la retención de Hacienda. Tiene 3 pestañas: Pagos, Contratistas, Reportes.

AÑADIR CONTRATISTA: pestaña Contratistas → "+ Nuevo" — nombre (obligatorio), Tax ID/SSN (opcional), si es sujeto a retención o exento (y su %, normalmente 10% o 6% con relevo parcial), y si es individuo o corporación/entidad (esto decide la casilla real del Modelo 480.6SP — ver más abajo). Se puede editar o "Archivar" (no se elimina, para no perder su historial).

LA RETENCIÓN ES SOBRE EL EXCESO DE $500: por la Sección 1062.03, los primeros $500 pagados a un mismo contratista en el año natural están exentos — la retención del 10% (o 6% con Certificado de Relevo Parcial de SURI) solo aplica sobre lo que exceda esos $500 acumulados. VICTOR calcula esto solo, llevando la cuenta de lo acumulado por contratista en el año.

CORRIDA DE PAGO: pestaña Pagos → tarjeta "Corrida de pago" — pones el monto bruto a cada contratista que le vas a pagar ese día, la retención se calcula sola, y ves el neto. "Registrar corrida" guarda todo. IMPORTANTE: VICTOR no manda el dinero ni genera un archivo ACH — solo calcula los montos; después de guardar te da una tarjeta con botón "Copiar" para pegar los nombres y montos directo en el portal ACH de tu banco (BPPR).

DEPÓSITO MENSUAL EN SURI (480.9A): esto NO es trimestral — lo retenido cada mes hay que depositarlo en Hacienda vía SURI a más tardar el día 15 del mes siguiente (Formulario 480.9A). El tab Reportes muestra cuánto se retuvo el mes en curso y si ya venció el plazo.

IMPORTAR HISTÓRICO: si ya le pagabas a tus contratistas antes de usar VICTOR (en Excel, otro sistema, o a mano), puedes importar ese historial desde "Importar histórico (CSV)" en el tab Contratistas — así esos pagos cuentan de inmediato hacia el acumulado de $500 y salen en el 480.6SP, sin tener que esperar al próximo año para que el sistema funcione bien.

EL MODELO 480.6SP (anual, no trimestral): pestaña Reportes — resumen bruto/retenido/neto por contratista, con la casilla real que le corresponde a cada uno (1: individuo no sujeto, 2: corporación no sujeta, 3: individuo sujeto, 4: corporación sujeta). Hay un botón de exportación año-fiscal que saca el CSV exacto con las 4 casillas y el Tax ID de cada contratista — es lo que le entregas a tu CPA una vez al año para radicar el 480.6SP antes del 28 de febrero.$md$
where slug = 'pagos';
