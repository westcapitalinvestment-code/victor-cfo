-- ============================================================================
-- VICTOR CFO — 0110: 2 artículos nuevos del manual consultable (30 sept
-- 2026, pedido de Joel: "ahora VICTOR tiene que saber esas nuevas
-- integraciones y lo de Zapier de la API"). Cubre las 2 features que ya
-- están construidas pero de las que VICTOR todavía no sabía nada:
--   1. API pública v1 + Zapier (migración 0108, tarea #722-723).
--   2. Integración directa de Shopify vía webhook propio (migración 0109).
-- Mismo patrón que 0061/0102: INSERT en manual_articulos, VICTOR los
-- encuentra vía la tool consultar_manual (búsqueda ILIKE sobre
-- slug/titulo, con fallback a resumen/contenido).
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'api-publica-zapier',
  'API pública de VICTOR CFO + integración con Zapier',
  'VICTOR CFO tiene una API pública (v1) para Clientes y Facturas, con API keys que el usuario genera él mismo en Configuración, y una integración oficial en el directorio de Zapier para conectar VICTOR con miles de otras apps sin escribir código.',
  $md$**Qué es**: VICTOR CFO tiene una API REST pública (v1) que permite leer y crear Clientes y Facturas desde fuera de la app — pensada para que el usuario conecte VICTOR con otras herramientas que ya usa (hojas de cálculo, CRMs, formularios, su propio sitio web, o cualquier app compatible con Zapier).

**Cómo se activa (API directa)**:
1. En Configuración → API / Integraciones, el usuario genera su propia API key (empiezan con `vcfo_live_...`) — puede tener varias a la vez, con scopes distintos (`facturas:leer`, `facturas:escribir`, `clientes:leer`, `clientes:escribir`).
2. Cada request se autentica con esa key en el header `Authorization: Bearer vcfo_live_...`.
3. La documentación completa (endpoints, parámetros, ejemplos) vive en `/api-docs` dentro de la propia app — es la primera pantalla que hay que mandarle al usuario si pregunta "¿cómo uso la API?".
4. Endpoints principales: `GET/POST /api/v1/facturas` y `GET/POST /api/v1/clientes` (paginado, filtros por estado/cliente/fecha en facturas).

**Cómo se activa (Zapier, sin código)**:
1. VICTOR CFO está publicado en el directorio oficial de Zapier — el usuario busca "VICTOR CFO" dentro de Zapier al crear un Zap.
2. Al conectar, Zapier le pide la API key (la misma que generó en Configuración → API/Integraciones).
3. Triggers disponibles: nueva factura (polling). Actions disponibles: crear cliente, crear factura.
4. Con esto el usuario puede, por ejemplo, crear una factura en VICTOR automáticamente cuando llega un pedido de un formulario de Google, o mandar un mensaje a Slack cada vez que se cobra una factura — sin escribir ni una línea de código.

**Cuándo mencionarlo**: si el usuario pregunta por integraciones, automatizaciones, conectar VICTOR con otras apps, o específicamente por Zapier/API, esta es la respuesta. Es una feature de cuenta Pro (requiere entidad de negocio activa) — igual que Facturación.

**Límite importante**: la API y Zapier operan sobre los mismos datos y reglas de negocio que la app (mismo cálculo de IVU/retención al crear una factura vía API que si se crea a mano). No confundir con la integración de Shopify (ver artículo "integracion-directa-shopify"), que es un camino aparte y no pasa por Zapier.$md$
),
(
  'integracion-directa-shopify',
  'Integración directa con Shopify (automática, sin Zapier)',
  'VICTOR CFO se puede conectar directo a una tienda de Shopify: cada vez que una orden se paga, VICTOR crea el cliente y la factura (ya pagada) automáticamente, usando el monto exacto que Shopify ya cobró — sin pasar por Zapier ni por ningún paso manual.',
  $md$**Qué es**: una conexión directa (webhook propio de Shopify, NO a través de Zapier) entre una tienda de Shopify y una entidad de negocio en VICTOR CFO. Cuando una orden de esa tienda se marca como pagada, VICTOR automáticamente:
1. Crea (o reconoce, si ya compró antes) el Cliente.
2. Crea la Factura correspondiente, ya en estado "pagada", con el desglose de líneas de la orden.

**Monto usado**: VICTOR usa el subtotal/tax/total EXACTOS que Shopify ya cobró — no recalcula el IVU ni la retención de VICTOR encima. Es una decisión de diseño: la orden ya salió cobrada con la lógica fiscal de la propia tienda de Shopify, así que duplicar el cálculo generaría números distintos y confusos.

**Trigger**: solo órdenes PAGADAS (webhook `orders/paid`). Una orden creada pero sin pagar no genera nada en VICTOR.

**Cómo se conecta** (lo hace el dueño del negocio, una sola vez por tienda):
1. En Configuración → [su entidad] → tab Facturas → Integraciones, hay una tarjeta "Shopify" con botón Conectar.
2. Necesita 3 datos de su Shopify Admin (Configuración → Apps y canales de venta → Desarrollar apps → crear/usar un Custom App con permisos `read_orders` y `read_customers`): el dominio de la tienda (`tu-tienda.myshopify.com`), el Admin API access token, y el API secret key (para verificar que los webhooks de verdad vienen de Shopify).
3. VICTOR valida las credenciales y registra el webhook solo — el usuario no tiene que tocar nada más del lado de Shopify.
4. Se puede desconectar en cualquier momento desde la misma pantalla.

**Cuándo mencionarlo**: si el usuario tiene (o pregunta por) una tienda de Shopify y quiere que sus ventas entren solas a Facturación sin trabajo manual, esta es la respuesta. Es distinto de la API/Zapier (ver artículo "api-publica-zapier") — Shopify es un camino aparte, ya armado específicamente para ese caso, y no requiere que el usuario configure nada en Zapier.$md$
);
