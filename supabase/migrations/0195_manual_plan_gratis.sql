-- ============================================================================
-- VICTOR CFO — 0195: manual del plan GRATIS para el agente de soporte@ y VICTOR
-- (26 oct 2026, pedido de Joel). Mismo contenido que lib/manual-gratis.ts.
-- Solo INSERT/UPSERT en manual_articulos; idempotente. No toca schema.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'manual-gratis-empezar',
  'Cómo funciona el plan Gratis (plan Gratis)',
  'Plan gratis: Qué incluye, qué cambia frente a los otros planes y cómo se usa.',
  $md$PLAN GRATIS — Cómo funciona el plan Gratis. Dónde: Pestaña Inicio (la casita, abajo a la izquierda).

1) Tú anotas, VICTOR calcula: En el plan Gratis no se conecta el banco ni hay chat con VICTOR. Tú anotas lo tuyo tocando las tarjetas del Inicio (Balance, Ingresos, Gastos, Ahorrado, Deuda, Inversiones) y la app lo suma y lo resta por ti. Todo se actualiza al momento.
2) Empieza por tu balance: Toca la tarjeta de balance y anota cuánto tienes hoy (botón "Anotar mi balance"). Ese dinero queda en una cuenta manual llamada "Efectivo". A partir de ahí, cada ingreso lo suma y cada gasto lo resta.
3) Anota ingresos y gastos cuando pasen: Toca "Ingresos" o "Gastos" para registrar cada movimiento. También puedes subir el estado de cuenta de tu banco (ver "Subir estado de cuenta") para no anotar uno por uno.
4) Mira tu plan y tus avisos: La tarjeta "Tu plan" te dice cuál es el siguiente paso, y "Alertas inteligentes" te avisa de cosas que conviene revisar. Todo se calcula con tus propios números.

CONSEJOS: Anota a diario o una vez por semana; lo importante es que sea un hábito corto. Si te equivocas en algo, casi todo se puede editar o quitar (ver cada sección).

PREGUNTAS FRECUENTES:
- ¿Por qué no veo el chat de VICTOR? El chat con VICTOR es de los planes de pago. En el Gratis usas las tarjetas, el plan, las alertas y este manual. Cualquier duda: soporte@victorcfo.com.
- ¿Por qué no puedo conectar mi banco? La conexión automática al banco es de los planes de pago. En Gratis anotas a mano o subes el estado de cuenta.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-balance',
  'Balance, Ingresos y Gastos (plan Gratis)',
  'Plan gratis: Anota cuánto tienes y registra lo que entra y lo que sale.',
  $md$PLAN GRATIS — Balance, Ingresos y Gastos. Dónde: Inicio → sección "Registra tus finanzas aquí" (toca una tarjeta).

1) Anota o ajusta tu balance: Toca la tarjeta de balance. La primera vez verás "Anotar mi balance"; después, "Ajustar mi balance". Escribe lo que tienes en total y guarda. Úsalo también para corregir si el número no cuadra con la realidad.
2) Registra un ingreso: Toca "Ingresos", escribe el monto, de dónde vino y la fecha, y guarda. Tu balance sube por ese monto.
3) Registra un gasto: Toca "Gastos", escribe el monto, en qué fue y la fecha, y guarda. Tu balance baja por ese monto. Los gastos alimentan la regla 50/30/20 y tu resumen del mes.
4) Revisa o corrige en Transacciones: La pestaña Transacciones (abajo) lista todo lo anotado. Desde ahí puedes buscar, corregir o borrar un movimiento.

EJEMPLO: Tienes $500 en efectivo. Anotas balance $500. Cobras $200 (ingreso) y pagas $50 de luz (gasto): tu balance queda en $650.

PREGUNTAS FRECUENTES:
- Anoté algo mal, ¿cómo lo arreglo? Ve a Transacciones, toca el movimiento y edítalo o bórralo. Si es el balance total, usa "Ajustar mi balance".

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-ahorro',
  'Ahorrado, Inversiones y Págate primero (plan Gratis)',
  'Plan gratis: Aporta a tu ahorro o inversión antes de gastar; corrige tu saldo si hace falta.',
  $md$PLAN GRATIS — Ahorrado, Inversiones y Págate primero. Dónde: Inicio → tarjetas "Ahorrado" e "Inversiones".

1) Aporta (págate primero): Toca "Ahorrado" (o "Inversiones") y usa "Aportar (págate primero)". Escribe el monto: sale de tu balance y se suma a tu ahorro. La idea es separar tu ahorro apenas cobras, antes de gastar.
2) Corrige tu saldo: Si el saldo ahorrado no es el real, usa "Corregir mi saldo" y escribe lo que de verdad tienes.
3) Mira tus aportes del mes: En la tarjeta "Tu plan" aparece "Tus aportes de este mes". Si te equivocaste en uno, toca "Deshacer".

