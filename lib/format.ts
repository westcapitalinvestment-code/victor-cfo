// Formato de dinero consistente en toda la app — $ + comas de miles +
// dos decimales (ej. $1,234.56), en vez de concatenar "$" + toFixed(2) a
// mano en cada pantalla (eso da "$1234.56", sin comas, fácil de leer mal
// en montos grandes).
export function formatMoney(amount: number, decimals: 0 | 2 = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
