// Oficinas de contables FICTICIAS para el directorio de la cuenta demo
// (users.is_demo = true). No se guardan en la base de datos: /api/contables las
// devuelve solo a cuentas demo, así el directorio no se ve vacío en
// presentaciones. Nombres, teléfonos (555-01xx) y correos (example.com) inventados.

type OficinaDemo = {
  id: string;
  nombre: string;
  contacto_nombre: string | null;
  email: string | null;
  telefono: string | null;
  pueblo: string;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  descripcion: string;
  web: string | null;
  instagram: string | null;
  facebook: string | null;
};

const o = (
  n: number,
  nombre: string,
  contacto: string,
  pueblo: string,
  sectores: string[],
  especialidades: string[],
  descripcion: string,
  remoto = false
): OficinaDemo => ({
  id: `demo-oficina-${n}`,
  nombre,
  contacto_nombre: contacto,
  email: `contacto${n}@example.com`,
  telefono: `(787) 555-01${String(n).padStart(2, "0")}`,
  pueblo,
  sectores,
  especialidades,
  remoto,
  descripcion,
  web: null,
  instagram: null,
  facebook: null,
});

export const OFICINAS_DEMO: OficinaDemo[] = [
  o(1, "Rivera & Asociados CPA", "Carmen Rivera, CPA", "San Juan",
    ["Servicios profesionales", "Salud y consultorios médicos"],
    ["Planillas de corporaciones / LLC", "Planificación contributiva", "Estados financieros"],
    "Más de 20 años acompañando a médicos y profesionales con corporación propia. Planificación contributiva, estados financieros y representación ante Hacienda."),
  o(2, "Contabilidad Torres", "Luis Torres, CPA", "Bayamón",
    ["Comercio al detal / tiendas", "Restaurantes y food trucks"],
    ["IVU y SURI", "Contabilidad mensual (bookkeeping)", "Nómina"],
    "Llevamos los libros mensuales de tiendas y restaurantes: IVU, nómina y cierre de mes para que sepas cuánto ganas de verdad."),
  o(3, "Ortiz Tax Services", "Marisol Ortiz", "Caguas",
    ["Individuos y trabajadores por cuenta propia"],
    ["Planillas personales", "Representación ante Hacienda"],
    "Planillas personales y de trabajadores por cuenta propia. Te ayudamos a ordenar tus gastos y a responder cartas de Hacienda sin estrés."),
  o(4, "Vázquez Consulting Group", "Ángel Vázquez, CPA", "Ponce",
    ["Construcción y contratistas", "Servicios de mantenimiento y técnicos"],
    ["Retenciones y Modelo 480", "Nómina", "Planillas de corporaciones / LLC"],
    "Especialistas en contratistas y compañías de servicio: retenciones de la 480.6SP, nómina y planillas de corporaciones."),
  o(5, "Colón & Pérez, Contadores", "Yaritza Colón, CPA", "Mayagüez",
    ["Agricultura", "Comercio al detal / tiendas"],
    ["Auditoría y revisión", "Estados financieros", "Planificación contributiva"],
    "Servimos negocios familiares del oeste de la isla, incluyendo fincas y agro-empresas. Auditorías, revisiones y estados financieros."),
  o(6, "Medina Accounting Solutions", "Roberto Medina, CPA", "Guaynabo",
    ["Servicios profesionales", "Bienes raíces"],
    ["Incorporación de negocios", "Planificación contributiva", "Estados financieros"],
    "Te ayudamos a incorporar tu negocio y a escoger la estructura que más te conviene. Planificación contributiva para profesionales y bienes raíces."),
  o(7, "Santiago Contabilidad Digital", "Natalia Santiago", "Carolina",
    ["Tiendas en línea (e-commerce)", "Servicios profesionales"],
    ["Contabilidad mensual (bookkeeping)", "IVU y SURI"],
    "Contabilidad para tiendas en línea y emprendedores digitales. Trabajamos 100% remoto y conciliamos Stripe, ATH Móvil y tu banco cada mes.",
    true),
  o(8, "Figueroa CPA Group", "Héctor Figueroa, CPA", "Arecibo",
    ["Salud y consultorios médicos", "Organizaciones sin fines de lucro"],
    ["Auditoría y revisión", "Estados financieros", "Representación ante Hacienda"],
    "Contabilidad y auditoría para consultorios, clínicas y organizaciones sin fines de lucro del norte. Informes claros para juntas y donantes."),
  o(9, "Delgado Business Advisors", "Priscilla Delgado, CPA", "Humacao",
    ["Restaurantes y food trucks", "Comercio al detal / tiendas"],
    ["Planificación contributiva", "Contabilidad mensual (bookkeeping)", "Nómina"],
    "Acompañamos restaurantes, food trucks y comercios del este: control de costos, propinas, nómina y planificación para pagar menos contribuciones."),
  o(10, "Ramos & Ramos Contadores", "Jorge Ramos, CPA", "Fajardo",
    ["Transportación y logística", "Servicios de mantenimiento y técnicos"],
    ["IVU y SURI", "Retenciones y Modelo 480", "Planillas de corporaciones / LLC"],
    "Contadores para empresas de transporte, logística y mantenimiento. Te dejamos al día con IVU, retenciones y planillas de corporación."),
  o(11, "Acevedo Tax & Accounting", "Gloria Acevedo", "Aguadilla",
    ["Individuos y trabajadores por cuenta propia", "Servicios profesionales"],
    ["Planillas personales", "Planillas de corporaciones / LLC", "Incorporación de negocios"],
    "Planillas personales, de LLC y corporaciones pequeñas. Explicamos todo en lenguaje sencillo y te recordamos cada fecha límite."),
  o(12, "Cruz Financial Partners", "Eduardo Cruz, CPA", "Dorado",
    ["Bienes raíces", "Servicios profesionales", "Individuos y trabajadores por cuenta propia"],
    ["Planificación contributiva", "Estados financieros", "Representación ante Hacienda"],
    "Planificación contributiva para inversionistas de bienes raíces y dueños de negocio. También atendemos clientes que se mudan a Puerto Rico.",
    true),
];