CONSEJOS: Aunque sean $10 por cobro, la constancia importa más que el monto.

PREGUNTAS FRECUENTES:
- ¿Qué es el fondo de emergencia? Es el ahorro para imprevistos. En Tu plan ves cuántos meses de gastos cubre tu ahorro; una buena primera meta es tener 3 meses.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-deudas',
  'Deudas: bola de nieve o avalancha (plan Gratis)',
  'Plan gratis: Anota tus deudas y ve en qué orden pagarlas y cuándo quedas libre.',
  $md$PLAN GRATIS — Deudas: bola de nieve o avalancha. Dónde: Inicio → tarjeta "Deuda" → "Ver mi plan para pagarlas →", o el enlace "Pagar mis deudas (nieve o avalancha)".

1) Anota cada deuda: Toca la tarjeta "Deuda" → "Anotar una deuda". Pon el nombre (ej. tarjeta Visa), el saldo, el interés anual (APR) y el pago mínimo mensual. Repite por cada deuda.
2) Elige el método: Bola de nieve: pagas primero la deuda más pequeña (ganas motivación rápido). Avalancha: pagas primero la de mayor interés (pagas menos intereses en total). Puedes cambiar entre las dos y comparar.
3) Añade un extra mensual: Escribe cuánto extra puedes pagar al mes además de los mínimos. La app te muestra el orden de pago, en cuántos meses quedas libre de deudas y cuánto pagas en intereses.
4) Paga, edita o quita: En cada deuda: "Pagar" (resta el pago de tu balance y baja el saldo), "Editar" (corrige datos) o "Quitar" (la elimina).

EJEMPLO: Visa $800 al 24%, Préstamo $3,000 al 9%. Con bola de nieve pagas primero la Visa; con avalancha también (es la de mayor interés).

PREGUNTAS FRECUENTES:
- ¿Cuál método me conviene? Si necesitas motivación, bola de nieve. Si quieres gastar menos en intereses, avalancha. Ambos funcionan si los sigues.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-plan',
  'Tu plan (cuestionario y 3 caminos) (plan Gratis)',
  'Plan gratis: Un cuestionario de 4 preguntas te arma una ruta paso a paso.',
  $md$PLAN GRATIS — Tu plan (cuestionario y 3 caminos). Dónde: Inicio → tarjeta "Tu plan".

1) Contesta 4 preguntas: La primera vez te hace un cuestionario corto sobre tu situación. Según tus respuestas te asigna uno de tres caminos: Salir de deudas, Ordenar y crecer, o Probar la app.
2) Sigue los pasos: Cada camino tiene pasos con un botón de acción (por ejemplo "Anotar balance", "Anotar deudas", "Aportar a ahorro", "Pagar una deuda", "Anotar un ingreso", "Subir estado", "Ver mi reparto"). Toca el botón y te lleva directo a hacerlo.
3) Mira tus números clave: Verás Patrimonio neto, Fondo de emergencia, Págate primero y Flujo neto del mes, además de "Lo que sigue".
4) Cambia de camino: Si tu situación cambió, toca "Rehacer el cuestionario". Cuando completas todo verás "Tu plan está al día" y "Ver mi plan" para repasarlo.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-alertas',
  'Alertas inteligentes y la campanita (plan Gratis)',
  'Plan gratis: Avisos con tus propios números; márcalos como vistos cuando los atiendas.',
  $md$PLAN GRATIS — Alertas inteligentes y la campanita. Dónde: Inicio → "Alertas inteligentes" y la campanita de arriba.

1) Lee las alertas: La app revisa tus números y te avisa cosas como gastos altos, deudas con interés fuerte o falta de ahorro. La campanita de arriba muestra cuántas tienes sin ver.
2) Márcalas como vistas: Toca "Vista" en cada alerta, o "Marcar todas como vistas". Las vistas se esconden y el contador baja.
3) Vuelve a verlas: Toca "Ver alertas vistas" y luego "Volver a ver" en la que quieras recuperar.

PREGUNTAS FRECUENTES:
- Marqué una alerta como vista y el problema sigue, ¿vuelve a avisar? No sola; la puedes recuperar con "Volver a ver". Si cambia la situación, aparecerá una alerta nueva.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-resumen',
  'Resumen del mes y regla 50/30/20 (plan Gratis)',
  'Plan gratis: Cómo vas este mes y si tu reparto sigue la regla 50/30/20.',
  $md$PLAN GRATIS — Resumen del mes y regla 50/30/20. Dónde: Inicio → "Tu resumen del mes" y tarjeta 50/30/20.

1) Tu resumen del mes: Un resumen en palabras sencillas de lo que ganaste, gastaste y ahorraste este mes. Se arma con lo que anotaste, así que mientras más completo lo tengas, más útil es.
2) Regla 50/30/20: La regla sugiere usar 50% de tus ingresos en necesidades, 30% en gustos y 20% en ahorro o deudas. La tarjeta compara tu reparto real con esa guía.

