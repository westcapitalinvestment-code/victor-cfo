"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Nav persistente — calcada de VICTOR — Dashboard Core.html. Las pestañas
// de negocio (Cobros/Facturas/Equipo/Admin/Técnico) se ven SIEMPRE, para
// todos los planes — el gating pasa dentro de cada página (ProPaywall si
// el usuario no es Pro/Pro+). La idea de Joel: que VICTOR pueda guiar a
// cualquier usuario hacia el upgrade en el momento que detecte actividad
// de negocio, en vez de esconder la sección por completo.
const TABS_PERSONAL = [
  { href: "/dashboard", label: "Inicio", icon: "ti-home" },
  { href: "/dashboard/gastos", label: "Gastos", icon: "ti-chart-bar" },
  { href: "/dashboard/metas", label: "Metas", icon: "ti-target" },
  { href: "/dashboard/documentos", label: "Bóveda", icon: "ti-file-text" },
  { href: "/dashboard/cuentas", label: "Cuentas", icon: "ti-credit-card" },
];

// Mismos 5 íconos pero apuntando a las versiones de negocio (1 sept 2026) —
// se usan en vez de TABS_PERSONAL cuando ya estás navegando dentro de
// /dashboard/negocio/..., para que Inicio/Gastos/Metas/Bóveda/Cuentas se
// queden en el contexto de la entidad activa en vez de regresarte a
// Personal. La entidad misma vive en la cookie (lib/entidad-activa.ts), no
// en la URL, así que estos hrefs no cambian por entidad.
const TABS_NEGOCIO_INICIO = [
  { href: "/dashboard/negocio", label: "Inicio", icon: "ti-home" },
  { href: "/dashboard/negocio/gastos", label: "Gastos", icon: "ti-chart-bar" },
  { href: "/dashboard/negocio/metas", label: "Metas", icon: "ti-target" },
  { href: "/dashboard/negocio/documentos", label: "Bóveda", icon: "ti-file-text" },
  { href: "/dashboard/negocio/cuentas", label: "Cuentas", icon: "ti-credit-card" },
];

// Orden y nombres calcados de VICTOR Pro — Producto Completo_FINAL.html
// (30-31 agosto 2026, corrección de Joel): "Cobros" no es un ícono propio
// del nav — vive DENTRO del portal de Facturación como pestaña. El segundo
// ícono de negocio es "Pagos" (pagarle a contratistas/técnicos con
// retención 480.6) — pantalla nueva y distinta, todavía sin construir.
const TABS_NEGOCIO = [
  { href: "/dashboard/facturacion", label: "Facturas", icon: "ti-file-invoice" },
  { href: "/dashboard/pagos", label: "Pagos", icon: "ti-cash" },
  { href: "/dashboard/admin", label: "Admin", icon: "ti-user-cog" },
  { href: "/dashboard/equipo", label: "Equipo", icon: "ti-users" },
  { href: "/dashboard/tecnico", label: "Técnico", icon: "ti-tool" },
];

const TAB_CONFIG = { href: "/dashboard/config", label: "Config", icon: "ti-settings" };

function NavLink({ tab, active }: { tab: { href: string; label: string; icon: string }; active: boolean }) {
  return (
    <Link href={tab.href} className="vc-nb">
      <i className={`ti ${tab.icon} ${active ? "on" : ""}`} />
      <span className={`vc-nl ${active ? "on" : ""}`}>{tab.label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  // "/dashboard" y "/dashboard/negocio" son los dos "Inicio" (Personal y de
  // negocio) — necesitan comparación exacta, si no "/dashboard/negocio"
  // quedaría marcado "on" en CUALQUIER subpágina de negocio (Gastos, Metas,
  // etc.), porque todas empiezan con ese mismo prefijo.
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/dashboard/negocio" ? pathname === href : pathname.startsWith(href);

  // /dashboard/facturacion, /dashboard/clientes y /dashboard/entidades
  // también son "negocio", pero no cuelgan de /dashboard/negocio — por eso
  // el swap de Inicio/Gastos/Metas/Bóveda/Cuentas solo pasa cuando el
  // pathname empieza exactamente con /dashboard/negocio (donde sí existen
  // esas 5 páginas hermanas de Personal).
  const enNegocio = pathname.startsWith("/dashboard/negocio");
  const tabsPrimerGrupo = enNegocio ? TABS_NEGOCIO_INICIO : TABS_PERSONAL;

  return (
    <div className="vc-bnav">
      <div className="vc-bnav-scroll">
        {tabsPrimerGrupo.map((tab) => (
          <NavLink key={tab.href} tab={tab} active={isActive(tab.href)} />
        ))}
        <div style={{ width: 2, background: "#1D9E75", margin: "4px 6px", opacity: 0.7, borderRadius: 2, flexShrink: 0 }} />
        {TABS_NEGOCIO.map((tab) => (
          <NavLink key={tab.href} tab={tab} active={isActive(tab.href)} />
        ))}
        <NavLink tab={TAB_CONFIG} active={isActive(TAB_CONFIG.href)} />
      </div>
    </div>
  );
}
