// Lista de bancos para los formularios de datos de pago (1 nov 2026).
//
// Solo se PRE-LLENA el routing number de los bancos de PR que Joel confirmó con
// su CPA (BPPR, FirstBank, Oriental). Los demás bancos salen en la lista para
// que el nombre quede normalizado, pero el routing lo escribe la persona: los
// bancos grandes de EE. UU. usan números distintos según el estado donde se
// abrió la cuenta y las cooperativas de PR tienen cada una el suyo, y un
// routing equivocado manda la comisión a otro banco. Por eso además se valida
// el dígito verificador ABA, que atrapa casi todos los errores de digitación.

export type BancoACH = { nombre: string; routing?: string };

export const BANCOS_PR: BancoACH[] = [
  { nombre: "BPPR", routing: "021502011" },
  { nombre: "FirstBank", routing: "021502228" },
  { nombre: "Oriental", routing: "021502914" },
  { nombre: "Banco Cooperativo / Cooperativa de PR" },
];

export const BANCOS_EEUU: BancoACH[] = [
  { nombre: "Chase" },
  { nombre: "Bank of America" },
  { nombre: "Wells Fargo" },
  { nombre: "Citibank" },
  { nombre: "Capital One" },
  { nombre: "TD Bank" },
  { nombre: "Navy Federal" },
  { nombre: "USAA" },
  { nombre: "Mercury" },
  { nombre: "Chime" },
];

export const TODOS_LOS_BANCOS: BancoACH[] = [...BANCOS_PR, ...BANCOS_EEUU];

export function bancoPorNombre(nombre: string): BancoACH | undefined {
  return TODOS_LOS_BANCOS.find((b) => b.nombre === nombre);
}

// Dígito verificador ABA: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) debe ser múltiplo de 10.
export function routingValido(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split("").map(Number);
  const suma = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return suma % 10 === 0;
}
