# API pública de VICTOR CFO (v1)

Base de la API pública genérica de VICTOR CFO — la pieza sobre la que se
construyen integraciones específicas (Zapier, Shopify, etc.) más adelante.
Esta v1 solo expone **Clientes** y **Facturas** — los dos módulos con más
valor para gente facturando con IA y comercios digitales. Pagos,
Transacciones y Personal no están expuestos.

Disponible solo para cuentas en **plan Pro** (Configuración → API /
Integraciones).

## Autenticación

Cada request lleva un header `Authorization: Bearer <api key>`:

```
Authorization: Bearer vcfo_live_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6
```

Genera tu API key desde **Configuración → API / Integraciones → Generar
key**. El valor completo se muestra **una sola vez** al generarla — VICTOR
CFO nunca guarda la key en texto plano, solo un hash. Si la pierdes, revócala
y genera una nueva.

Cada key está atada a tu cuenta (`owner_id`) y, opcionalmente, a una sola
entidad de negocio si tu cuenta tiene varias (si no eliges entidad, la key
aplica a todas). Ninguna key puede ver ni modificar datos de otra cuenta.

Respuestas de error usan siempre este formato:

```json
{ "error": "mensaje descriptivo" }
```

Códigos: `401` (falta la key o es inválida/revocada), `403` (la key no tiene
el scope necesario), `400` (datos inválidos), `404` (el recurso no existe o
no pertenece a tu cuenta), `500` (error del servidor).

## Scopes

Cada API key tiene uno o más scopes. Hoy, al generar una key desde
Configuración, se le dan los 4 disponibles automáticamente:

| Scope | Permite |
|---|---|
| `clientes:leer` | `GET /api/v1/clientes` |
| `clientes:escribir` | `POST /api/v1/clientes` |
| `facturas:leer` | `GET /api/v1/facturas`, `GET /api/v1/facturas/:id` |
| `facturas:escribir` | `POST /api/v1/facturas` |

La columna `scopes` en la base de datos es un array de texto libre — se
pueden agregar scopes nuevos (ej. `pagos:leer`, cuando ese recurso se
exponga) sin necesitar una migración.

## Clientes

### `GET /api/v1/clientes`

Lista los clientes de tu cuenta. Paginación con `page`/`limit`
(`limit` máximo 100, default 25).

```
GET /api/v1/clientes?page=1&limit=25
```

```json
{
  "data": [
    {
      "id": "uuid",
      "nombre": "Caribbean Health Solutions",
      "email": "billing@example.com",
      "telefono": "787-555-0100",
      "tax_id": "66-1234567",
      "direccion": "123 Calle Sol, San Juan, PR",
      "es_negocio": true,
      "retencion_pct": 10,
      "activo": true,
      "creado": "2026-01-15T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 25,
  "total": 42
}
```

### `POST /api/v1/clientes`

Crea un cliente nuevo. Solo `nombre` es requerido.

```json
{
  "nombre": "Nuevo Cliente LLC",
  "email": "contacto@nuevocliente.com",
  "telefono": "787-555-0199",
  "tax_id": "66-9876543",
  "direccion": "456 Ave Ponce de León, San Juan, PR",
  "es_negocio": true,
  "retencion_pct": 10,
  "entity_id": "uuid (opcional, solo si tu key no está fija a una entidad y tu cuenta tiene varias)"
}
```

Responde `201` con el cliente creado (mismo formato que `GET`).

## Facturas

### `GET /api/v1/facturas`

Lista facturas de tu cuenta. Filtros opcionales: `estado`
(`borrador`/`enviada`/`vista`/`pagada`/`vencida`), `cliente_id`, `desde` y
`hasta` (fechas `YYYY-MM-DD`, sobre `fecha_emision`). Misma paginación que
Clientes.

```
GET /api/v1/facturas?estado=pagada&desde=2026-01-01&hasta=2026-06-30
```

```json
{
  "data": [
    {
      "id": "uuid",
      "numero": "INV-1024",
      "cliente_id": "uuid",
      "cliente_nombre": "Caribbean Health Solutions",
      "subtotal": 500.00,
      "ivu_pct": 0,
      "ivu_monto": 0,
      "retencion_pct": 10,
      "retencion_monto": 50.00,
      "total": 450.00,
      "estado": "pagada",
      "fecha_emision": "2026-03-01",
      "fecha_vencimiento": "2026-03-31",
      "fecha_pago": "2026-03-15"
    }
  ],
  "page": 1,
  "limit": 25,
  "total": 130
}
```

### `GET /api/v1/facturas/:id`

Detalle de una factura, con sus líneas.

```json
{
  "data": {
    "id": "uuid",
    "numero": "INV-1024",
    "cliente_id": "uuid",
    "cliente_nombre": "Caribbean Health Solutions",
    "cliente_email": "billing@example.com",
    "subtotal": 500.00,
    "ivu_pct": 0,
    "ivu_monto": 0,
    "retencion_pct": 10,
    "retencion_monto": 50.00,
    "total": 450.00,
    "estado": "pagada",
    "fecha_emision": "2026-03-01",
    "fecha_vencimiento": "2026-03-31",
    "fecha_pago": "2026-03-15",
    "notas": null,
    "lineas": [
      {
        "id": "uuid",
        "descripcion": "Consulta inicial",
        "detalle": null,
        "cantidad": 1,
        "precio_unitario": 500.00,
        "subtotal_linea": 500.00,
        "servicio_id": "uuid o null"
      }
    ]
  }
}
```

### `POST /api/v1/facturas`

Crea una factura nueva como **borrador** — igual que cuando VICTOR crea una
factura por chat, nunca sale marcada "enviada" automáticamente; el dueño la
revisa y la envía él mismo desde la app. El subtotal, IVU/Sales Tax,
retención y número correlativo se calculan en el servidor con la misma
lógica de negocio que usa el formulario de "Nueva factura" en pantalla —
nunca los mandes calculados desde afuera.

```json
{
  "cliente_id": "uuid (requerido)",
  "entity_id": "uuid (opcional, solo si tu key no está fija a una entidad y tu cuenta tiene varias)",
  "fecha_vencimiento": "2026-04-15 (opcional, YYYY-MM-DD — si no se manda usa los términos de pago default de la entidad)",
  "lineas": [
    {
      "descripcion": "Consulta inicial (requerido)",
      "cantidad": 1,
      "precio_unitario": 500.00,
      "servicio_id": "uuid (opcional, del catálogo de Servicios)"
    }
  ]
}
```

Responde `201`:

```json
{
  "data": {
    "id": "uuid",
    "numero": "INV-1025",
    "subtotal": 500.00,
    "ivu_pct": 0,
    "ivu_monto": 0,
    "retencion_pct": 10,
    "retencion_monto": 50.00,
    "total": 450.00,
    "estado": "borrador",
    "fecha_emision": "2026-03-20",
    "fecha_vencimiento": "2026-04-19"
  }
}
```

## Aislamiento entre cuentas

Toda consulta filtra siempre por el `owner_id` de la API key usada — nunca
por nada que venga en la URL o el cuerpo del request. Si tu key está fija a
una entidad específica, además queda limitada a esa entidad. Pedir un
recurso (ej. `GET /api/v1/facturas/:id`) que pertenece a otra cuenta siempre
responde `404`, nunca revela que existe.
