// Manual del Portal del Contable (26 oct 2026, pedido de Joel). Aparte del
// Manual de Usuario. Se abre desde el botón "Manual" del portal (/cpa) y vive en
// /cpa/manual. Cada paso trae `foto` (descripción de la captura a tomar cuando
// se tenga una cuenta de contable demo).

import type { ModuloManual } from "./manual-usuario";

export const GRUPOS_CONTABLE = ["Empezar", "Tus clientes", "Dentro de un cliente", "Tu oficina"] as const;


export const MODULOS_CONTABLE: ModuloManual[] = [
  {
    id: "contable-empezar",
    grupo: "Empezar",
    titulo: "Aceptar la invitación y entrar",
    icono: "ti-key",
    audiencia: ["usuario"],
    plan: "Sin costo para ti ni para tu cliente",
    resumen: "Cómo crear tu acceso y qué ves al entrar.",
    donde: "Correo de invitación → victorcfo.com/cpa",
    pasos: [
      { titulo: "Abre la invitación", texto: "Tu cliente te invita desde su cuenta. Te llega un correo con un enlace para aceptar; ahí creas tu contraseña.", foto: "Pantalla de aceptar invitación" },
      { titulo: "Entra al portal", texto: "Inicia sesión con tu correo y contraseña. Si la olvidas, usa “Olvidé mi contraseña”. Arriba te saluda por tu nombre.", foto: "Inicio del portal con el saludo" },
      { titulo: "Qué verás", texto: "Solo las entidades de los clientes que te invitaron, nunca las de nadie más. Si un cliente le da acceso a más de una entidad, ves todas en tu lista.", foto: "Lista de clientes" },
    ],
  },
  {
    id: "contable-clientes",
    grupo: "Tus clientes",
    titulo: "Lista de clientes, alertas y favoritos",
    icono: "ti-users-group",
    audiencia: ["usuario"],
    plan: "Sin costo",
    resumen: "Encuentra clientes, marca tus favoritos y atiende las alertas.",
    donde: "Portal del contable → inicio",
    pasos: [
      { titulo: "Busca un cliente", texto: "Usa el buscador por entidad, dueño o EIN.", foto: "Buscador de clientes" },
      { titulo: "Marca tus favoritos", texto: "Toca la estrella de la fila para añadir o quitar a un cliente de Mis clientes. La estrella no abre el cliente; tocar la fila sí.", foto: "Pestaña Mis clientes con estrellas" },
      { titulo: "Atiende las alertas", texto: "Las alertas aparecen agrupadas por tipo, a nivel de todo tu portafolio y también dentro de cada cliente. Si no hay ninguna, el portal te lo dice.", foto: "Alertas agrupadas por tipo" },
      { titulo: "Abre un cliente", texto: "Toca la fila para entrar al detalle de esa entidad.", foto: "Detalle del cliente" },
    ],
  },
  {
    id: "contable-personal",
    grupo: "Tus clientes",
    titulo: "Finanzas personales del cliente",
    icono: "ti-user",
    audiencia: ["usuario"],
    plan: "Solo si el cliente lo autoriza",
    resumen: "Ver lo personal de un cliente cuando él te da permiso.",
    donde: "Portal del contable → clientes personales",
    pasos: [
      { titulo: "Pide el permiso", texto: "Lo personal de un cliente solo lo ves si él activa compartir sus finanzas personales contigo.", foto: "Lista de clientes personales" },
      { titulo: "Busca por nombre o correo", texto: "Igual que en la lista de entidades, puedes buscar y marcar favoritos.", foto: "Buscador de clientes personales" },
      { titulo: "Revisa su resumen", texto: "Dentro ves su resumen, impuestos, transacciones, documentos y reportes personales.", foto: "Detalle personal del cliente" },
    ],
  },
  {
    id: "contable-entidad",
    grupo: "Dentro de un cliente",
    titulo: "Pestañas de una entidad",
    icono: "ti-layout-dashboard",
    audiencia: ["usuario"],
    plan: "Sin costo",
    resumen: "Qué contiene cada pestaña del detalle de un cliente.",
    donde: "Portal del contable → cliente",
    pasos: [
      { titulo: "Facturación", texto: "Las facturas y cobros de la entidad.", foto: "Pestaña Facturación" },
      { titulo: "Pagos", texto: "Retenciones a contratistas (480.6SP), el estado de cada contratista y el depósito mensual del Modelo 480.9A. Puedes filtrar y subir los formularios 480.6SP para que tu cliente los vea; a él le llega un aviso.", foto: "Pestaña Pagos" },
      { titulo: "Nómina", texto: "Resumen del año de las corridas aprobadas: retenido a empleados, costo patronal, depósitos y asiento contable. Es de solo lectura a menos que el dueño te haya activado correr la nómina desde aquí.", foto: "Pestaña Nómina" },
      { titulo: "Resultados", texto: "El estado de resultados de la entidad, listo para revisar.", foto: "Pestaña Resultados" },
      { titulo: "IVU", texto: "Seguimiento del IVU del periodo y su reconciliación, y los clientes marcados como revendedores exentos. Si la entidad no aplica IVU, te lo indica.", foto: "Pestaña IVU" },
      { titulo: "Recibos", texto: "Los recibos que tu cliente capturó con la cámara.", foto: "Pestaña Recibos" },
      { titulo: "Documentos", texto: "Documentos compartidos con el cliente: sube uno con nombre y fecha de vencimiento (opcional) y se le avisa; también puedes reemplazarlo o borrarlo.", foto: "Pestaña Documentos" },
      { titulo: "Estimados", texto: "La contribución estimada trimestral y los pagos estimados registrados.", foto: "Pestaña Estimados" },
      { titulo: "Auditoría", texto: "Historial de cambios: filtra por fecha y hora (desde/hasta), tipo de cambio y quién lo hizo.", foto: "Pestaña Auditoría" },
    ],
    consejos: ["Todo lo que subes a Documentos o a Pagos le llega al cliente con un aviso; no tienes que escribirle aparte."],
  },
  {
    id: "contable-oficina",
    grupo: "Tu oficina",
    titulo: "Tu equipo, tu perfil y VICTOR Accountant",
    icono: "ti-building",
    audiencia: ["usuario"],
    plan: "VICTOR Accountant es opcional",
    resumen: "Invita a colegas, aparece en el directorio y trae clientes nuevos.",
    donde: "Portal del contable → Equipo / Perfil / Invitar cliente nuevo",
    pasos: [
      { titulo: "Invita a tu equipo", texto: "En Equipo escribes el correo de tu colega (el nombre es opcional) y le llega una invitación. Cuando la acepta, ve tus clientes. Aquí ves a quién has invitado.", foto: "Pantalla Equipo" },
      { titulo: "Completa tu perfil del directorio", texto: "En Perfil escoges tu pueblo, sectores, especialidades y una descripción de lo que haces y tu experiencia. Con el perfil completo apareces en el directorio de contables de VICTOR; puedes ocultarte cuando quieras.", foto: "Perfil del directorio" },
      { titulo: "Hazte VICTOR Accountant", texto: "Si quieres traer clientes nuevos, actívalo con tu Registro de Comerciante (la licencia de CPA es opcional). Luego usa Invitar cliente nuevo: pones el correo, y el cliente crea su cuenta y paga su primer pago.", foto: "Panel VICTOR Accountant" },
      { titulo: "Administra tus invitaciones", texto: "Puedes cancelar una invitación pendiente o liberar a un cliente cuando ya no lo manejes.", foto: "Lista de clientes invitados" },
      { titulo: "Ajusta tu cuenta", texto: "En el engranaje cambias tu contraseña, subes el logo de tu firma (lo ven tus clientes invitados) o cierras sesión.", foto: "Menú de cuenta" },
    ],
  },
];
