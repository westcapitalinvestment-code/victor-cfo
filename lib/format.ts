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

// Las fechas se guardan en la base de datos como "YYYY-MM-DD" (ISO, para
// que ordenen bien y no den problemas de zona horaria), pero a Joel no le
// gusta verlas así en pantalla ni en los documentos — las convierte a
// MM/DD/YYYY, el formato que se usa normalmente en PR. Puro string
// slicing (no Date()) para evitar el clásico bug de que el navegador
// interprete la fecha en otra zona horaria y se corra un día.
export function formatFecha(fechaISO: string | null | undefined): string {
  if (!fechaISO) return "";
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-");
  if (!anio || !mes || !dia) return fechaISO;
  return `${mes}/${dia}/${anio}`;
}
