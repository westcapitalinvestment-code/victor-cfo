"use client";

import { useState } from "react";
import styles from "./landing.module.css";
import {
  calcularImpuestoEnRiesgo,
  CALCULADORA_DISCLAIMER,
  CALCULADORA_EXPLICACION,
  TASA_CONTRIBUTIVA_LABEL,
  type TasaContributivaId,
} from "@/lib/calculadora-deduccion";

// Calculadora pública "¿cuánto te ahorrarías?" (3 oct 2026, pedido de Joel:
// quiere dejar claro en la landing que Business "se paga solo" porque
// VICTOR ayuda a no perder deducciones reales). Usa
// lib/calculadora-deduccion.ts como ÚNICA fuente del cálculo — la misma
// función que usa la versión dentro de la demo (app/dashboard/pagos/
// pagos-portal.tsx, tab Reportes) y la misma explicación que conoce VICTOR
// en la burbuja del landing (lib/victor/landing-system-prompt.ts), para que
// los tres lugares digan exactamente lo mismo.
//
// Reenfocado de "riesgo" a "ahorro" (mismo día, Joel: "lo que quiero es
// dejar saber... cuanto se ahorraría en impuestos") — el número es
// idéntico, solo cambia el framing: antes preguntaba "cuánto arriesgas si
// NO reportas", ahora pregunta "cuánto te ahorras SI reportas bien".
//
// A propósito SIN la complejidad de CBA/AUP (ver comentario completo en
// lib/calculadora-deduccion.ts) — Joel, 3 oct 2026: "vamos a dejarlo
// sencillo no complicarnos... lo que no podemos es dar información
// equivocada o errónea aunque no sea la más precisa". Por eso el
// disclaimer de "estimado, consulta a tu contable" es parte fija del
// bloque, no un detalle chiquito.
//
// Campo de monto empieza VACÍO (3 oct 2026, fix: Joel reportó por
// screenshot que salía con $5,000 ya puesto y el resultado ya calculado —
// confunde, parece que la app "inventó" un número). Ahora el visitante
// tiene que escribir su propio monto para ver un resultado.
export default function LandingCalculadoraDeduccion() {
  const [gastoTexto, setGastoTexto] = useState("");
  const [tipoNegocio, setTipoNegocio] = useState<TasaContributivaId>("individuo");

  const gasto = parseFloat(gastoTexto.replace(/,/g, "")) || 0;
  const resultado = calcularImpuestoEnRiesgo(gasto, tipoNegocio);

  return (
    <div id="calculadora" className={styles.calcBanner}>
      <div className={styles.calcBadge}>// calculadora</div>
      <h3>¿Cuánto ahorrarías en impuestos al reportar un gasto adecuadamente?</h3>
      <p className={styles.calcExplicacion}>{CALCULADORA_EXPLICACION}</p>

      <div className={styles.calcGrid}>
        <label className={styles.calcField}>
          <span>Cuánto le pagaste en el año a esa persona o compañía por servicios (si pasa de $500/año)</span>
          <div className={styles.calcInputMoney}>
            <span>$</span>
            <input
              type="text"
              inputMode="decimal"
              value={gastoTexto}
              onChange={(e) => setGastoTexto(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="5,500"
            />
          </div>
        </label>

        <label className={styles.calcField}>
          <span>Tipo de negocio</span>
          <select value={tipoNegocio} onChange={(e) => setTipoNegocio(e.target.value as TasaContributivaId)}>
            {(Object.keys(TASA_CONTRIBUTIVA_LABEL) as TasaContributivaId[]).map((id) => (
              <option key={id} value={id}>
                {TASA_CONTRIBUTIVA_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.calcResultado}>
        <span>Ahorro estimado en impuestos</span>
        <strong>
          {resultado.impuestoEnRiesgo.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </strong>
      </div>

      <p className={styles.calcDisclaimer}>{CALCULADORA_DISCLAIMER}</p>

      <p className={styles.calcPitch}>
        VICTOR CFO te avisa antes de que esto pase — te alerta cuándo un contratista está por cruzar el umbral y
        cuándo falta presentar su 480.6SP, para que ese ahorro no se pierda. Business cuesta $99.99/mes; proteger
        una sola deducción de este tamaño ya lo paga.
      </p>
    </div>
  );
}
