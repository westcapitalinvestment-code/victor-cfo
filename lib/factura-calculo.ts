// Cálculo de subtotal/IVU/descuento/total compartido por las rutas de
// facturas que crea el técnico (app/api/tecnico/facturas/*) — misma
// fórmula que app/dashboard/facturacion/nueva/nueva-factura-form.tsx
// (IVU por línea, según si esa línea es exenta), más el descuento del
// técnico (que se resta DESPUÉS del IVU, no del subtotal — más simple de
// mostrar en el desglose: "Total antes de descuento" → "Descuento" →
// "Total"). Sin retención — las facturas que arma un técnico en campo son
// servicios directos al cliente, no el escenario B2B de "el cliente me
// retiene" que sí existe en Nueva Factura.
export type LineaCalculo = { cantidad: number; precioUnitario: number; ivuExento: boolean };

export function calcularFactura(
  items: LineaCalculo[],
  opts: { ivuApplies: boolean; ivuPct: number; descuentoPct: number }
) {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const subtotalGravable = items.reduce((s, i) => s + (i.ivuExento ? 0 : i.cantidad * i.precioUnitario), 0);
  const ivuMonto = opts.ivuApplies ? subtotalGravable * (opts.ivuPct / 100) : 0;
  const totalAntesDescuento = subtotal + ivuMonto;
  const descuentoMonto = totalAntesDescuento * (Math.max(0, opts.descuentoPct) / 100);
  const total = totalAntesDescuento - descuentoMonto;
  return { subtotal, ivuMonto, descuentoMonto, total };
}
