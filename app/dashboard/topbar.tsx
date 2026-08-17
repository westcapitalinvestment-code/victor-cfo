"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Barra superior compartida de todo el dashboard — calcada de la
// .topbar de VICTOR — Dashboard Core.html: logo + nombre + badge de plan,
// banner central para invitar al contable (gratis, para cualquier plan —
// es un loop de referidos, no un upsell de Pro), toggle día/noche
// funcional, campana, y debajo los tabs de contexto Personal/Resumen.
// "Negocio" no se muestra todavía — ese selector de entidad es parte del
// multi-entidad de Pro, que sigue en pausa (ver #34/#35).
// Se monta una sola vez desde app/dashboard/layout.tsx.

const THEME_KEY = "victor_theme";

function isDarkNow(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDarkNow());
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  return (
    <button type="button" onClick={toggle} className="vc-tw" title="Modo día/noche" aria-label="Cambiar modo día/noche">
      <i className="ti ti-sun" style={{ fontSize: 12, color: "var(--muted)" }} />
      <span className="vc-tt">
        <span className={`vc-tk ${dark ? "on" : ""}`} />
      </span>
      <i className="ti ti-moon" style={{ fontSize: 12, color: "var(--muted)" }} />
    </button>
  );
}

export default function Topbar({ fullName, plan }: { fullName: string | null; plan: string | null }) {
  const esPro = plan === "pro" || plan === "proplus";
  const nombreCorto = (fullName || "").split(" ")[0];
  const pathname = usePathname();
  const enResumen = pathname === "/dashboard/resumen";

  return (
    <div className="vc-topbar-wrap">
      <div className="vc-topbar">
        <div className="vc-topbar-top">
          <div className="vc-topbar-logo flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="vc-logo-name">VICTOR</span>
                <span className={`vc-plan-badge ${esPro ? "pro" : ""}`}>{esPro ? "Pro" : "Core"}</span>
              </div>
              {nombreCorto && <div className="text-[11px] text-muted">{nombreCorto}</div>}
            </div>
          </div>

          <div className="vc-topbar-icons flex items-center gap-2">
            <div className="vc-victor-pill">
              <span className="text-xs font-medium">VICTOR</span>
              <span className="vc-victor-dot" />
            </div>
            <ThemeToggle />
            <button type="button" className="vc-bell" title="Notificaciones" aria-label="Notificaciones">
              <i className="ti ti-bell" style={{ fontSize: 17 }} />
            </button>
          </div>
        </div>

        {/* Invitar al contable — gratis para cualquier plan. La idea es que
            los mismos CPAs nos hagan mercadeo: un cliente invita a su
            contador, y luego ese contador invita a sus otros clientes. */}
        <Link href="/dashboard/invitar-contable" className="vc-invite-banner">
          <i className="ti ti-user-plus" style={{ fontSize: 15 }} />
          <span>
            <span className="vc-invite-title">Invita a tu contable</span>
            <span className="vc-invite-sub">Acceso gratis · sin costo adicional</span>
          </span>
        </Link>
      </div>

      {/* Tabs de contexto — Personal y Resumen están disponibles en Core.
          Negocio (selector de entidad) llega con el multi-entidad de Pro. */}
      <div className="vc-ctxbar">
        <div className="vc-ctxwrap">
          <Link href="/dashboard" className={`vc-ctxtab ${!enResumen ? "on" : ""}`}>
            Personal
          </Link>
          <Link href="/dashboard/resumen" className={`vc-ctxtab ${enResumen ? "on" : ""}`}>
            Resumen
          </Link>
        </div>
      </div>
    </div>
  );
}
