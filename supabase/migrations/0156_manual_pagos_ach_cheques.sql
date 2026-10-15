-- 15 oct 2026 — VICTOR (consultar_manual) debe saber cómo se pagan los
-- contratistas desde Pagos: archivo ACH/NACHA y cheques impresos (migración
-- 0155), y qué ve el contable. El artículo 'pagos' decía que VICTOR "no genera
-- un archivo ACH", que ya no es cierto desde la 0118.
update manual_articulos
set
  resumen = resumen || ' También: archivo ACH/NACHA para el banco y cheques impresos con retención.',
  contenido = replace(
    contenido,
    'IMPORTANTE: VICTOR no manda el dinero ni genera un archivo ACH — solo calcula los montos; después de guardar te da una tarjeta con botón "Copiar" para pegar los nombres y montos directo en el portal ACH de tu banco (BPPR).',
    'IMPORTANTE: VICTOR nunca manda el dinero — calcula los montos y deja el pago registrado; tú (o tu secretaria/administrador) lo ejecutas en tu banco. Después de guardar tienes tres caminos: copiar nombres y montos con el botón "Copiar", descargar un archivo ACH/NACHA para subirlo al portal del banco, o imprimir cheques (ver más abajo).'
  ) || $md$

ARCHIVO ACH / NACHA: para pagar a varios contratistas de una vez por ACH sin teclear nada en el banco. Requisitos: (1) la cuenta de tu negocio de donde sale el dinero — Editar negocio → pestaña Facturas → "Cuenta ACH" (banco, routing, número de cuenta y Company ID que te da el banco); (2) la cuenta bancaria de cada contratista — en su ficha en Contratistas (routing, número y tipo de cuenta). Los números de cuenta se guardan cifrados. Luego, en la pestaña Pagos → "Pagos recientes", marcas los pagos pendientes y tocas "Descargar archivo ACH" (también aparece un botón pegado a la corrida que acabas de registrar). El archivo .ach lo subes al portal ACH de tu banco. Si a algún contratista le falta la cuenta, VICTOR lo deja fuera del archivo y te avisa cuál fue.

CHEQUES IMPRESOS (como el talonario de QuickBooks): en Pagos → "Pagos recientes" marcas los pagos y tocas "Imprimir cheques" (o "Imprimir cheques de esta corrida" justo después de registrar). VICTOR genera un PDF con un cheque por hoja Carta: arriba el cheque (fecha, beneficiario, monto en números y en letras, memo) y abajo un talonario (copia del beneficiario) con el bruto, la retención y el neto — el control no se imprime porque el registro queda en VICTOR y así no hay que guardar papel. Cada cheque recibe un número consecutivo por negocio; reimprimir un pago conserva su número, y "Anular" marca el cheque anulado sin reutilizar el número. La retención ya queda registrada porque el cheque es el mismo pago de la corrida — todo cuadra en VICTOR sin doble entrada.
Configuración: panel "Cheques" dentro de "Pagos recientes" — próximo número de cheque (pon el siguiente de tu talonario), fecha y memo, y el tipo de papel: (a) talonario del banco preimpreso — VICTOR imprime solo fecha, beneficiario, monto, memo y el talonario; (b) papel en blanco con tóner MICR — VICTOR imprime además el encabezado de la empresa y, si lo activas, la línea MICR (necesita la Cuenta ACH del negocio y la fuente E-13B instalada; sin tóner MICR el banco no procesa el cheque).
Aclaración importante: un cheque impreso en papel normal sin tóner MICR no lo acepta el banco; usa el talonario preimpreso del banco o papel de cheque con tóner MICR.

QUIÉN LO PUEDE USAR: el dueño y el Administrador ($20/mes, o incluido en Business). La Secretaria no tiene acceso a Pagos.

LO QUE VE EL CONTABLE: en el Portal del Contable, pestaña Pagos, ve el estado 480.6SP por contratista y la lista "Pagos registrados" con fecha, bruto, retención, neto y el número de cheque (o "anulado"), con filtro por fechas y por "solo con cheque". Así cuadra los cheques contra el estado de cuenta del banco sin pedirte nada.

PENDIENTE: VICTOR todavía no concilia automáticamente un cheque con la transacción del banco cuando se cobra; eso se cuadra a mano por número de cheque.$md$
where slug = 'pagos';
