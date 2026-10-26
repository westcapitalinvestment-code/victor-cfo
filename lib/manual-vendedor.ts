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
    titulo: "Portal del vendedor",
    icono: "ti-briefcase",
    audiencia: ["vendedor"],
    plan: "Para vendedores aprobados",
    resumen: "Tu link y QR, tus prospectos, tus comisiones y cuánto te toca cobrar.",
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
      {
        titulo: "Registra tus prospectos",
        texto:
          "En Tus prospectos anota a quien le presentaste VICTOR (nombre, correo, teléfono). Si se registra con ese correo o teléfono en los próximos 60 días, por donde sea, la venta es tuya. Desde ahí lo llamas o le escribes por WhatsApp y llevas el seguimiento.",
        foto: "Formulario de prospectos y la lista con sus estados",
      },
      {
        titulo: "Visita oficinas de contables",
        texto:
          "El registro de oficinas de contables es compartido para no repetir visitas: lo tuyo se ve completo; lo de los demás, solo nombre, pueblo y estado. Anota contacto, interés y seguimiento.",
        foto: "Lista de oficinas de contables",
      },
      {
        titulo: "Entiende lo que ganas",
        texto:
          "Cliente mensual: 70% con su primer pago y el 30% restante cuando llega a su 3er pago. Cliente anual: 20% del año, una sola vez, con su primer pago. Oficina de contables activada: $20 una vez cuando su primer cliente ya pagó, y $10 una vez por cada cliente que traiga, pagado cada 3 meses. Ves lo ya cobrado, lo que está en espera y la próxima fecha de pago.",
        foto: "Resumen del vendedor con Ya cobrado, En espera y Cómo se calcula",
      },
      {
        titulo: "Guarda tu planilla 480.6SP",
        texto:
          "Las comisiones llevan la retención de la Sección 1062.03. El portal te muestra lo retenido en el año: guarda ese comprobante para tu contribución.",
        foto: "Tarjeta de retención para tu planilla 480.6SP",
      },
    ],
    consejos: ["Todo lo que ves como “Ya cobrado” es neto, después de retención. Lo que está “en espera” se calcula al liberarse."],
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
