// Manual INTERNO del vendedor / socio (26 oct 2026, pedido de Joel): no es parte
// del Manual de Usuario. Se ve solo desde el portal del vendedor
// (/socios/portal -> botón Manual -> /socios/manual).

export type PasoVendedor = { titulo: string; texto: string; foto?: string };
export type ModuloVendedor = {
  id: string;
  grupo: string;
  titulo: string;
  icono: string;
  audiencia: ("vendedor")[];
  plan: string;
  resumen: string;
  donde: string;
  pasos: PasoVendedor[];
  ejemplo?: string;
  consejos?: string[];
  preguntas?: { p: string; r: string }[];
};

export const GRUPOS_VENDEDOR = [
  "Empieza aquí",
  "1. Vender a contables",
  "2. Vender a negocios (Business)",
  "3. Plan Pro con addons",
  "Tu portal y tus pagos",
] as const;

export const MODULOS_VENDEDOR: ModuloVendedor[] = [
  // ───────────────────── ESTRATEGIA DE VENTA (28 oct 2026) ─────────────────────
  {
    id: "vendedor-estrategia",
    grupo: "Empieza aquí",
    titulo: "La estrategia: contables primero",
    icono: "ti-route",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "El orden de venta y qué buscas en cada visita.",
    donde: "Léelo antes de salir a la calle",
    pasos: [
      { titulo: "El orden", texto: "Primero contables, después negocios que califican para el plan Business y, solo si el negocio no necesita todo, el plan Pro con uno o más addons. Cada contable que se queda con VICTOR te abre la puerta a todos sus clientes." },
      { titulo: "La meta con los contables", texto: "Presentarle VICTOR a la mayor cantidad posible de contables. En cada visita buscas tres cosas: que activen su portal, que se lo recomienden a sus clientes y que te pasen referidos." },
      { titulo: "La meta con los negocios", texto: "Hablar solo con negocios que de verdad necesitan el plan Business (ver el módulo de clientes calificados). Es mejor tener 5 conversaciones buenas que 30 con cualquiera." },
      { titulo: "Tu rutina semanal", texto: "Define cuántas oficinas visitas, cuántos negocios calificados conoces y cuántos prospectos registras. Anótalo en el portal el mismo día: la protección de 60 días cuenta desde el registro." },
    ],
    consejos: [
      "Nunca prometas lo que VICTOR no hace. Tu reputación frente al contable vale más que una venta.",
      "Empieza cada día repasando el guion del módulo que vas a usar.",
    ],
  },
  {
    id: "vendedor-contable-dolor",
    grupo: "1. Vender a contables",
    titulo: "Qué le duele al contable y cómo le ayuda VICTOR",
    icono: "ti-heart-rate-monitor",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Los dolores que más se repiten y qué le respondes.",
    donde: "Antes de cada visita a una oficina",
    pasos: [
      { titulo: "Dolor 1: perseguir documentos", texto: "El contable pasa el año pidiendo recibos, estados y facturas a clientes que no los tienen. Con VICTOR el cliente guarda sus documentos y el contable los ve en el portal, sin llamadas ni WhatsApps." },
      { titulo: "Dolor 2: clientes desorganizados en abril", texto: "Los números llegan tarde y mezclados. Con VICTOR el contable ve las transacciones categorizadas durante todo el año y descarga reportes en PDF o Excel cuando los necesita." },
      { titulo: "Dolor 3: errores que luego le tocan a él", texto: "Retenciones mal calculadas, 480.6SP incompletas, comidas pasadas del límite, ingresos mezclados con gastos. El portal le muestra alertas por cliente y por todo su portafolio para atenderlas a tiempo." },
      { titulo: "Dolor 4: no saber cuál cliente necesita atención", texto: "El portal agrupa las alertas por tipo y permite marcar clientes favoritos para atender primero a los que más lo necesitan." },
      { titulo: "Dolor 5: conseguir clientes nuevos", texto: "Los usuarios de VICTOR que buscan contable lo encuentran en el directorio de contables si la oficina completa su perfil. Además, el contable puede invitar clientes nuevos con el programa Firma Accountant." },
      { titulo: "Lo que no debes decir", texto: "VICTOR no reemplaza al contable ni da asesoría contributiva. Es la herramienta que le trae la información ordenada. El portal del contable es de solo lectura sobre los datos del cliente." },
    ],
    ejemplo: "“Licenciado, ¿cuánto tiempo se le va cada año detrás de los recibos de sus clientes? Con VICTOR usted entra al portal, ve todo ordenado y descarga el reporte. Sus clientes dejan de llamarle por papeles.”",
    consejos: [
      "Escucha primero cuál de los cinco dolores es el suyo y habla solo de ese.",
    ],
  },
  {
    id: "vendedor-contable-visita",
    grupo: "1. Vender a contables",
    titulo: "La visita al contable, paso a paso",
    icono: "ti-building",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Guion de 5 pasos para la reunión con una oficina.",
    donde: "Oficina del contable",
    pasos: [
      { titulo: "1. Apertura", texto: "Preséntate y haz una pregunta que reconozca: “¿Qué parte del año le da más trabajo con sus clientes, perseguir documentos o cuadrar los números en abril?”" },
      { titulo: "2. Descubrimiento", texto: "Antes de mostrar nada pregunta: ¿Cuántos clientes lleva? ¿Cuántos son negocios con empleados o contratistas? ¿Cómo recibe hoy la información? ¿Qué herramienta usa? ¿Qué cliente le da más problema? Anota las respuestas." },
      { titulo: "3. Presentación", texto: "Abre la cuenta demo y enséñale solo lo que responde a lo que dijo: el portal de contable, las alertas, la bóveda compartida, los reportes y, si tiene clientes con empleados o contratistas, Pagos y Nómina. No hagas el recorrido completo." },
      { titulo: "4. Evidencia y dudas", texto: "Responde con honestidad (ver el módulo de objeciones). Deja claro qué hace y qué no hace VICTOR. Ofrece que pruebe el portal con un cliente real." },
      { titulo: "5. Cierre con un paso concreto", texto: "Propón tres cosas: que active su portal ahora mismo, que complete el perfil de su oficina para salir en el directorio y que te dé los nombres de 2 o 3 clientes a quienes les convenga VICTOR. Registra la oficina y los prospectos en tu portal ese mismo día." },
      { titulo: "6. Seguimiento", texto: "Vuelve en una semana con una pregunta: “¿Pudo ver el portal? ¿Qué le faltó?”. Cuando la oficina activa su portal y trae clientes que pagan, generas bonos de oficinas (ver el módulo de oficinas y bonos)." },
    ],
    consejos: [
      "Lleva el link de tu QR y la cuenta demo lista antes de entrar.",
      "No pidas un favor, ofrece una ayuda: menos papeles y más clientes.",
    ],
  },
  {
    id: "vendedor-contable-objeciones",
    grupo: "1. Vender a contables",
    titulo: "Objeciones del contable y cómo contestarlas",
    icono: "ti-message-question",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Las dudas más comunes de una oficina.",
    donde: "Cuando el contable pone una duda",
    pasos: [
      { titulo: "Escucha y no discutas", texto: "Deja que termine, repite lo que entendiste y contesta con un hecho. Si no lo sabes, dilo y prométele la respuesta." },
    ],
    preguntas: [
      { p: "“Ya tengo mi sistema.”", r: "VICTOR no tiene que reemplazarlo. Es lo que ordena la información de tu cliente antes de que llegue a tu sistema. Prueba con un solo cliente." },
      { p: "“¿VICTOR me quita a mis clientes?”", r: "No. El cliente sigue siendo tuyo. VICTOR no da asesoría contributiva; tú sigues haciendo ese trabajo con mejores datos." },
      { p: "“Mis clientes no usan tecnología.”", r: "Entonces empieza por el cliente más ordenado o por uno que ya te da dolores de cabeza. El plan gratis permite probar sin riesgo." },
      { p: "“¿Es seguro?”", r: "El portal es de solo lectura, el cliente decide qué comparte (por ejemplo, sus finanzas personales) y hay PIN y verificación en dos pasos." },
      { p: "“No tengo tiempo.”", r: "Activar el portal toma pocos minutos y lo que ahorra es justo el tiempo que hoy gasta pidiendo papeles." },
      { p: "“¿Cuánto me cuesta?”", r: "No inventes cifras. Si le interesa invitar clientes nuevos, explícale el programa Firma Accountant y confirma los detalles y precios actuales en victorcfo.com o con el equipo de VICTOR antes de prometer nada." },
    ],
  },
  {
    id: "vendedor-negocio-calificar",
    grupo: "2. Vender a negocios (Business)",
    titulo: "Qué negocio califica para Business",
    icono: "ti-target-arrow",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Cómo saber si vale la pena ofrecerle el plan Business.",
    donde: "Antes de presentar el plan",
    pasos: [
      { titulo: "Hazle estas preguntas", texto: "¿Tiene empleados? ¿Le paga a contratistas o técnicos? ¿Factura y cobra a clientes? ¿Cobra IVU? ¿Tiene más de una persona que toca el dinero (secretaria, administrador)? ¿Su contable le pide los números todos los meses o solo en abril?" },
      { titulo: "Un negocio califica si…", texto: "Tiene empleados o contratistas y factura a clientes, y además siente dolor en al menos una de estas áreas: no sabe si gana dinero, cobra tarde, paga nómina o contratistas a mano, o su contable le reclama la información." },
      { titulo: "Un negocio todavía no califica si…", texto: "Es solo una persona sin empleados ni facturación recurrente, o no tiene ningún dolor con sus números. A esos ofréceles el plan gratis o Core y sigue en contacto." },
      { titulo: "Por qué Business", texto: "Business incluye lo que un negocio de verdad usa a la vez: facturación, pagos a contratistas, nómina, técnicos y administración, con el contable viendo todo. Un negocio que califica se beneficia de tenerlo junto y no de comprar piezas sueltas." },
    ],
    consejos: [
      "Si el negocio ya tiene contable, empieza por contárselo al contable: tiene más fuerza que tú.",
    ],
  },
  {
    id: "vendedor-negocio-visita",
    grupo: "2. Vender a negocios (Business)",
    titulo: "La visita al negocio, paso a paso",
    icono: "ti-presentation",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Guion para vender Business según el dolor del dueño.",
    donde: "Negocio del cliente",
    pasos: [
      { titulo: "1. Apertura", texto: "Una pregunta que el dueño reconozca: “¿Sabes si tu negocio gana dinero o solo mueve dinero?”" },
      { titulo: "2. Descubrimiento", texto: "Pregunta cómo lleva hoy sus cuentas (libreta, Excel, contable, nada), qué le da más estrés (cobrar, pagar a los contratistas, la nómina, Hacienda) y qué pasaría si mañana su contable le pidiera todo ordenado." },
      { titulo: "3. Presentación por dolor", texto: "Cobra tarde: facturas, cobro con tarjeta o QR y recordatorios. Paga contratistas: Pagos, retenciones y la 480.6SP. Tiene empleados: Nómina. Tiene técnicos en campo: Equipo. Quiere control: balance, estado de resultados y alertas. Muestra solo lo que apunta a su dolor." },
      { titulo: "4. Evidencia", texto: "Usa la cuenta demo con negocio y, si puedes, que cree su cuenta gratis en el momento para que vea que es real." },
      { titulo: "5. Cierre", texto: "Resume en una frase lo que resolvería (“con VICTOR cobras más rápido y tu contable ve todo sin pedirte papeles”) y propón el siguiente paso: crear la cuenta, conectar el banco y programar una segunda visita para ver su primera factura." },
    ],
    ejemplo: "“Me dijiste que pierdes horas cada mes cuadrando lo que pagas a tus contratistas. Con Pagos calculas la retención y tienes el reporte listo para tu contable. ¿Lo configuramos con tus tres contratistas ahora?”",
    consejos: [
      "Habla el idioma del dueño: cobrar, pagar, que no me cojan en Hacienda. Evita términos técnicos.",
      "Si el contable del negocio ya es cliente de VICTOR, dilo en la visita.",
    ],
  },
  {
    id: "vendedor-negocio-objeciones",
    grupo: "2. Vender a negocios (Business)",
    titulo: "Objeciones del dueño de negocio",
    icono: "ti-message-question",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Qué responder cuando duda o dice que no.",
    donde: "Cuando el dueño pone una duda",
    pasos: [
      { titulo: "Contesta con un hecho", texto: "Escucha, repite lo que entendiste y responde con algo que pueda comprobar en la demo." },
    ],
    preguntas: [
      { p: "“Ya tengo un contable.”", r: "Perfecto: VICTOR le deja el trabajo ordenado. Él puede entrar a ver todo sin pedirte papeles." },
      { p: "“Está caro.”", r: "Compara con lo que le cuesta una multa, un recargo o las horas que pierde. Ten a mano los precios actuales de victorcfo.com y no prometas descuentos." },
      { p: "“No confío en conectar mi banco.”", r: "Puede empezar con el plan gratis, que no conecta el banco, y subir cuando quiera. Explica PIN, verificación en dos pasos y que el contable solo ve." },
      { p: "“Hay otras apps iguales.”", r: "Pregunta cuál usa y qué le falta. VICTOR habla boricua, entiende Hacienda de Puerto Rico y trae al contable adentro." },
      { p: "“Déjame pensarlo.”", r: "Pregunta qué parte necesita pensar y propón un paso pequeño: crear la cuenta gratis hoy y verlo juntos en una semana." },
    ],
  },
  {
    id: "vendedor-pro-addons",
    grupo: "3. Plan Pro con addons",
    titulo: "Vender Pro con addons: cuándo y cuáles",
    icono: "ti-puzzle",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Si el cliente no necesita todo Business, arma un Pro a su medida.",
    donde: "Cuando el negocio califica a medias",
    pasos: [
      { titulo: "Cuándo ofrecer Pro", texto: "Cuando el negocio factura y necesita control, pero solo ocupa una o dos piezas del paquete completo. No empujes Business si no lo va a usar." },
      { titulo: "Elige los addons por el dolor", texto: "Técnicos para quien manda personal a trabajar en campo y quiere asignar facturas y cotizaciones. Administrador o Secretaria para quien delega cobros y papeles. Pagos para quien paga a contratistas. Nómina para quien tiene empleados. Entidades extra para quien lleva más de un negocio." },
      { titulo: "Siempre al menos uno", texto: "Cierra un Pro con uno o varios addons que resuelvan algo concreto que el cliente ya te contó. Un Pro sin addon casi nunca resuelve su dolor principal." },
      { titulo: "Haz la cuenta con él", texto: "Si con los addons que necesita el total se acerca al de Business, enséñale los dos y deja que decida. Los precios actuales están en victorcfo.com; no los des de memoria." },
      { titulo: "Deja la puerta abierta", texto: "Explícale que puede añadir o quitar addons cuando su negocio cambie. Anota en su prospecto qué addon le interesa para el seguimiento." },
    ],
    consejos: [
      "La comisión por un cliente Pro se libera cuando hay actividad real de negocio. Ayúdale a hacer su primera factura.",
    ],
  },
  {
    id: "vendedor-reglas",
    grupo: "Empieza aquí",
    titulo: "Reglas de oro al vender VICTOR",
    icono: "ti-shield-check",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Lo que nunca se promete y cómo cuidar la marca.",
    donde: "Siempre",
    pasos: [
      { titulo: "No prometas lo que no puedes garantizar", texto: "Nada de “no te va a auditar Hacienda”, “te vas a hacer rico” ni “VICTOR es tu contable”. Habla de orden, control y tiempo ahorrado." },
      { titulo: "No des asesoría contributiva", texto: "VICTOR y tú no sustituyen a un contador ni a un abogado. Cuando el cliente pregunte algo de impuestos, remítelo a su contable." },
      { titulo: "Sin presión", texto: "Presenta, resuelve dudas y propón el siguiente paso. Si el cliente dice que no, déjale la puerta abierta." },
      { titulo: "Registra todo", texto: "Cada prospecto y cada oficina se anota en el portal el día de la visita. Sin registro no hay protección ni bono." },
      { titulo: "Mide tu semana", texto: "Cuántas oficinas visitaste, cuántas activaron el portal, cuántos negocios calificados conociste y cuántos pasaron a pago. Lo que no se mide no mejora." },
    ],
  },
  // ───────────────────── PORTAL Y PAGOS ─────────────────────
  {
    id: "vendedor-portal",
    grupo: "Tu portal y tus pagos",
    titulo: "Entrar al portal y compartir tu link",
    icono: "ti-briefcase",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Cómo entrar con tu código y PIN, y cómo usar tu link y QR.",
    donde: "victorcfo.com/socios/portal",
    pasos: [
      {
        titulo: "Entra con tu código y tu PIN",
        texto: "Cuando te aprueban, recibes por correo tu código de vendedor y un PIN de 4 dígitos. Con eso entras al portal; no necesitas cuenta de VICTOR.",
        foto: "Pantalla de entrada del portal de vendedor",
      },
      {
        titulo: "Comparte tu link o tu QR",
        texto:
          "Arriba tienes tu link personal y un QR. Cualquier negocio que se registre por ellos queda conectado a ti automáticamente. Copia el link o descarga el QR para enseñarlo en persona.",
        foto: "Tu link y tu QR",
      },
    ],
    consejos: ["Los siguientes módulos de este manual explican prospectos, comisiones y oficinas de contables."],
  },
  {
    id: "vendedor-prospectos",
    grupo: "Tu portal y tus pagos",
    titulo: "Prospectos y clientes",
    icono: "ti-users",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Registra a quien le presentaste VICTOR y sigue el estado de cada cliente.",
    donde: "Portal del vendedor → Tus prospectos / Tus clientes",
    pasos: [
      { titulo: "Registra el prospecto", texto: "Escribe el nombre (persona o negocio), el pueblo si lo sabes y al menos un correo o un teléfono. Sin uno de los dos no se puede guardar.", foto: "Formulario Registrar prospecto" },
      { titulo: "Entiende la protección de 60 días", texto: "Si ese correo o teléfono se registra en VICTOR dentro de 60 días, la venta es tuya aunque no haya usado tu link. Si quitas al prospecto, pierdes esa protección.", foto: "Lista de prospectos" },
      { titulo: "Filtra por pueblo", texto: "Usa el filtro Todos los pueblos para organizar tus visitas por zona.", foto: "Filtro de pueblos" },
      { titulo: "Mira el estado de tus clientes", texto: "En Tus clientes ves en qué etapa está cada uno: En trial (30 días), Generando comisión, Ciclo completo — cobrado o Cliente canceló — perdido.", foto: "Lista de clientes con su estado" },
    ],
    consejos: ["Registra al prospecto el mismo día de la visita: la protección de 60 días cuenta desde que lo anotas."],
  },
  {
    id: "vendedor-comisiones",
    grupo: "Tu portal y tus pagos",
    titulo: "Tus comisiones y pagos",
    icono: "ti-cash",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Cuánto has ganado, cuánto está en espera y cuándo se te paga.",
    donde: "Portal del vendedor → resumen",
    pasos: [
      { titulo: "Lee el resumen", texto: "Arriba ves el Total proyectado (por cobrar + 30% en espera + bonos) y Tu próximo pago. Si aún no hay fecha programada, aparecerá aquí cuando se fije.", foto: "Resumen del vendedor" },
      { titulo: "Entiende el desglose", texto: "Comisiones listas (bruto), menos la Retención 1062.03, más los Bonos de oficinas (neto), da el Total a recibir.", foto: "Desglose del pago" },
      { titulo: "Entiende cómo se calcula", texto: "Cliente mensual: 70% con su primer pago y el 30% restante cuando llega a su 3er pago. Cliente anual: 20% del año, una sola vez, con su primer pago.", foto: "Cómo se calcula lo tuyo" },
      { titulo: "Guarda tu comprobante 480.6SP", texto: "La tarjeta de retención te muestra lo retenido en el año para tu planilla 480.6SP. Guárdala.", foto: "Retención para tu planilla" },
    ],
    consejos: ["Lo que ves como “Ya cobrado” es neto, después de retención."],
  },
  {
    id: "vendedor-oficinas",
    grupo: "Tu portal y tus pagos",
    titulo: "Oficinas de contables y bonos",
    icono: "ti-building",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Registra las oficinas que visitas y cobra bonos cuando traen clientes.",
    donde: "Portal del vendedor → Oficinas de contables / Bonos",
    pasos: [
      { titulo: "Busca antes de registrar", texto: "El registro de oficinas es compartido. Busca por nombre, contacto, correo, teléfono o pueblo; si ya está registrada, verás “Ya está registrada” y evitas visitas repetidas.", foto: "Buscador de oficinas" },
      { titulo: "Registra la oficina", texto: "Pon el nombre de la oficina y escoge el pueblo (obligatorios). Si hay oficinas parecidas, el formulario te avisa. Opcional: contacto, web, Instagram, Facebook, sectores, especialidades y una descripción de lo que viste en la visita.", foto: "Formulario Registrar oficina" },
      { titulo: "Usa las notas internas", texto: "Las notas internas solo las ves tú; sirven para el seguimiento de la próxima visita.", foto: "Notas internas" },
      { titulo: "Mira cuáles ya tienen el portal", texto: "Las oficinas que activaron su portal muestran “Ya tiene el portal ✓”. Esas son las que generan bonos.", foto: "Oficina con el portal activo" },
      { titulo: "Sigue tus bonos", texto: "Bonos por tus oficinas de contables muestra lo por cobrar en total, las que esperan su primer cliente y el neto estimado por trimestre, después de retención. Oficina activada: $20 una vez cuando su primer cliente ya pagó, y $10 una vez por cada cliente que traiga; se paga cada 3 meses.", foto: "Tarjeta de bonos por trimestre" },
    ],
  },
  {
    id: "socios",
    grupo: "Tu portal y tus pagos",
    titulo: "Programa de Socios y Embajadores",
    icono: "ti-heart-handshake",
    audiencia: ["vendedor"],
    plan: "Abierto a contadores, influencers y cualquier persona con red",
    resumen: "Cómo aplicar al programa, cómo se aprueba y cómo se cobra la comisión.",
    donde: "victorcfo.com/socios",
    pasos: [
      {
        titulo: "Aplica",
        texto:
          "Entra a victorcfo.com/socios (no necesitas cuenta). Llena nombre, correo, teléfono, tipo (contador, influencer u otro) y cómo piensas promocionar VICTOR; acepta los términos.",
        foto: "Formulario público de socios",
      },
      {
        titulo: "Espera la aprobación",
        texto: "El equipo de VICTOR revisa cada solicitud a mano. Al aprobarte te llega tu código para compartir y, si eres vendedor, tu PIN del portal.",
        foto: "Correo de aprobación con el código",
      },
      {
        titulo: "Cobra",
        texto:
          "La comisión es en efectivo real, una vez por cliente que empiece a pagar. El pago se hace por fuera de la app (ACH o ATH Business) a los datos bancarios que llenas tú mismo en un link seguro de un solo uso. Si el cliente entra a Pro, la comisión se libera cuando hay actividad real de negocio.",
        foto: "Página segura para los datos de pago",
      },
    ],
    consejos: ["Pasados los primeros $1,500 al año a un mismo socio aplica retención de Hacienda (1062.03); eso se coordina por fuera de la app."],
  },
];
