import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Cliente de Plaid — solo se usa del lado del servidor (app/api/plaid/*).
// PLAID_ENV controla contra qué ambiente de Plaid hablamos:
//   sandbox     — datos falsos, gratis, para desarrollar sin tocar bancos reales.
//   development — bancos reales, número limitado de conexiones, gratis/barato.
//   production  — tráfico real, es lo que factura según el contrato con Plaid.
// Por defecto usa "sandbox" para que nadie prenda producción por accidente
// solo con tener las llaves puestas — hay que poner PLAID_ENV=production
// explícitamente cuando de verdad se quiera facturar contra el contrato real.
const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;

const configuration = new Configuration({
  basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export function plaidConfigurado(): boolean {
  return !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET;
}

// Heurística para detectar si una cuenta que Plaid devolvió es de negocio
// (no personal) — Plaid no manda un campo explícito "personal vs negocio",
// así que revisamos el nombre/subtipo buscando palabras típicas de cuentas
// comerciales. No es perfecto (un usuario podría nombrar su cuenta
// personal "LLC" por error, o su banco podría no incluir la palabra
// "Business" en el nombre), pero cubre el caso común: bancos de PR y EEUU
// casi siempre nombran sus productos comerciales con alguna de estas
// palabras. Se usa para que un usuario Core no pueda ver/usar datos de
// negocio gratis solo por conectar su banco.
const PALABRAS_NEGOCIO = [
  "business",
  "negocio",
  "comercial",
  "commercial",
  "corp",
  "corporate",
  "llc",
  "inc",
  "merchant",
  "empresa",
];

export function pareceCuentaDeNegocio(name: string | null | undefined, officialName: string | null | undefined, subtype: string | null | undefined): boolean {
  const texto = `${name ?? ""} ${officialName ?? ""} ${subtype ?? ""}`.toLowerCase();
  return PALABRAS_NEGOCIO.some((palabra) => texto.includes(palabra));
}
