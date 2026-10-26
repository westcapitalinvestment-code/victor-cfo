// Manual del plan GRATIS (26 oct 2026, pedido de Joel: "el plan gratis se
// maneja diferente y no tiene a quien preguntarle"). En el plan gratis no hay
// chat de VICTOR ni conexión al banco: el usuario toca las tarjetas del inicio
// y anota lo suyo ahí. Por eso tiene su propio manual (/dashboard/manual-gratis
// y /manual-gratis). El mismo contenido se copia a manual_articulos
// (migración 0195) para que el agente de soporte@ pueda contestar.
// Sin precios de planes a propósito: la fuente única es victorcfo.com.

import type { ModuloManual } from "@/lib/manual-usuario";

export const GRUPOS_GRATIS = [
  "Empezar",
  "Anotar tus finanzas",
  "Tu plan y tus avisos",
  "Más herramientas",
  "Cuenta y ayuda",
] as const;

const P = "Plan Gratis";

export const MODULOS_GRATIS: ModuloManual[] = [
  {
    id: "gratis-empezar",
    grupo: "Empezar",
    titulo: "Cómo funciona el plan Gratis",
    icono: "ti-rocket",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Qué incluye, qué cambia frente a los otros planes y cómo se usa.",
    donde: "Pestaña Inicio (la casita, abajo a la izquierda).",
    pasos: [
      {
        titulo: "Tú anotas, VICTOR calcula",
        texto:
          "En el plan Gratis no se conecta el banco ni hay chat con VICTOR. Tú anotas lo tuyo tocando las tarjetas del Inicio (Balance, Ingresos, Gastos, Ahorrado, Deuda, Inversiones) y la app lo suma y lo resta por ti. Todo se actualiza al momento.",
      },
      {
        titulo: "Empieza por tu balance",
        texto:
          "Toca la tarjeta de balance y anota cuánto tienes hoy (botón \"Anotar mi balance\"). Ese dinero queda en una cuenta manual llamada \"Efectivo\". A partir de ahí, cada ingreso lo suma y cada gasto lo resta.",
      },
      {
        titulo: "Anota ingresos y gastos cuando pasen",
        texto:
          "Toca \"Ingresos\" o \"Gastos\" para registrar cada movimiento. También puedes subir el estado de cuenta de tu banco (ver \"Subir estado de cuenta\") para no anotar uno por uno.",
      },
      {
        titulo: "Mira tu plan y tus avisos",
        texto:
          "La tarjeta \"Tu plan\" te dice cuál es el siguiente paso, y \"Alertas inteligentes\" te avisa de cosas que conviene revisar. Todo se calcula con tus propios números.",
      },
    ],
    consejos: [
      "Anota a diario o una vez por semana; lo importante es que sea un hábito corto.",
      "Si te equivocas en algo, casi todo se puede editar o quitar (ver cada sección).",
    ],
    preguntas: [
      { p: "¿Por qué no veo el chat de VICTOR?", r: "El chat con VICTOR es de los planes de pago. En el Gratis usas las tarjetas, el plan, las alertas y este manual. Cualquier duda: soporte@victorcfo.com." },
      { p: "¿Por qué no puedo conectar mi banco?", r: "La conexión automática al banco es de los planes de pago. En Gratis anotas a mano o subes el estado de cuenta." },
    ],
  },
  {
    id: "gratis-balance",
    grupo: "Anotar tus finanzas",
    titulo: "Balance, Ingresos y Gastos",
    icono: "ti-wallet",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Anota cuánto tienes y registra lo que entra y lo que sale.",
    donde: "Inicio → sección \"Registra tus finanzas aquí\" (toca una tarjeta).",
    pasos: [
      {
        titulo: "Anota o ajusta tu balance",
        texto:
          "Toca la tarjeta de balance. La primera vez verás \"Anotar mi balance\"; después, \"Ajustar mi balance\". Escribe lo que tienes en total y guarda. Úsalo también para corregir si el número no cuadra con la realidad.",
      },
      {
        titulo: "Registra un ingreso",
        texto:
          "Toca \"Ingresos\", escribe el monto, de dónde vino y la fecha, y guarda. Tu balance sube por ese monto.",
      },
      {
        titulo: "Registra un gasto",
        texto:
          "Toca \"Gastos\", escribe el monto, en qué fue y la fecha, y guarda. Tu balance baja por ese monto. Los gastos alimentan la regla 50/30/20 y tu resumen del mes.",
      },
      {
        titulo: "Revisa o corrige en Transacciones",
        texto:
          "La pestaña Transacciones (abajo) lista todo lo anotado. Desde ahí puedes buscar, corregir o borrar un movimiento.",
      },
    ],
    ejemplo: "Tienes $500 en efectivo. Anotas balance $500. Cobras $200 (ingreso) y pagas $50 de luz (gasto): tu balance queda en $650.",
    preguntas: [
      { p: "Anoté algo mal, ¿cómo lo arreglo?", r: "Ve a Transacciones, toca el movimiento y edítalo o bórralo. Si es el balance total, usa \"Ajustar mi balance\"." },
    ],
  },
  {
    id: "gratis-ahorro",
    grupo: "Anotar tus finanzas",
    titulo: "Ahorrado, Inversiones y Págate primero",
    icono: "ti-pig-money",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Aporta a tu ahorro o inversión antes de gastar; corrige tu saldo si hace falta.",
    donde: "Inicio → tarjetas \"Ahorrado\" e \"Inversiones\".",
    pasos: [
      {
        titulo: "Aporta (págate primero)",
        texto:
          "Toca \"Ahorrado\" (o \"Inversiones\") y usa \"Aportar (págate primero)\". Escribe el monto: sale de tu balance y se suma a tu ahorro. La idea es separar tu ahorro apenas cobras, antes de gastar.",
      },
      {
        titulo: "Corrige tu saldo",
        texto:
          "Si el saldo ahorrado no es el real, usa \"Corregir mi saldo\" y escribe lo que de verdad tienes.",
      },
      {
        titulo: "Mira tus aportes del mes",
        texto:
          "En la tarjeta \"Tu plan\" aparece \"Tus aportes de este mes\". Si te equivocaste en uno, toca \"Deshacer\".",
      },
    ],
    consejos: ["Aunque sean $10 por cobro, la constancia importa más que el monto."],
    preguntas: [
      { p: "¿Qué es el fondo de emergencia?", r: "Es el ahorro para imprevistos. En Tu plan ves cuántos meses de gastos cubre tu ahorro; una buena primera meta es tener 3 meses." },
    ],
  },
  {
    id: "gratis-deudas",
    grupo: "Anotar tus finanzas",
    titulo: "Deudas: bola de nieve o avalancha",
    icono: "ti-flame",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Anota tus deudas y ve en qué orden pagarlas y cuándo quedas libre.",
    donde: "Inicio → tarjeta \"Deuda\" → \"Ver mi plan para pagarlas →\", o el enlace \"Pagar mis deudas (nieve o avalancha)\".",
    pasos: [
      {
        titulo: "Anota cada deuda",
        texto:
          "Toca la tarjeta \"Deuda\" → \"Anotar una deuda\". Pon el nombre (ej. tarjeta Visa), el saldo, el interés anual (APR) y el pago mínimo mensual. Repite por cada deuda.",
      },
      {
        titulo: "Elige el método",
        texto:
          "Bola de nieve: pagas primero la deuda más pequeña (ganas motivación rápido). Avalancha: pagas primero la de mayor interés (pagas menos intereses en total). Puedes cambiar entre las dos y comparar.",
      },
      {
        titulo: "Añade un extra mensual",
        texto:
          "Escribe cuánto extra puedes pagar al mes además de los mínimos. La app te muestra el orden de pago, en cuántos meses quedas libre de deudas y cuánto pagas en intereses.",
      },
      {
        titulo: "Paga, edita o quita",
        texto:
          "En cada deuda: \"Pagar\" (resta el pago de tu balance y baja el saldo), \"Editar\" (corrige datos) o \"Quitar\" (la elimina).",
      },
    ],
    ejemplo: "Visa $800 al 24%, Préstamo $3,000 al 9%. Con bola de nieve pagas primero la Visa; con avalancha también (es la de mayor interés).",
    preguntas: [
      { p: "¿Cuál método me conviene?", r: "Si necesitas motivación, bola de nieve. Si quieres gastar menos en intereses, avalancha. Ambos funcionan si los sigues." },
    ],
  },
  {
    id: "gratis-plan",
    grupo: "Tu plan y tus avisos",
    titulo: "Tu plan (cuestionario y 3 caminos)",
    icono: "ti-route",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Un cuestionario de 4 preguntas te arma una ruta paso a paso.",
    donde: "Inicio → tarjeta \"Tu plan\".",
    pasos: [
      {
        titulo: "Contesta 4 preguntas",
        texto:
          "La primera vez te hace un cuestionario corto sobre tu situación. Según tus respuestas te asigna uno de tres caminos: Salir de deudas, Ordenar y crecer, o Probar la app.",
      },
      {
        titulo: "Sigue los pasos",
        texto:
          "Cada camino tiene pasos con un botón de acción (por ejemplo \"Anotar balance\", \"Anotar deudas\", \"Aportar a ahorro\", \"Pagar una deuda\", \"Anotar un ingreso\", \"Subir estado\", \"Ver mi reparto\"). Toca el botón y te lleva directo a hacerlo.",
      },
      {
        titulo: "Mira tus números clave",
        texto:
          "Verás Patrimonio neto, Fondo de emergencia, Págate primero y Flujo neto del mes, además de \"Lo que sigue\".",
      },
      {
        titulo: "Cambia de camino",
        texto:
          "Si tu situación cambió, toca \"Rehacer el cuestionario\". Cuando completas todo verás \"Tu plan está al día\" y \"Ver mi plan\" para repasarlo.",
      },
    ],
  },
  {
    id: "gratis-alertas",
    grupo: "Tu plan y tus avisos",
    titulo: "Alertas inteligentes y la campanita",
    icono: "ti-bell",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Avisos con tus propios números; márcalos como vistos cuando los atiendas.",
    donde: "Inicio → \"Alertas inteligentes\" y la campanita de arriba.",
    pasos: [
      {
        titulo: "Lee las alertas",
        texto:
          "La app revisa tus números y te avisa cosas como gastos altos, deudas con interés fuerte o falta de ahorro. La campanita de arriba muestra cuántas tienes sin ver.",
      },
      {
        titulo: "Márcalas como vistas",
        texto:
          "Toca \"Vista\" en cada alerta, o \"Marcar todas como vistas\". Las vistas se esconden y el contador baja.",
      },
      {
        titulo: "Vuelve a verlas",
        texto:
          "Toca \"Ver alertas vistas\" y luego \"Volver a ver\" en la que quieras recuperar.",
      },
    ],
    preguntas: [
      { p: "Marqué una alerta como vista y el problema sigue, ¿vuelve a avisar?", r: "No sola; la puedes recuperar con \"Volver a ver\". Si cambia la situación, aparecerá una alerta nueva." },
    ],
  },
  {
    id: "gratis-resumen",
    grupo: "Tu plan y tus avisos",
    titulo: "Resumen del mes y regla 50/30/20",
    icono: "ti-chart-pie",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Cómo vas este mes y si tu reparto sigue la regla 50/30/20.",
    donde: "Inicio → \"Tu resumen del mes\" y tarjeta 50/30/20.",
    pasos: [
      {
        titulo: "Tu resumen del mes",
        texto:
          "Un resumen en palabras sencillas de lo que ganaste, gastaste y ahorraste este mes. Se arma con lo que anotaste, así que mientras más completo lo tengas, más útil es.",
      },
      {
        titulo: "Regla 50/30/20",
        texto:
          "La regla sugiere usar 50% de tus ingresos en necesidades, 30% en gustos y 20% en ahorro o deudas. La tarjeta compara tu reparto real con esa guía.",
      },
    ],
    consejos: ["Es una guía, no una obligación. Ajusta los porcentajes a tu realidad poco a poco."],
  },
  {
    id: "gratis-subir-estado",
    grupo: "Más herramientas",
    titulo: "Subir estado de cuenta y exportar",
    icono: "ti-file-upload",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Sube el estado de tu banco para no anotar uno por uno; exporta a Excel o PDF.",
    donde: "Pestaña Cuentas (subir) y Transacciones (exportar).",
    pasos: [
      {
        titulo: "Descarga el estado de tu banco",
        texto:
          "En la página o app de tu banco descarga el estado de cuenta en CSV, Excel o PDF.",
      },
      {
        titulo: "Súbelo",
        texto:
          "Toca \"Subir estado\" (en Cuentas o desde un paso de Tu plan), elige el archivo y confirma. Los movimientos se importan a tu cuenta.",
      },
      {
        titulo: "Revisa lo importado",
        texto:
          "Entra a Transacciones y revisa que todo esté bien. Corrige o borra lo que haga falta.",
      },
      {
        titulo: "Exporta tus transacciones",
        texto:
          "En Transacciones usa el botón de reporte para bajar tus movimientos en Excel o PDF, por ejemplo para tu contable o tus récords.",
      },
    ],
    preguntas: [
      { p: "No se importó bien mi archivo, ¿qué hago?", r: "Prueba con el CSV o Excel del banco en vez del PDF. Si sigue fallando, escríbenos a soporte@victorcfo.com con el nombre del banco." },
    ],
  },
  {
    id: "gratis-metas",
    grupo: "Más herramientas",
    titulo: "Metas y calculadora de ahorro",
    icono: "ti-target",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Crea metas y calcula cuánto ahorrar cada mes para llegar a tiempo.",
    donde: "Pestaña Metas.",
    pasos: [
      {
        titulo: "Crea una meta",
        texto: "En Metas, toca crear nueva: nombre, monto objetivo y, si quieres, la fecha límite.",
      },
      {
        titulo: "Usa la calculadora",
        texto:
          "Al editar una meta, la calculadora te dice cuánto debes ahorrar al mes para llegar a la fecha. Cambia la fecha o el monto y se recalcula sola.",
      },
      {
        titulo: "Actualiza tu progreso",
        texto: "Edita la meta para ir sumando lo que llevas ahorrado.",
      },
    ],
  },
  {
    id: "gratis-docs-citas",
    grupo: "Más herramientas",
    titulo: "Documentos y citas",
    icono: "ti-file-text",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Guarda documentos importantes y ve tu próxima cita.",
    donde: "Pestaña Documentos y tarjeta \"Próxima cita\" del Inicio.",
    pasos: [
      { titulo: "Guarda documentos", texto: "En Documentos puedes subir y ordenar archivos importantes (recibos, contratos, estados)." },
      { titulo: "Citas", texto: "Si agendaste una cita, aparece en el Inicio como \"Próxima cita\"." },
    ],
  },
  {
    id: "gratis-cuenta",
    grupo: "Cuenta y ayuda",
    titulo: "Configuración, referidos y seguridad",
    icono: "ti-settings",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Tu cuenta, PIN, verificación en dos pasos, notificaciones y referidos.",
    donde: "Pestaña Config.",
    pasos: [
      { titulo: "Tu cuenta", texto: "Edita tu nombre, correo y teléfono." },
      { titulo: "Seguridad", texto: "Activa un PIN, la verificación en dos pasos (MFA) y el cierre automático de sesión por inactividad." },
      { titulo: "Notificaciones", texto: "Activa o apaga los avisos del dispositivo." },
      { titulo: "Referidos", texto: "Comparte tu enlace personal. Cuando un amigo se suscribe a un plan de pago recibes crédito (ver detalle en la tarjeta de referidos)." },
      { titulo: "Cambiar de plan o borrar cuenta", texto: "Desde \"Gestionar plan\" puedes pasarte a un plan de pago cuando quieras. \"Eliminar cuenta\" está al final." },
    ],
  },
  {
    id: "gratis-mejorar",
    grupo: "Cuenta y ayuda",
    titulo: "Qué desbloquean los planes de pago",
    icono: "ti-lock-open",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Lo que no está en Gratis y cómo pasarte a un plan de pago.",
    donde: "Config → Gestionar plan, o el botón de mejora dentro de la app.",
    pasos: [
      { titulo: "Chat con VICTOR", texto: "Pregúntale lo que sea de tu dinero y que anote movimientos por ti." },
      { titulo: "Banco conectado", texto: "Tus cuentas y movimientos se importan solos, sin anotar a mano." },
      { titulo: "Negocio", texto: "Facturación, pagos a contratistas y más están en los planes Pro. Precios actualizados en victorcfo.com." },
    ],
    consejos: ["Tus datos del plan Gratis se conservan al cambiar de plan."],
  },
  {
    id: "gratis-soporte",
    grupo: "Cuenta y ayuda",
    titulo: "Cómo pedir ayuda",
    icono: "ti-lifebuoy",
    audiencia: ["usuario"],
    plan: P,
    resumen: "Escríbenos a soporte@victorcfo.com.",
    donde: "Config → Soporte → \"Escríbenos\".",
    pasos: [
      { titulo: "Revisa este manual", texto: "Usa el buscador de arriba: casi siempre la respuesta está aquí." },
      { titulo: "Escríbenos", texto: "Toca \"Escríbenos\" en Config o manda un correo a soporte@victorcfo.com. Cuéntanos qué intentabas hacer y qué pasó." },
    ],
  },
];
