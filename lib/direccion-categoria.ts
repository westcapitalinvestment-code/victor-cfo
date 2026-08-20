// Misma regla que categoria_direccion_valida() en la base de datos
// (supabase/migrations/0017_direccion_categoria.sql y
// 0019_direccion_categoria_ingresos.sql) — pero para los caminos que
// categorizan en JavaScript en vez de por el trigger de Postgres:
// categorizarUna() en lib/victor/tools.ts (el chat de VICTOR) y
// app/api/transacciones/categorizar/route.ts (el dropdown manual en
// Gastos). Los dos archivos SQL y este se mantienen a mano en las dos
// bases de código — si se agrega una palabra nueva aquí, agrégala también
// en la función SQL, y viceversa, para que las 3 vías de categorizar
// (automática al llegar de Plaid, chat, manual) nunca se desincronicen
// otra vez del mismo bug: una transferencia SALIENTE cayendo en una
// categoría que promete dinero que ENTRÓ (o viceversa).
export function direccionCategoriaValida(nombreCategoria: string, tipoFlujo: string | null | undefined): boolean {
  if (!tipoFlujo) return true;
  const nombre = nombreCategoria.toLowerCase();
  if (nombre.includes("enviad") && tipoFlujo !== "gasto") return false;
  if (nombre.includes("recibid") && tipoFlujo !== "ingreso") return false;
  // "Ingresos"/"ingreso" es la única palabra "de un solo lado" que se
  // agrega aparte de enviado/recibido — a propósito NO se bloquean
  // categorías tipo "Pagos"/"deudas"/"gasto" contra tipo_flujo !== "gasto",
  // porque esas legítimamente contienen filas con tipo_flujo =
  // "transferencia" (ej. el pago mensual de una tarjeta de crédito).
  if (nombre.includes("ingres") && tipoFlujo !== "ingreso") return false;
  return true;
}
