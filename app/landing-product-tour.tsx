"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";

// Tour interactivo del producto (27 sept 2026, pedido de Joel tras ver
// holded.com). Reconstruido a partir del mockup real "victor_pro_master"
// que Joel ya usa como referencia de producto — misma tarjeta de balance
// teal, misma lista de facturas con badges de estado y avatares de
// iniciales, mismo chat de VICTOR — en vez de un mockup genérico
// inventado. Todos los nombres/montos son ficticios (sin datos de
// Joel/VIP Medical/WCV). Avanza solo cada 4.5s como una demo; se detiene
// si el usuario hace clic en una pestaña.

type TabId = "inicio" | "victor" | "facturacion" | "gastos";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "inicio", label: "Inicio", icon: "🏠" },
  { id: "victor", label: "Chat con VICTOR", icon: "💬" },
  { id: "facturacion", label: "Facturación", icon: "🧾" },
  { id: "gastos", label: "Gastos", icon: "💳" },
];

export default function LandingProductTour() {
  const [active, setActive] = useState<TabId>("inicio");
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      setActive((cur) => {
        const idx = TABS.findIndex((t) => t.id === cur);
        return TABS[(idx + 1) % TABS.length].id;
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [autoplay]);

  function selectTab(id: TabId) {
    setActive(id);
    setAutoplay(false);
  }

  return (
    <div className={styles.tourWrap}>
      <div className={styles.tourTabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
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
          <div className={styles.tourGreeting}>Buenos días 👋</div>
          <div className={styles.tourSubtle}>Miércoles, 24 sept · Negocio</div>
        </div>
        <div className={styles.tourPill}>Plan Pro</div>
      </div>

      <div className={styles.tourBalanceCard}>
        <div className={styles.tourBalanceLbl}>Ingresos del mes</div>
        <div className={styles.tourBalanceNum}>$8,240.00</div>
        <div className={styles.tourBalanceRow}>
          <span>BPPR ••4821</span>
          <span className={styles.tourUp}>↑ 12% vs mes anterior</span>
        </div>
      </div>

      <div className={styles.tourMiniGrid}>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Facturado</div>
          <div className={styles.tourMiniNum}>$9,500</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Cobrado</div>
          <div className={styles.tourMiniNum}>$8,440</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Pendiente</div>
          <div className={styles.tourMiniNum}>$1,060</div>
        </div>
      </div>

      <div className={styles.tourAlert}>
        <span>⚠️</span>
        <div>
          <strong>4 gastos sin categorizar</strong>
          <div className={styles.tourSubtle}>VICTOR los detectó esta semana — solo dile &quot;categorízalos&quot;</div>
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
          Buenos días. Tienes una factura vencida de $60 y un cliente lleva 11 días sin pagar $1,080. ¿Quieres que te ayude a redactar un recordatorio?
        </div>
      </div>
      <div className={`${styles.tourChatMsg} ${styles.tourChatMsgUser}`}>
        <div className={styles.tourBubbleUser}>Sí, redáctalo</div>
      </div>
      <div className={styles.tourChatMsg}>
        <div className={styles.tourChatVictor}>V</div>
        <div className={styles.tourBubbleVictor}>
          Listo, te lo dejé preparado para enviar por WhatsApp. También noté que tu excedente lleva 60 días quieto en la cuenta — ¿te cuento un par de opciones para que trabaje por ti?
        </div>
      </div>
      <div className={styles.tourChatQuick}>
        <span className={styles.tourChatQuickBtn}>Ver mis metas</span>
        <span className={styles.tourChatQuickBtn}>Analizar mis gastos</span>
        <span className={styles.tourChatQuickBtn}>Redactar recordatorio</span>
      </div>
      <div className={styles.tourChatInputBar}>
        <span className={styles.tourSubtle}>Pregúntale a VICTOR...</span>
        <span className={styles.tourChatSend}>➤</span>
      </div>
    </div>
  );
}

function TourFacturacion() {
  const rows = [
    { name: "Clínica del Este", init: "CE", color: "#0F6E56", amount: "$3,290", status: "Pagada", badge: "green" as const },
    { name: "Dr. Ramírez", init: "DR", color: "#534AB7", amount: "$1,080", status: "Vista sin pagar", badge: "amber" as const },
    { name: "Grupo Médico PR", init: "GM", color: "#A32D2D", amount: "$60", status: "Vencida", badge: "red" as const },
    { name: "Servicios Preventivos", init: "SP", color: "#185FA5", amount: "$450", status: "Pagada ↺", badge: "green" as const },
  ];
  return (
    <div className={styles.tourScreen}>
      <div className={styles.tourScreenHead}>
        <div className={styles.tourGreeting}>Facturación</div>
        <div className={styles.tourPillTeal}>+ Nueva</div>
      </div>
      <div className={styles.tourMiniGrid}>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Facturado</div>
          <div className={styles.tourMiniNum}>$9,500</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Cobrado</div>
          <div className={styles.tourMiniNum}>$8,440</div>
        </div>
        <div className={styles.tourMiniCard}>
          <div className={styles.tourSubtle}>Vencida</div>
          <div className={styles.tourMiniNum}>$60</div>
        </div>
      </div>
      <div className={styles.tourList}>
        {rows.map((r) => (
          <div key={r.name} className={styles.tourListRow}>
            <div className={styles.tourAvatar} style={{ background: r.color }}>{r.init}</div>
            <div className={styles.tourListInfo}>
              <div className={styles.tourListName}>{r.name}</div>
              <div className={styles.tourSubtle}>{r.amount}</div>
            </div>
            <div className={styles.tourListRight}>
              <span className={r.badge === "green" ? styles.tourBadgeGreen : r.badge === "red" ? styles.tourBadgeRed : styles.tourBadgeAmber}>
                {r.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourGastos() {
  const rows = [
    { name: "Suplidor de oficina", cat: "Suplidores", amount: "-$340.00" },
    { name: "Peaje AutoExpreso", cat: "Vehículo", amount: "-$22.50" },
    { name: "Depósito de cliente", cat: "Ingreso", amount: "+$1,100.00", income: true },
    { name: "Combustible", cat: "Transporte", amount: "-$45.00" },
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
            <div className={styles.tourListInfo}>
              <div className={styles.tourListName}>{r.name}</div>
              <div className={styles.tourSubtle}>{r.cat}</div>
            </div>
            <div className={styles.tourListRight}>
              <span className={r.income ? styles.tourAmountGreen : styles.tourAmountWhite}>{r.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
