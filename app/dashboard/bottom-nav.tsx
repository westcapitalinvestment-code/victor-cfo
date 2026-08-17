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

const TABS_NEGOCIO = [
  { href: "/dashboard/cobros", label: "Cobros", icon: "ti-cash" },
  { href: "/dashboard/facturacion", label: "Facturas", icon: "ti-file-invoice" },
  { href: "/dashboard/equipo", label: "Equipo", icon: "ti-users" },
  { href: "/dashboard/admin", label: "Admin", icon: "ti-user-cog" },
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
  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href));

  return (
    <div className="vc-bnav">
      <div className="vc-bnav-scroll">
        {TABS_PERSONAL.map((tab) => (
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
