"use client";

import { useState } from "react";
import styles from "./landing.module.css";

// Tour interactivo del producto (27 sept 2026, pedido de Joel tras ver
// holded.com) — quería algo como la sección de Holded donde uno "hace
// click en todas las partes" del producto y ve mockups reales moverse.
// Esto es un client component aparte porque necesita useState para las
// pestañas; landing-page.tsx sigue siendo server component. Los mockups
// son HTML/CSS puro (no screenshots) con datos de ejemplo — mismo
// principio que el mock "terminal" del hero: se ve real sin exponer
// datos de un usuario de verdad.

type TabId = "inicio" | "victor" | "facturacion" | "gastos";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "inicio", label: "Inicio", icon: "🏠" },
  { id: "victor", label: "Chat con VICTOR", icon: "💬" },
  { id: "facturacion", label: "Facturación", icon: "🧾" },
  { id: "gastos", label: "Gastos", icon: "💳" },
];

export default function LandingProductTour() {
  const [active, setActive] = useState<TabId>("inicio");

  return (
    <div className={styles.tourWrap}>
      <div className={styles.tourTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`${styles.tourTab} ${active === tab.id ? styles.tourTabActive : ""}`}
          >
            <span className={styles.tourTabIcon}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tourFrame}>
        <div className={styles.tourFrameBar}>
          <span className={`${styles.termDot} ${styles.dR}`} />
          <span className={`${styles.termDot} ${styles.dY}`} />
          <span className={`${styles.termDot} ${styles.dG}`} />
          <span className={styles.termTitle}>app.victorcfo.com</span>
        </div>

        <div className={styles.tourFrameBody} key={active}>
          {active === "inicio" && <TourInicio />}
          {active === "victor" && <TourVictor />}
          {active === "facturacion" && <TourFacturacion />}
          {active === "gastos" && <TourGastos />}
        </div>
      </div>
    </div>
  );
}

function TourInicio() {
  return (
    <div className={styles.tourScreen}>
      <div className={styles.tourScreenHead}>
        <div>
          <div className={styles.tourGreeting}>Buenos días, Marta</div>
          <div className={styles.tourSubtle}>Miércoles, 24 de septiembre</div>
        </div>
        <div className={styles.tourPill}>Plan Core</div>
      </div>

      <div className={styles.tourBalanceCard}>
        <div className={styles.tourSubtle}>Balance disponible</div>
        <div className={styles.tourBalanceNum}>$18,420.00</div>
        <div className={styles.tourBalanceRow}>
          <span className={styles.tourUp}>↑ Ingresos $6,240</span>
          <span className={styles.tourDown}>↓ Gastos $2,180</span>
        </div>
      </div>

      <div className={styles.tourAlert}>
        <span>⚠️</span>
        <div>
          <strong>3 gastos sin categorizar</strong>
          <div className={styles.tourSubtle}>VICTOR puede resolverlos por ti — solo dile "categorízalos"</div>
        </div>
      </div>

      <div className={styles.tourMiniGrid}>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Metas</div>
          <div className={styles.tourMiniNum}>2 activas</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Próxima cita</div>
          <div className={styles.tourMiniNum}>Mar 30 · CPA</div>
        </div>
      </div>
    </div>
  );
}

function TourVictor() {
  return (
    <div className={styles.tourScreen}>
      <div className={styles.tourChatMsg}>
        <div className={styles.tourChatVictor}>V</div>
        <div className={styles.tourBubbleVictor}>
          Buenos días. Tu excedente lleva 60 días quieto en la cuenta — podría estar trabajando para ti. ¿Te cuento cómo?
        </div>
      </div>
      <div className={`${styles.tourChatMsg} ${styles.tourChatMsgUser}`}>
        <div className={styles.tourBubbleUser}>Sí, cuéntame</div>
      </div>
      <div className={styles.tourChatMsg}>
        <div className={styles.tourChatVictor}>V</div>
        <div className={styles.tourBubbleVictor}>
          Con $12,480 de excedente y tu perfil, hay 2-3 opciones que no tocan tu fondo de emergencia. Te las explico una por una — ¿empezamos por la más conservadora?
        </div>
      </div>
      <div className={styles.tourChatInputBar}>
        <span className={styles.tourSubtle}>Escríbele a VICTOR...</span>
        <span className={styles.tourChatSend}>➤</span>
      </div>
    </div>
  );
}

function TourFacturacion() {
  const rows = [
    { name: "Hotel Playa Dorada", amount: "$1,240.00", status: "Pagada", ok: true },
    { name: "Clínica Vista Verde", amount: "$680.00", status: "Enviada", ok: false },
    { name: "Restaurante El Fogón", amount: "$2,100.00", status: "Vencida", ok: false, late: true },
  ];
  return (
    <div className={styles.tourScreen}>
      <div className={styles.tourScreenHead}>
        <div className={styles.tourGreeting}>Facturación</div>
        <div className={styles.tourPillTeal}>+ Nueva factura</div>
      </div>
      <div className={styles.tourMiniGrid}>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Facturado (mes)</div>
          <div className={styles.tourMiniNum}>$8,940</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Cobrado</div>
          <div className={styles.tourMiniNum}>$7,260</div>
        </div>
      </div>
      <div className={styles.tourList}>
        {rows.map((r) => (
          <div key={r.name} className={styles.tourListRow}>
            <div>
              <div className={styles.tourListName}>{r.name}</div>
              <div className={styles.tourSubtle}>{r.amount}</div>
            </div>
            <span
              className={
                r.ok ? styles.tourBadgeGreen : r.late ? styles.tourBadgeRed : styles.tourBadgeAmber
              }
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourGastos() {
  const rows = [
    { name: "ATH Móvil Business", cat: "Suplidores", amount: "-$340.00" },
    { name: "AutoExpreso", cat: "Vehículo", amount: "-$22.50" },
    { name: "Depósito cliente", cat: "Ingreso", amount: "+$1,100.00", income: true },
  ];
  return (
    <div className={styles.tourScreen}>
      <div className={styles.tourScreenHead}>
        <div className={styles.tourGreeting}>Gastos e ingresos</div>
        <div className={styles.tourSubtle}>Septiembre 2026</div>
      </div>
      <div className={styles.tourList}>
        {rows.map((r) => (
          <div key={r.name} className={styles.tourListRow}>
            <div>
              <div className={styles.tourListName}>{r.name}</div>
              <div className={styles.tourSubtle}>{r.cat}</div>
            </div>
            <span className={r.income ? styles.tourAmountGreen : styles.tourAmountWhite}>{r.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
