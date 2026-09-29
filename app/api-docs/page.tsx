// Documentación pública de la API v1 de VICTOR CFO (/api/v1/*).
// Link público requerido para el proceso de publicación de la integración
// de Zapier ("API documentation URL") — mismo contenido que API.md en la
// raíz del repo, mantener ambos en sync si la API cambia.

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="mb-4 overflow-x-auto rounded-lg bg-[#1a1a1a] p-4 text-xs leading-relaxed text-[#e5e5e5]">
    <code>{children}</code>
  </pre>
);

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[13px] text-[#1a1a1a]">{children}</code>
);

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">API pública de VICTOR CFO (v1)</h1>
      <p className="mb-6 text-xs text-gray-500">victorcfo.com/api-docs</p>

      <p className="mb-4">
        Base de la API pública genérica de VICTOR CFO — la pieza sobre la que se construyen
        integraciones específicas (Zapier, Shopify, etc.). Esta v1 solo expone <strong>Clientes</strong>{" "}
        y <strong>Facturas</strong> — los dos módulos con más valor para gente facturando con IA y
        comercios digitales. Pagos, Transacciones y Personal no están expuestos.
      </p>
      <p className="mb-6">
        Disponible solo para cuentas en <strong>plan Pro</strong> (Configuración → API / Integraciones).
      </p>

      <h2 className="mb-2 mt-8 text-base font-semibold">Autenticación</h2>
      <p className="mb-3">
        Cada request lleva un header <InlineCode>Authorization: Bearer &lt;api key&gt;</InlineCode>:
      </p>
      <Code>Authorization: Bearer vcfo_live_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6</Code>
      <p className="mb-3">
        Genera tu API key desde <strong>Configuración → API / Integraciones → Generar key</strong>. El
        valor completo se muestra <strong>una sola vez</strong> al generarla — VICTOR CFO nunca guarda la
        key en texto plano, solo un hash. Si la pierdes, revócala y genera una nueva.
      </p>
      <p className="mb-3">
        Cada key está atada a tu cuenta (<InlineCode>owner_id</InlineCode>) y, opcionalmente, a una sola
        entidad de negocio si tu cuenta tiene varias. Ninguna key puede ver ni modificar datos de otra
        cuenta.
      </p>
      <p className="mb-2">Respuestas de error usan siempre este formato:</p>
      <Code>{`{ "error": "mensaje descriptivo" }`}</Code>
      <p className="mb-4">
        Códigos: <InlineCode>401</InlineCode> (falta la key o es inválida/revocada),{" "}
        <InlineCode>403</InlineCode> (la key no tiene el scope necesario), <InlineCode>400</InlineCode>{" "}
        (datos inválidos), <InlineCode>404</InlineCode> (el recurso no existe o no pertenece a tu
        cuenta), <InlineCode>500</InlineCode> (error del servidor).
      </p>

      <h2 className="mb-2 mt-8 text-base font-semibold">Scopes</h2>
      <p className="mb-3">
        Cada API key tiene uno o más scopes. Hoy, al generar una key desde Configuración, se le dan los 4
        disponibles automáticamente:
      </p>
      <table className="mb-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th className="py-2 pr-4 font-semibold">Scope</th>
            <th className="py-2 font-semibold">Permite</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className="py-2 pr-4"><InlineCode>clientes:leer</InlineCode></td>
            <td className="py-2"><InlineCode>GET /api/v1/clientes</InlineCode></td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="py-2 pr-4"><InlineCode>clientes:escribir</InlineCode></td>
            <td className="py-2"><InlineCode>POST /api/v1/clientes</InlineCode></td>
          </tr>
          <tr className="border-b border-gray-100">
            <td className="py-2 pr-4"><InlineCode>facturas:leer</InlineCode></td>
            <td className="py-2"><InlineCode>GET /api/v1/facturas</InlineCode>, <InlineCode>GET /api/v1/facturas/:id</InlineCode></td>
          </tr>
          <tr>
            <td className="py-2 pr-4"><InlineCode>facturas:escribir</InlineCode></td>
            <td className="py-2"><InlineCode>POST /api/v1/facturas</InlineCode></td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-base font-semibold">Clientes</h2>

      <h3 className="mb-2 mt-4 text-sm font-semibold">GET /api/v1/clientes</h3>
      <p className="mb-2">
        Lista los clientes de tu cuenta. Paginación con <InlineCode>page</InlineCode>/
        <InlineCode>limit</InlineCode> (máximo 100, default 25).
      </p>
      <Code>GET /api/v1/clientes?page=1&limit=25</Code>
      <Code>{`{
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
}`}</Code>

      <h3 className="mb-2 mt-4 text-sm font-semibold">POST /api/v1/clientes</h3>
      <p className="mb-2">
        Crea un cliente nuevo. Solo <InlineCode>nombre</InlineCode> es requerido.
      </p>
      <Code>{`{
  "nombre": "Nuevo Cliente LLC",
  "email": "contacto@nuevocliente.com",
  "telefono": "787-555-0199",
  "tax_id": "66-9876543",
  "direccion": "456 Ave Ponce de León, San Juan, PR",
  "es_negocio": true,
  "retencion_pct": 10,
  "entity_id": "uuid (opcional)"
}`}</Code>
      <p className="mb-4">Responde 201 con el cliente creado (mismo formato que GET).</p>

      <h2 className="mb-2 mt-8 text-base font-semibold">Facturas</h2>

      <h3 className="mb-2 mt-4 text-sm font-semibold">GET /api/v1/facturas</h3>
      <p className="mb-2">
        Lista facturas de tu cuenta. Filtros opcionales: <InlineCode>estado</InlineCode> (borrador /
        enviada / vista / pagada / vencida), <InlineCode>cliente_id</InlineCode>,{" "}
        <InlineCode>desde</InlineCode> y <InlineCode>hasta</InlineCode> (YYYY-MM-DD, sobre
        fecha_emision). Misma paginación que Clientes.
      </p>
      <Code>GET /api/v1/facturas?estado=pagada&desde=2026-01-01&hasta=2026-06-30</Code>
      <Code>{`{
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
}`}</Code>

      <h3 className="mb-2 mt-4 text-sm font-semibold">GET /api/v1/facturas/:id</h3>
      <p className="mb-2">Detalle de una factura, con sus líneas.</p>
      <Code>{`{
  "data": {
    "id": "uuid",
    "numero": "INV-1024",
    "cliente_id": "uuid",
    "cliente_nombre": "Caribbean Health Solutions",
    "cliente_email": "billing@example.com",
    "subtotal": 500.00,
    "total": 450.00,
    "estado": "pagada",
    "fecha_emision": "2026-03-01",
    "fecha_pago": "2026-03-15",
    "lineas": [
      {
        "id": "uuid",
        "descripcion": "Consulta inicial",
        "cantidad": 1,
        "precio_unitario": 500.00,
        "subtotal_linea": 500.00
      }
    ]
  }
}`}</Code>

      <h3 className="mb-2 mt-4 text-sm font-semibold">POST /api/v1/facturas</h3>
      <p className="mb-2">
        Crea una factura nueva como <strong>borrador</strong> — nunca sale marcada &quot;enviada&quot;
        automáticamente; el dueño la revisa y la envía él mismo desde la app. El subtotal, impuestos,
        retención y número correlativo se calculan en el servidor — nunca se aceptan calculados desde
        afuera.
      </p>
      <Code>{`{
  "cliente_id": "uuid (requerido)",
  "entity_id": "uuid (opcional)",
  "fecha_vencimiento": "2026-04-15 (opcional)",
  "lineas": [
    {
      "descripcion": "Consulta inicial (requerido)",
      "cantidad": 1,
      "precio_unitario": 500.00,
      "servicio_id": "uuid (opcional)"
    }
  ]
}`}</Code>
      <p className="mb-2">Responde 201:</p>
      <Code>{`{
  "data": {
    "id": "uuid",
    "numero": "INV-1025",
    "subtotal": 500.00,
    "total": 450.00,
    "estado": "borrador",
    "fecha_emision": "2026-03-20",
    "fecha_vencimiento": "2026-04-19"
  }
}`}</Code>

      <h2 className="mb-2 mt-8 text-base font-semibold">Aislamiento entre cuentas</h2>
      <p className="mb-8">
        Toda consulta filtra siempre por el <InlineCode>owner_id</InlineCode> de la API key usada — nunca
        por nada que venga en la URL o el cuerpo del request. Si tu key está fija a una entidad
        específica, además queda limitada a esa entidad. Pedir un recurso que pertenece a otra cuenta
        siempre responde 404, nunca revela que existe.
      </p>
    </div>
  );
}
