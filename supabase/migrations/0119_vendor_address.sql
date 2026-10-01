-- 30 sept 2026 — pedido de Joel al revisar Pagos: "creo que también ponerle...
-- la direccion postal para cuando se genere la 480.6SP enviarla". El Modelo
-- 480.6SP se envía por correo al contratista además de a Hacienda, así que
-- hace falta su dirección postal archivada (no cifrada — es información de
-- correspondencia, no bancaria).

alter table vendors
  add column if not exists address text;

comment on column vendors.address is
  'Dirección postal del contratista, para enviarle su copia del Modelo 480.6SP por correo.';
