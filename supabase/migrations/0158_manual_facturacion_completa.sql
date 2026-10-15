-- 15 oct 2026 — VICTOR (consultar_manual) debe saber las acciones nuevas de
-- Facturación: duplicar, anular, notas de crédito / reembolsos, recordatorios
-- automáticos de cobro y el portal en línea del cliente (migración 0157).
INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'facturacion-acciones-portal-cliente',
  'Facturación: duplicar, anular, notas de crédito, recordatorios de cobro y portal del cliente',
  'Qué hacer cuando una factura hay que repetirla, cancelarla, corregirla después de cobrada, cobrarla con recordatorios automáticos, o darle al cliente un lugar donde ver sus facturas.',
  $md$En el detalle de CUALQUIER factura, abajo, hay una sección "Más acciones":

DUPLICAR: crea una factura NUEVA en borrador con las mismas líneas, cliente, impuestos y condiciones; fecha de hoy y vencimiento con el mismo plazo; número consecutivo nuevo. No copia el pago ni la recurrencia. Sirve para repetir un servicio sin llenar todo otra vez.

ANULAR (void): para una factura que NO se debe cobrar (error, cliente canceló). La factura no se borra: conserva su número, queda marcada "Anulada" (filtro "Anuladas" en la lista) y sus montos pasan a cero, así NO cuenta en cobrado, pendiente, IVU ni retención. Se puede poner un motivo. Solo aplica a facturas NO pagadas; si ya está pagada se usa un reembolso. Una anulada no se puede cobrar ni mandar el QR.

NOTA DE CRÉDITO / REEMBOLSO: para bajar el monto de una factura ya emitida.
- Factura NO pagada → "Nota de crédito": baja lo que el cliente debe (descuento, error en precio). Si la nota iguala el total, la factura queda anulada.
- Factura pagada → "Reembolso": registra la devolución; el dinero lo devuelve el dueño por el método que escoja (VICTOR NO mueve dinero) y queda anotado.
En ambos casos el recorte se reparte proporcionalmente entre subtotal, impuestos y retención, y los reportes (cobrado, ingresos por cliente, IVU) se ajustan solos. Cada nota recibe número consecutivo (NC-1, NC-2…) y el contable la ve en su portal. No se puede crear sobre borradores ni anuladas, y nunca por más que el total.

RECORDATORIOS AUTOMÁTICOS DE COBRO: opcional, APAGADO por defecto. Se activa en Editar negocio → pestaña Facturas → "Recordatorios automáticos de cobro". Cuando una factura enviada se vence, VICTOR le manda al cliente un correo amable con el monto y el link de pago: al día siguiente del vencimiento, a los 7 días y a los 14 días (máximo 3 por factura). Solo si el cliente tiene correo guardado; nunca a borradores, pagadas ni anuladas. El dueño recibe una notificación resumen. Si el dueño quiere insistir por WhatsApp, eso sigue siendo a mano.

PORTAL EN LÍNEA DEL CLIENTE: cada cliente tiene un enlace privado (sin contraseña ni cuenta) donde ve todas sus facturas, puede filtrar entre todas / pendientes / pagadas, ve su saldo pendiente y vencido, abre el PDF de cada una y, si el negocio cobra con tarjeta, paga ahí mismo. Se copia desde el detalle de una factura con el botón "🔗 Portal del cliente", y el correo de factura que VICTOR envía ya incluye "Ver todas mis facturas". El cliente solo ve SUS facturas (nunca las de otros ni datos internos del negocio). Si el enlace se compartió por error, se puede regenerar para invalidar el anterior.

QUIÉN LO PUEDE USAR: dueño y Administrador (y Secretaria en las acciones de facturación que ya tiene permitidas). El contable ve todo en su portal pero no modifica.

LÍMITES HONESTOS: VICTOR todavía no hace pagos parciales por factura (la factura se paga completa; para cobrar en partes se usa Depósito o se divide en dos facturas) ni cobra tiempo/horas por cronómetro. La nómina (W-2) es otro módulo aparte y no está incluida.$md$
)
ON CONFLICT (slug) DO UPDATE
SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, contenido = EXCLUDED.contenido;
