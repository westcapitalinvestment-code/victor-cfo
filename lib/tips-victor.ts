// Tips semanales de VICTOR para cuentas plan gratis (migración 0141). Un tip
// por semana, en orden, empezando al día 14 del registro. Contenido
// evergreen de finanzas personales/pequeño negocio — sin cifras inventadas ni
// promesas fiscales específicas. Para agregar más, añade al final del arreglo.
export type TipVictor = {
  asunto: string;
  titulo: string;
  parrafos: string[];
  // Acción concreta dentro de la app (opcional).
  accion?: { texto: string; path: string };
};

export const TIPS_VICTOR: TipVictor[] = [
  {
    asunto: "Tip de VICTOR: la regla de los 3 sobres",
    titulo: "Divide tu dinero en 3 antes de gastarlo",
    parrafos: [
      "Cuando cae el cheque, separa mentalmente tres sobres: lo fijo (renta, luz, agua, préstamos), lo variable (comida, gasolina, salidas) y lo que te pagas a ti (ahorro y deudas).",
      "Lo importante es el orden: el tercer sobre se aparta primero, no con lo que sobre al final del mes. Si esperas a ver qué sobra, casi nunca sobra.",
    ],
    accion: { texto: "Crea tu primera Meta de ahorro", path: "/dashboard/metas/nueva" },
  },
  {
    asunto: "Tip de VICTOR: el fondo de emergencia, por partes",
    titulo: "Empieza con un colchón pequeño",
    parrafos: [
      "El objetivo clásico es cubrir de 3 a 6 meses de gastos fijos, pero esa cifra asusta y mucha gente no empieza. Mejor la primera meta: un mes de gastos fijos.",
      "Con ese colchón una avería del carro o una cita médica deja de ser una deuda nueva. Luego lo vas subiendo poco a poco.",
    ],
    accion: { texto: "Ponle nombre y fecha a esa meta", path: "/dashboard/metas/nueva" },
  },
  {
    asunto: "Tip de VICTOR: los gastos 'hormiga' sí suman",
    titulo: "Revisa lo pequeño que se repite",
    parrafos: [
      "El café diario, las suscripciones que ya no usas, el delivery del jueves. Ninguno duele solo, pero juntos al mes suelen sorprender.",
      "Haz el ejercicio una vez: toma tus movimientos del último mes y ordénalos por comercio. Lo que más se repite es donde está tu oportunidad más fácil de ahorrar.",
    ],
    accion: { texto: "Ver mis transacciones por categoría", path: "/dashboard/gastos" },
  },
  {
    asunto: "Tip de VICTOR: ataca las deudas con un método",
    titulo: "Bola de nieve o avalancha: escoge uno",
    parrafos: [
      "Bola de nieve: pagas primero la deuda más pequeña para ganar impulso. Avalancha: pagas primero la de mayor interés para pagar menos en total.",
      "Matemáticamente gana la avalancha, pero el mejor método es el que sí vas a mantener. Lo que no funciona es pagar un poquito a todas sin plan.",
    ],
  },
  {
    asunto: "Tip de VICTOR: documentos que vencen sin avisar",
    titulo: "Que no se te venza el marbete, la póliza ni la licencia",
    parrafos: [
      "Los vencimientos se olvidan justo cuando más molestan. Anota la fecha de vencimiento de tus documentos importantes y activa un aviso antes, no el mismo día.",
      "Guarda una foto de cada uno: el día que lo necesites en una gestión, lo tendrás en el celular.",
    ],
    accion: { texto: "Guardar un documento en la Bóveda", path: "/dashboard/documentos/nuevo" },
  },
  {
    asunto: "Tip de VICTOR: separa lo personal de lo del negocio",
    titulo: "Si tienes negocio, una cuenta para cada cosa",
    parrafos: [
      "Mezclar los gastos del negocio con los personales complica todo: la planilla, el trabajo de tu contable y hasta saber si el negocio realmente da ganancia.",
      "Lo mínimo: una cuenta y una tarjeta solo para el negocio. Lo demás se ordena solo cuando cada peso tiene un lugar claro.",
    ],
  },
  {
    asunto: "Tip de VICTOR: revisa tus números una vez al mes",
    titulo: "Quince minutos al mes valen más que una hora al año",
    parrafos: [
      "Escoge un día fijo (el primero del mes, por ejemplo) y mira tres cosas: cuánto entró, cuánto salió y cuánto quedó. Nada más.",
      "Con ese hábito simple detectas problemas a tiempo, en vez de enterarte cuando ya no hay margen.",
    ],
    accion: { texto: "Abrir mi dashboard", path: "/dashboard" },
  },
  {
    asunto: "Tip de VICTOR: automatiza lo importante",
    titulo: "Lo que dependa de tu memoria, tarde o temprano falla",
    parrafos: [
      "Programa la transferencia a ahorros el mismo día que cobras y el pago mínimo de tus tarjetas en automático. Así una mala semana no te cuesta un recargo.",
      "Automatiza lo que no quieres decidir cada mes y deja tu energía para las decisiones que sí importan.",
    ],
  },
];
