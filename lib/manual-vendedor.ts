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

export const GRUPOS_VENDEDOR = ["Para vendedores y socios"] as const;

export const MODULOS_VENDEDOR: ModuloVendedor[] = [
  // ───────────────────── PARA VENDEDORES Y SOCIOS ─────────────────────
  {
    id: "vendedor-portal",
    grupo: "Para vendedores y socios",
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
    grupo: "Para vendedores y socios",
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
    grupo: "Para vendedores y socios",
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
    grupo: "Para vendedores y socios",
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
    grupo: "Para vendedores y socios",
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