CONSEJOS: Es una guía, no una obligación. Ajusta los porcentajes a tu realidad poco a poco.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-subir-estado',
  'Subir estado de cuenta y exportar (plan Gratis)',
  'Plan gratis: Sube el estado de tu banco para no anotar uno por uno; exporta a Excel o PDF.',
  $md$PLAN GRATIS — Subir estado de cuenta y exportar. Dónde: Pestaña Cuentas (subir) y Transacciones (exportar).

1) Descarga el estado de tu banco: En la página o app de tu banco descarga el estado de cuenta en CSV, Excel o PDF.
2) Súbelo: Toca "Subir estado" (en Cuentas o desde un paso de Tu plan), elige el archivo y confirma. Los movimientos se importan a tu cuenta.
3) Revisa lo importado: Entra a Transacciones y revisa que todo esté bien. Corrige o borra lo que haga falta.
4) Exporta tus transacciones: En Transacciones usa el botón de reporte para bajar tus movimientos en Excel o PDF, por ejemplo para tu contable o tus récords.

PREGUNTAS FRECUENTES:
- No se importó bien mi archivo, ¿qué hago? Prueba con el CSV o Excel del banco en vez del PDF. Si sigue fallando, escríbenos a soporte@victorcfo.com con el nombre del banco.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-metas',
  'Metas y calculadora de ahorro (plan Gratis)',
  'Plan gratis: Crea metas y calcula cuánto ahorrar cada mes para llegar a tiempo.',
  $md$PLAN GRATIS — Metas y calculadora de ahorro. Dónde: Pestaña Metas.

1) Crea una meta: En Metas, toca crear nueva: nombre, monto objetivo y, si quieres, la fecha límite.
2) Usa la calculadora: Al editar una meta, la calculadora te dice cuánto debes ahorrar al mes para llegar a la fecha. Cambia la fecha o el monto y se recalcula sola.
3) Actualiza tu progreso: Edita la meta para ir sumando lo que llevas ahorrado.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-docs-citas',
  'Documentos y citas (plan Gratis)',
  'Plan gratis: Guarda documentos importantes y ve tu próxima cita.',
  $md$PLAN GRATIS — Documentos y citas. Dónde: Pestaña Documentos y tarjeta "Próxima cita" del Inicio.

1) Guarda documentos: En Documentos puedes subir y ordenar archivos importantes (recibos, contratos, estados).
2) Citas: Si agendaste una cita, aparece en el Inicio como "Próxima cita".

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-cuenta',
  'Configuración, referidos y seguridad (plan Gratis)',
  'Plan gratis: Tu cuenta, PIN, verificación en dos pasos, notificaciones y referidos.',
  $md$PLAN GRATIS — Configuración, referidos y seguridad. Dónde: Pestaña Config.

1) Tu cuenta: Edita tu nombre, correo y teléfono.
2) Seguridad: Activa un PIN, la verificación en dos pasos (MFA) y el cierre automático de sesión por inactividad.
3) Notificaciones: Activa o apaga los avisos del dispositivo.
4) Referidos: Comparte tu enlace personal. Cuando un amigo se suscribe a un plan de pago recibes crédito (ver detalle en la tarjeta de referidos).
5) Cambiar de plan o borrar cuenta: Desde "Gestionar plan" puedes pasarte a un plan de pago cuando quieras. "Eliminar cuenta" está al final.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-mejorar',
  'Qué desbloquean los planes de pago (plan Gratis)',
  'Plan gratis: Lo que no está en Gratis y cómo pasarte a un plan de pago.',
  $md$PLAN GRATIS — Qué desbloquean los planes de pago. Dónde: Config → Gestionar plan, o el botón de mejora dentro de la app.

1) Chat con VICTOR: Pregúntale lo que sea de tu dinero y que anote movimientos por ti.
2) Banco conectado: Tus cuentas y movimientos se importan solos, sin anotar a mano.
3) Negocio: Facturación, pagos a contratistas y más están en los planes Pro. Precios actualizados en victorcfo.com.

CONSEJOS: Tus datos del plan Gratis se conservan al cambiar de plan.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
),
(
  'manual-gratis-soporte',
  'Cómo pedir ayuda (plan Gratis)',
  'Plan gratis: Escríbenos a soporte@victorcfo.com.',
  $md$PLAN GRATIS — Cómo pedir ayuda. Dónde: Config → Soporte → "Escríbenos".

1) Revisa este manual: Usa el buscador de arriba: casi siempre la respuesta está aquí.
2) Escríbenos: Toca "Escríbenos" en Config o manda un correo a soporte@victorcfo.com. Cuéntanos qué intentabas hacer y qué pasó.

Este usuario no tiene chat con VICTOR; si necesita más ayuda, que escriba a soporte@victorcfo.com.$md$
)
ON CONFLICT (slug) DO UPDATE
  SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido, updated_at = now();
