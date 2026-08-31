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

// Evento simple para "abrir el chat de VICTOR" desde cualquier parte de la
// UI sin tener que subir el estado `open` (que vive local en victor-chat.tsx)
// hasta un ancestro común — victor-chat.tsx escucha este evento y hace
// setOpen(true). Mismo patrón liviano que ya usa badge-updater.tsx con
// visibilitychange, sin necesidad de un state manager nuevo.
const EVENTO_ABRIR_VICTOR = "victor:abrir";

export default function Topbar({ fullName, plan }: { fullName: string | null; plan: string | null }) {
  const esPro = plan === "pro" || plan === "proplus";
  // Badge de plan (30 agosto 2026, reportado por Joel): antes esto solo
  // distinguía Pro de "todo lo demás" (mostraba "Core" incluso para un
  // usuario en plan gratis, que nunca pagó nada) — con el plan gratis ya
  // real, hace falta un tercer estado.
  const esGratis = plan === "gratis";
  const nombreCorto = (fullName || "").split(" ")[0];
  const pathname = usePathname();
  const enResumen = pathname === "/dashboard/resumen";

  // El "pill" de VICTOR en el topbar ERA solo decorativo (un puntito verde
  // fijo). Decisión de Joel (28 agosto 2026): en vez de agregar una
  // campanita de notificaciones tradicional (que todas las apps tienen),
  // este pill se convierte en el centro de notificaciones real — el punto
  // cambia de verde fijo a ámbar pulsante cuando hay algo pendiente
  // (gastos sin categorizar o documentos por vencer, mismo cálculo que ya
  // usa el badge de la PWA en /api/badge-count), y tocarlo abre el chat de
  // VICTOR directo — porque a diferencia de otras apps, aquí las alertas
  // las da VICTOR conversando, no una lista muda.
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    let activo = true;
    function revisarPendientes() {
      fetch("/api/badge-count")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (activo && data) setPendientes(Number(data.count) || 0);
        })
        .catch(() => {
          // Silencioso — el indicador es un "nice to have", nunca debe
          // tumbar el topbar si falla el fetch.
        });
    }
    revisarPendientes();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revisarPendientes();
    });
    return () => {
      activo = false;
    };
  }, []);

  function abrirVictor() {
    window.dispatchEvent(new Event(EVENTO_ABRIR_VICTOR));
  }

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
                <span className={`vc-plan-badge ${esPro ? "pro" : esGratis ? "gratis" : ""}`}>
                  {esPro ? "Pro" : esGratis ? "Free" : "Core"}
                </span>
              </div>
              {nombreCorto && <div className="text-[11px] text-muted">{nombreCorto}</div>}
            </div>
          </div>

          <div className="vc-topbar-icons flex items-center gap-2">
            <button
              type="button"
              className="vc-victor-pill"
              onClick={abrirVictor}
              title={pendientes > 0 ? `VICTOR tiene ${pendientes} cosa(s) pendiente(s) para ti` : "Hablar con VICTOR"}
              aria-label="Abrir VICTOR"
            >
              <span className="text-xs font-medium">VICTOR</span>
              <span className={`vc-victor-dot ${pendientes > 0 ? "alerta" : ""}`} />
            </button>
            <ThemeToggle />
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
