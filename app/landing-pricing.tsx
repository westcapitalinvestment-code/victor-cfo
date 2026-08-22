"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

// Única parte interactiva del landing page: el toggle mensual/anual y el
// "ver más" de la lista de features del plan Core. En el HTML original
// esto era JS de vainilla manipulando el DOM a mano (onclick="...") — acá
// es el mismo comportamiento pero con estado de React, como el resto de
// la app.
// Anual = 11 meses (se paga 11, se usan 12 — "1 mes gratis"), no 10. Mismo
// redondeo hacia abajo al dólar entero que ya se usaba antes (14.99*11 =
// 219.89 → 219), solo que ahora con un mes de descuento en vez de dos.
const PRECIOS = {
  mensual: { core: "19", coreSuf: ".99/mes", pro: "49", proSuf: ".99/mes", proplus: "99", proplusSuf: ".99/mes" },
  anual: { core: "219", coreSuf: "/año", pro: "549", proSuf: "/año", proplus: "1099", proplusSuf: "/año" },
};

export default function LandingPricing() {
  const [anual, setAnual] = useState(false);
  const [coreExpandido, setCoreExpandido] = useState(false);
  const p = anual ? PRECIOS.anual : PRECIOS.mensual;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginBottom: "2rem" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 500, color: anual ? "var(--muted)" : "var(--white)" }}>Mensual</span>
        <div
          onClick={() => setAnual((v) => !v)}
          style={{
            width: 48,
            height: 26,
            background: "var(--teal)",
            borderRadius: 100,
            cursor: "pointer",
            position: "relative",
            transition: "background 0.2s",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              background: "#fff",
              borderRadius: "50%",
              position: "absolute",
              top: 3,
              left: anual ? 25 : 3,
              transition: "left 0.2s",
            }}
          />
        </div>
        <span style={{ fontSize: "0.9rem", color: anual ? "var(--white)" : "var(--muted)" }}>
          Anual{" "}
          <span
            style={{
              background: "var(--teal)",
              color: "#fff",
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "0.2rem 0.65rem",
              borderRadius: 100,
              marginLeft: "0.35rem",
            }}
          >
            1 mes GRATIS
          </span>
        </span>
      </div>

      <div className={styles.pricingGrid}>
        <div className={styles.priceCard}>
          <div className={styles.priceTier}>PERSONAL</div>
          <div className={styles.priceName}>VICTOR Core</div>
          <p className={styles.priceDesc}>Para cualquier persona que quiera organizar sus finanzas y su vida en un solo lugar.</p>
          <div className={styles.priceAmount}>
            <sup>$</sup>
            <span>{p.core}</span>
            <span className={styles.mo}>{p.coreSuf}</span>
          </div>
          <hr className={styles.priceDivider} />
          <ul className={styles.priceFeatures}>
            <li>Conecta tu banco y ve tus gastos reales al instante</li>
            <li>Plan personalizado para eliminar tus deudas</li>
            <li>Estrategia Bola de Nieve, Avalancha o Híbrido — tú eliges</li>
            {coreExpandido && (
              <>
                <li>VICTOR celebra cada deuda que eliminas 🎉</li>
                <li>Plan patrimonial: ahorro → deudas → retiro → inversión</li>
                <li>Manejo de tarjetas: balance, APR y fecha de corte en un vistazo</li>
                <li>Plan de retiro con proyección visual a tu medida</li>
                <li>Plan de estudios para tus hijos — empieza hoy, llega lejos 🎓</li>
                <li>Calendario de fechas importantes y vencimientos</li>
                <li>Alertas 90/30/7 días antes de que algo venza</li>
                <li>Reporte mensual automático de tu situación real</li>
                <li>Chat con VICTOR 24/7 — te conoce, no te juzga</li>
              </>
            )}
          </ul>
          <button className={styles.moreBtn} onClick={() => setCoreExpandido((v) => !v)}>
            {coreExpandido ? "Ver menos ↑" : "Ver más ↓"}
          </button>
          <Link href="/registro" className={`${styles.priceCta} ${styles.ctaFilled}`}>
            Comienza ahora
          </Link>
        </div>

        <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
          <div className={styles.featuredBadge}>MÁS POPULAR</div>
          <div className={styles.priceTier}>NEGOCIO</div>
          <div className={styles.priceName}>VICTOR Pro</div>
          <p className={styles.priceDesc}>Para el dueño de negocio que quiere controlar todo — negocio y personal — en un solo lugar.</p>
          <div className={styles.priceAmount}>
            <sup>$</sup>
            <span>{p.pro}</span>
            <span className={styles.mo}>{p.proSuf}</span>
          </div>
          <hr className={styles.priceDivider} />
          <ul className={styles.priceFeatures}>
            <li>Todo lo del Core</li>
            <li>Dashboard negocio + personal separados</li>
            <li>Múltiples cuentas bancarias</li>
            <li>Categorización negocio vs personal</li>
            <li>Reportes listos para tu CPA</li>
            <li>Historial financiero ilimitado</li>
            <li>Invita a tu secretaria o técnicos (addon)</li>
            <li>Conecta múltiples entidades de negocio (addon)</li>
          </ul>
          <Link href="/registro" className={`${styles.priceCta} ${styles.ctaFilled}`}>
            Comienza ahora
          </Link>
        </div>

        <div className={styles.priceCard}>
          <div className={styles.priceTier}>ENTERPRISE</div>
          <div className={styles.priceName}>
            VICTOR Enterprise
            <div style={{ fontSize: "0.7rem", color: "var(--teal-mid)", fontWeight: 600, marginTop: "0.2rem" }}>
              Próximamente
            </div>
          </div>
          <p className={styles.priceDesc}>Para el negocio que además quiere facturar y cobrar a sus propios clientes.</p>
          <div className={styles.priceAmount}>
            <sup>$</sup>
            <span>{p.proplus}</span>
            <span className={styles.mo}>{p.proplusSuf}</span>
          </div>
          <hr className={styles.priceDivider} />
          <ul className={styles.priceFeatures}>
            <li>Todo lo del Pro</li>
            <li>Facturación profesional con tu logo</li>
            <li>Cobra por ATH Móvil, tarjeta o transferencia</li>
            <li>Tracking de facturas pagadas y pendientes</li>
            <li>Alertas automáticas de cobros atrasados</li>
          </ul>
          <span
            className={styles.priceCta}
            style={{ background: "var(--border)", color: "var(--muted)", cursor: "default" }}
          >
            Próximamente
          </span>
        </div>
      </div>

      {anual && (
        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--muted)", marginTop: "1rem" }}>
          💡 Precio de lanzamiento bloqueado para nuevos miembros. Se renueva al precio vigente del año siguiente.
        </p>
      )}
    </>
  );
}
