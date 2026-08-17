# VICTOR CFO — App

Sprint 1: base de auth + dashboard conectado a Supabase real, construido con
Next.js 14 (App Router) + Tailwind + Supabase Auth (@supabase/ssr).

## Correr localmente

```bash
npm install
npm run dev
```

Abre http://localhost:3000 — te manda a `/login`. Con un usuario válido de
Supabase Auth entras a `/dashboard`.

## Variables de entorno

Ya están en `.env.local` (con las credenciales reales del proyecto de
Supabase — **no subir este archivo a git**, ya está en `.gitignore`).
`.env.local.example` tiene la plantilla sin secretos.

## Base de datos

`supabase/migrations/0001_schema_completo.sql` es el schema real y
definitivo (16 ago 2026) — reemplaza el plan del docx original porque se
verificó contra las 14 tablas que de verdad existían en Supabase (estaban
vacías, sin datos, confirmado con Joel) y las reemplaza por completo con
un diseño único que incluye multi-entidad, portal CPA, motor de
categorización, IVU y auditoría. **Todavía no se ha corrido contra la base
real** — el sandbox donde se generó este proyecto no tiene acceso de red a
Supabase. Para aplicarlo:

1. Entra a https://supabase.com/dashboard/project/cmolhciiaxdniqijpmtt/sql/new
2. Pega el contenido completo de `supabase/migrations/0001_schema_completo.sql`
3. Dale Run — es seguro, borra las 14 tablas viejas (confirmado vacías) y
   crea todo de nuevo en un solo paso

`0001_iva_cpa_categorizacion.sql` quedó obsoleto — no usarlo, asumía
nombres de tabla que no existían de verdad. Se dejó en la carpeta con una
nota en vez de borrarlo.

## Qué existe ahora mismo

- `/login` — auth real con Supabase (email + password)
- `/dashboard` — shell protegido (middleware redirige a `/login` si no hay
  sesión), lee `business_entities` del dueño autenticado
- Paleta y componentes visuales calcados de
  `VICTOR Pro — Producto Completo_FINAL.html` (mismos colores, mismo `--teal`)

## Qué falta (en orden sugerido)

1. Aplicar la migración SQL (ver arriba) contra el Supabase real
2. Wizard de "Nueva entidad" (4 pasos, ya diseñado en sesiones anteriores)
3. Pantallas de facturación (clients, services, invoices)
4. Integración de Plaid Link
5. Checkout de Stripe para los planes + los 4 add-ons
6. Portal del CPA — el mockup completo está en `VICTOR_Portal_CPA.html`,
   listo para traducirse a componentes reales una vez el dashboard del
   dueño esté funcionando
