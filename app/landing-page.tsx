import Link from "next/link";
import styles from "./landing.module.css";
import LandingPricing from "./landing-pricing";

// Landing page público de VICTOR (victorcfo.com) — calcado de
// "VICTOR — Tu CFO Virtual.html". Vive dentro de la misma app Next.js
// (un solo proyecto, un solo deploy en Vercel) para que los botones de
// "Comienza ahora" enlacen directo a /registro sin configurar dominios ni
// proyectos aparte. Los estilos están aislados en landing.module.css —
// no tocan la paleta clara de /dashboard/*.
export default function LandingPage() {
  return (
    <div className={styles.root}>
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          VICTOR<span>.cfo</span>
        </div>
        <div className={styles.navLinks}>
          <a href="#">Inicio</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#victor">VICTOR</a>
          <a href="#precios">Precios</a>
          <a href="#embajadores">Embajadores</a>
          <Link href="/registro" className={styles.navCta}>
            Comienza Gratis
          </Link>
        </div>
      </nav>

      <div className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.badgeDot} />
          Tu CFO Virtual · disponible 24/7
        </div>

        <h1>
          Conecta tu banco.
          <br />
          <em>VICTOR hace el resto.</em>
        </h1>

        <p className={styles.heroSub}>
          El primer CFO virtual personal y para negocios de habla hispana. Organiza tus finanzas, genera
          reportes automáticos, y te guía paso a paso hacia una estructura que realmente funciona.
        </p>

        <div className={styles.heroActions}>
          <a href="#precios" className={styles.btnPrimary}>
            Comienza Gratis
          </a>
          <a href="#como-funciona" className={styles.btnGhost}>
            Ver cómo funciona →
          </a>
        </div>

        <div className={styles.terminal}>
          <div className={styles.termBar}>
            <span className={`${styles.termDot} ${styles.dR}`} />
            <span className={`${styles.termDot} ${styles.dY}`} />
            <span className={`${styles.termDot} ${styles.dG}`} />
            <span className={styles.termTitle}>VICTOR — CFO Virtual</span>
          </div>
          <div className={styles.termBody}>
            <div className={styles.tl}>
              <span className={styles.tm}>VICTOR </span>
              <span className={styles.tt}>›</span> <span className={styles.tw}>Buenos días. Aquí tu resumen de la semana.</span>
            </div>
            <div className={styles.tl}>&nbsp;</div>
            <div className={styles.tl}>
              <span className={styles.tm}>Ingresos </span>
              <span className={styles.tg}> $18,400.00 </span>
              <span className={styles.tm}> ↑ 8% vs semana anterior</span>
            </div>
            <div className={styles.tl}>
              <span className={styles.tm}>Gastos </span>
              <span className={styles.tw}> $5,920.00 </span>
              <span className={styles.tm}> dentro del presupuesto ✓</span>
            </div>
            <div className={styles.tl}>
              <span className={styles.tm}>Excedente </span>
              <span className={styles.tt}> $12,480.00 </span>
              <span className={styles.tm}> disponible para invertir</span>
            </div>
            <div className={styles.tl}>&nbsp;</div>
            <div className={styles.tl}>
              <span className={styles.ty}>⚠ </span>
              <span className={styles.tw}>3 gastos sin categorizar por $840 — ¿los revisamos?</span>
            </div>
            <div className={styles.tl}>&nbsp;</div>
            <div className={styles.tl}>
              <span className={styles.tt}>VICTOR › </span>
              <span className={styles.tw}>Tu excedente lleva 60 días quieto en el banco.</span>
            </div>
            <div className={styles.tl}>
              <span className={styles.tm}> Podría estar trabajando para ti. ¿Te cuento cómo? </span>
              <span className={styles.cursor} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.statsWrap}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statNum}>$8T</div>
            <div className={styles.statLabel}>
              activos digitales
              <br />
              proyectados al 2030
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statNum}>500M+</div>
            <div className={styles.statLabel}>
              inversores
              <br />
              globales hoy
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statNum}>$14.99</div>
            <div className={styles.statLabel}>
              al mes — menos que
              <br />
              un café a la semana
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statNum}>24/7</div>
            <div className={styles.statLabel}>
              VICTOR trabaja
              <br />
              cuando tú no puedes
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section} id="como-funciona">
        <div className={styles.sectionLabel}>// cómo funciona</div>
        <h2 className={styles.sectionTitle}>De cero a organizado en minutos.</h2>
        <p className={styles.sectionSub}>Sin papeles, sin esperar a fin de año. VICTOR trabaja desde el primer día.</p>
        <div className={styles.steps}>
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>01</div>
            <div className={styles.stepIcon}>🏦</div>
            <div className={styles.stepTitle}>Conecta tu banco</div>
            <div className={styles.stepDesc}>
              Vincula tu cuenta en segundos vía Plaid. Seguro, encriptado, sin compartir contraseñas. Compatible con los principales bancos.
            </div>
          </div>
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>02</div>
            <div className={styles.stepIcon}>🤖</div>
            <div className={styles.stepTitle}>VICTOR analiza todo</div>
            <div className={styles.stepDesc}>
              Categoriza tus transacciones, identifica patrones de gasto, y detecta oportunidades de ahorro que estabas perdiendo.
            </div>
          </div>
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>03</div>
            <div className={styles.stepIcon}>📊</div>
            <div className={styles.stepTitle}>Dashboard en tiempo real</div>
            <div className={styles.stepDesc}>
              Ve tus ingresos, gastos y excedente en un solo lugar. Siempre actualizado, accesible desde cualquier dispositivo.
            </div>
          </div>
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>04</div>
            <div className={styles.stepIcon}>📩</div>
            <div className={styles.stepTitle}>Reporte mensual automático</div>
            <div className={styles.stepDesc}>
              Cada mes recibes un resumen ejecutivo completo — listo para tu contable, tus socios, o para tomar mejores decisiones.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section} id="victor" style={{ paddingTop: 0 }}>
        <div className={styles.victorBox}>
          <div className={styles.victorAvatar}>
            <img
              src="/victor-avatar.png"
              alt="VICTOR"
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
            />
          </div>
          <div className={styles.victorName}>VICTOR</div>
          <div className={styles.victorRole}>Tu Director Financiero Personal · Disponible 24/7</div>
          <p className={styles.victorMessage}>
            Hola, soy VICTOR. No soy un chatbot genérico. Soy tu Director Financiero Personal, entrenado para la vida real.
            <br />
            <br />
            Fui creado para personas reales. Ya sea que estés cobrando una nómina, administrando los gastos de la casa, o
            escalando tu propia empresa. Conozco cómo se mueve el dinero aquí, entiendo los dolores de cabeza de los
            impuestos y sé lo que necesitas para estar tranquilo.
            <br />
            <br />
            <strong>Mi trabajo es simple:</strong> Tú sigues con tu vida mientras yo analizo, organizo y monitoreo. Si hay
            un gasto oculto, una oportunidad para pagar menos impuestos, o una factura a punto de vencer, yo te aviso. Deja
            de adivinar cómo están tus finanzas y empieza a verlas crecer con estrategia. No esperes a fin de mes — o a la
            temporada de planillas — para descubrir a dónde se fue tu dinero. Encuentro lo que tú no ves — y generalmente
            me pago solo.
          </p>
          <div className={styles.victorGrid}>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>📊</div>
              <div className={styles.victorFeatureTitle}>Monitoreo en tiempo real</div>
              <div className={styles.victorFeatureDesc}>Reviso tus transacciones diariamente y te alerto si algo no cuadra.</div>
            </div>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>💡</div>
              <div className={styles.victorFeatureTitle}>Recomendaciones inteligentes</div>
              <div className={styles.victorFeatureDesc}>Detecto cuándo es el momento de optimizar tu estructura, invertir, o reducir gastos.</div>
            </div>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>📅</div>
              <div className={styles.victorFeatureTitle}>Alertas de vencimientos</div>
              <div className={styles.victorFeatureDesc}>Licencias, contratos, fechas fiscales — te aviso con 90, 30 y 7 días de anticipación.</div>
            </div>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>📩</div>
              <div className={styles.victorFeatureTitle}>Reporte mensual automático</div>
              <div className={styles.victorFeatureDesc}>Cada fin de mes recibes un resumen ejecutivo completo sin hacer nada.</div>
            </div>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>🔒</div>
              <div className={styles.victorFeatureTitle}>Bóveda de documentos</div>
              <div className={styles.victorFeatureDesc}>Sube cualquier documento — yo lo leo, categorizo y recuerdo por ti.</div>
            </div>
            <div className={styles.victorFeature}>
              <div className={styles.victorFeatureIcon}>🤝</div>
              <div className={styles.victorFeatureTitle}>Guía paso a paso</div>
              <div className={styles.victorFeatureDesc}>Te recomiendo cada servicio cuando tu negocio lo necesita. Nunca antes, nunca después.</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section} id="precios" style={{ paddingTop: 0 }}>
        <div className={styles.sectionLabel}>// precios</div>
        <h2 className={styles.sectionTitle}>Empieza simple. Crece cuando estés listo.</h2>
        <p className={styles.sectionSub}>Sin contratos, sin sorpresas. Cancela cuando quieras — aunque sabemos que no querrás.</p>

        <LandingPricing />

        <div style={{ marginTop: "3rem" }}>
          <div className={styles.sectionLabel}>// add-ons · VICTOR te avisa cuándo activarlos</div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0.5rem 0 0.4rem" }}>Add-ons</h3>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
            Actívalos cuando tu negocio los necesite. VICTOR te guía al momento correcto.
          </p>
          <div className={styles.addonsGrid}>
            <div className={styles.addonCard}>
              <div className={styles.addonIcon}>🙋</div>
              <div>
                <div className={styles.addonName}>Usuario Referido</div>
                <div className={styles.addonDesc}>
                  Gratis · comparte tu link — cada quien tiene su propia cuenta. Tu referido arranca con su primer
                  mes completamente gratis, sea Core o Pro. Y cuando empiece a pagar de verdad, tú te ganas un mes
                  gratis de tu propio plan — sin límite, acumulable con cada persona que refieras.
                </div>
              </div>
            </div>
            <div className={styles.addonCard}>
              <div className={styles.addonIcon}>🧑‍💼</div>
              <div>
                <div className={styles.addonName}>
                  Secretaria
                  <div style={{ fontSize: "0.7rem", color: "var(--teal-mid)", fontWeight: 600, marginTop: "0.2rem" }}>
                    Plan Pro
                  </div>
                </div>
                <div className={styles.addonDesc}>$10/mes · dale acceso a tu asistente para llevar los números</div>
              </div>
            </div>
            <div className={styles.addonCard}>
              <div className={styles.addonIcon}>👔</div>
              <div>
                <div className={styles.addonName}>
                  Administrador
                  <div style={{ fontSize: "0.7rem", color: "var(--teal-mid)", fontWeight: 600, marginTop: "0.2rem" }}>
                    Plan Pro
                  </div>
                </div>
                <div className={styles.addonDesc}>$20/mes · acceso ampliado — Pagos, Metas, Bóveda y Cuentas (solo lectura)</div>
              </div>
            </div>
            <div className={styles.addonCard}>
              <div className={styles.addonIcon}>👥</div>
              <div>
                <div className={styles.addonName}>
                  Equipo/Técnicos
                  <div style={{ fontSize: "0.7rem", color: "var(--teal-mid)", fontWeight: 600, marginTop: "0.2rem" }}>
                    Plan Pro
                  </div>
                </div>
                <div className={styles.addonDesc}>$20/mes · añade a tu equipo con acceso completo</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Programa de Socios (5 sept 2026, pedido de Joel) — a propósito sin
          monto ni método de pago aquí ("debe ser más una relación
          profesional, no me gusta que diga el precio ahí"): el CTA es un
          mailto en vez de un link directo a /socios — quiere que le
          escriban primero y les manda el link él mismo después de hablar
          con cada quien, no un formulario público autoservicio.
          Ampliado 5 sept 2026 (misma tarde): el copy original ("¿Eres CPA,
          contador, o influencer?") sonaba a requisito de identidad y
          dejaba fuera a cualquiera que quisiera promocionar activamente
          sin encajar en esas tres categorías — los Términos del programa
          ya decían "cualquier persona en Puerto Rico", el copy público
          simplemente no lo reflejaba. Ahora es "Embajador o Afiliado":
          abre la puerta a cualquiera, mencionando CPA/contador/influencer
          como ejemplos en vez de como filtro. El programa interno
          (Dashboard, Términos, nombres de tabla/código) sigue llamándose
          "Programa de Socios" — este es solo el gancho público. */}
      <div id="embajadores" className={styles.sociosBanner}>
        <div className={styles.sociosBadge}>// embajadores</div>
        <h3>¿Quieres formar parte de la familia VICTOR CFO?</h3>
        <p>
          Como Embajador o Afiliado, ganas una comisión real por cada cliente que traigas —
          seas CPA, contador, influencer, o simplemente alguien con la red y las ganas de promocionarlo
          activamente. Sin límite: mientras más traigas, más ganas. Escríbenos y hablamos de los detalles.
        </p>
        <a
          href="mailto:dr.jvalentin@gmail.com?subject=Quiero%20ser%20Embajador%2FAfiliado%20de%20VICTOR%20CFO"
          className={styles.sociosBtn}
        >
          Quiero ser Embajador →
        </a>
      </div>

      <div className={styles.ctaFinal}>
        <div className={styles.sectionLabel} style={{ textAlign: "center" }}>
          // la pregunta que importa
        </div>
        <h2>
          ¿Cuánto te está costando <em>no tenerlo</em>?
        </h2>
        <p>Sin compromisos largos. Cancela cuando quieras. Solo conecta tu banco y deja que VICTOR haga el trabajo.</p>
        <Link href="/registro" className={styles.btnPrimary} style={{ fontSize: "1rem", padding: "0.9rem 2.25rem" }}>
          Comienza ahora →
        </Link>
      </div>

      <a href="#" className={styles.backTop} title="Inicio">
        ↑
      </a>

      <footer className={styles.footer}>
        <div className={styles.footerLogo}>VICTOR — Tu CFO Virtual</div>
        <div className={styles.footerSub}>by West Capital Ventures LLC · victorcfo.com</div>
        <div className={styles.footerSub}>Puerto Rico · LATAM · España</div>
        <div className={styles.footerSub} style={{ marginTop: "0.5rem" }}>
          <Link href="/privacidad" style={{ color: "inherit" }}>Política de Privacidad</Link>
          {" · "}
          <Link href="/terminos" style={{ color: "inherit" }}>Términos de Servicio</Link>
        </div>
      </footer>
    </div>
  );
}
