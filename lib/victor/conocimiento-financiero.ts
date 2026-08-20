// Biblioteca de conceptos financieros (15) y principios de los 3 libros que
// VICTOR aplica en conversación — vivía dentro del system prompt (Capa 9 y la
// sección de Referencias en Capa 10, ~13,000 caracteres enviados en CADA
// llamada al API) y se movió aquí para consulta bajo demanda con la tool
// consultar_conocimiento_financiero. El texto es idéntico al que vivía en
// system-prompt.txt, palabra por palabra, solo se movió de lugar.

export type Conocimiento = { clave: string; titulo: string; texto: string };

export const CONCEPTOS_FINANCIEROS: Conocimiento[] = [
  {
    clave: "concepto_1",
    titulo: `PRESUPUESTO`,
    texto: `1. PRESUPUESTO
   Regla 50/30/20: 50% necesidades, 30% deseos, 20% ahorro/deuda.
   VICTOR adapta la regla a la realidad del usuario — no todos pueden
   ahorrar 20% desde el día uno. Empieza con lo posible.
   Cuando detecta gastos: "Tu distribución este mes fue 65/28/7.
   ¿Quieres ver cómo llegaríamos al 50/30/20?"`,
  },
  {
    clave: "concepto_2",
    titulo: `TARJETAS DE CRÉDITO`,
    texto: `2. TARJETAS DE CRÉDITO
   - Ciclo de facturación: los cargos del mes se acumulan hasta la
     fecha de corte → se genera el estado → tienes hasta la fecha
     de pago para pagar sin intereses.
   - APR (Annual Percentage Rate): la tasa anual dividida entre 12
     es lo que pagas de interés mensual sobre el balance que no pagas.
   - Ejemplo real: "Tu Citi tiene APR 24.99%. Si dejas $1,000 de
     balance sin pagar, pagas $20.83 en intereses ese mes — sin
     comprar nada extra."
   - Fecha de corte vs fecha de pago: son diferentes. Pagar antes
     de la fecha de corte baja tu utilización de crédito → mejora
     tu credit score.`,
  },
  {
    clave: "concepto_3",
    titulo: `INTERÉS SIMPLE VS COMPUESTO`,
    texto: `3. INTERÉS SIMPLE VS COMPUESTO
   - Simple: pagas interés solo sobre el principal.
   - Compuesto: pagas interés sobre el principal + los intereses
     acumulados. Las deudas crecen así. Los ahorros también.
   - "Tu tarjeta usa interés compuesto diario. Cada día que no
     pagas, el balance crece un poco más. Así es como $1,000 se
     convierten en $1,280 en un año sin hacer nada."`,
  },
  {
    clave: "concepto_4",
    titulo: `CÓMO LEER UN ESTADO DE CUENTA BANCARIO`,
    texto: `4. CÓMO LEER UN ESTADO DE CUENTA BANCARIO
   - Balance disponible vs balance actual: el disponible ya descuenta
     cargos pendientes. El actual no.
   - Cargos pendientes: transacciones autorizadas pero no procesadas.
   - VICTOR explica cada sección cuando el usuario conecta su banco
     por primera vez.`,
  },
  {
    clave: "concepto_5",
    titulo: `INFLACIÓN`,
    texto: `5. INFLACIÓN
   - Qué es: el dinero pierde poder adquisitivo con el tiempo.
   - Cómo afecta hoy: "Si guardas $10,000 bajo el colchón por 10
     años con inflación de 3%, tu poder de compra es de ~$7,400.
     El dinero que no trabaja, pierde."
   - CPI (Consumer Price Index): el índice que mide la inflación.
     VICTOR lo menciona cuando hay noticias relevantes.

═══════════════════════
CONCEPTOS INTERMEDIOS
═══════════════════════`,
  },
  {
    clave: "concepto_6",
    titulo: `AMORTIZACIÓN DE HIPOTECA`,
    texto: `6. AMORTIZACIÓN DE HIPOTECA
   - Por qué pagas más interés al principio: el banco calcula el
     interés sobre el balance pendiente — que es mayor al inicio.
   - "En tu hipoteca de $250,000 al 6.5%, tu primer pago de
     $1,580 incluye ~$1,354 de interés y solo $226 de principal.
     En 10 años eso se invierte."
   - VICTOR puede mostrar la tabla de amortización simplificada
     y calcular cuánto ahorras pagando $100 extra al mes.`,
  },
  {
    clave: "concepto_7",
    titulo: `DEPRECIACIÓN`,
    texto: `7. DEPRECIACIÓN
   - Los activos pierden valor con el tiempo — vehículos, equipos,
     tecnología.
   - "Tu carro de $35,000 vale aproximadamente $28,000 hoy — perdió
     20% en el primer año. Eso es depreciación. Por eso el leasing
     a veces tiene más sentido que comprar."
   - En negocio: la depreciación es deducible de impuestos.`,
  },
  {
    clave: "concepto_8",
    titulo: `BALANCE SHEET PERSONAL`,
    texto: `8. BALANCE SHEET PERSONAL
   - Activos: lo que tienes (banco, inversiones, propiedad, carro).
   - Pasivos: lo que debes (hipoteca, tarjetas, préstamos).
   - Patrimonio neto = Activos - Pasivos.
   - "Tu patrimonio neto hoy es $X. El objetivo de VICTOR es que
     ese número suba cada mes."
   - VICTOR construye el balance sheet del usuario automáticamente
     con los datos de sus cuentas conectadas.`,
  },
  {
    clave: "concepto_9",
    titulo: `ESTADO DE RESULTADOS PERSONAL`,
    texto: `9. ESTADO DE RESULTADOS PERSONAL
   - Ingresos - Gastos = Flujo neto del mes.
   - Si el flujo es positivo → hay dinero para ahorrar o invertir.
   - Si es negativo → hay que ajustar gastos o aumentar ingresos.
   - "Tu estado de resultados de mayo: ingresos $4,200, gastos
     $3,980, flujo neto $220. Ese es tu margen de ganancia personal."`,
  },
  {
    clave: "concepto_10",
    titulo: `FLUJO DE CAJA`,
    texto: `10. FLUJO DE CAJA
    - Por qué puedes ganar bien y quedarte sin dinero: el timing.
    - Los gastos llegan antes que los ingresos.
    - "Tienes $8,000 de ingresos este mes pero $5,200 vencen en los
      primeros 10 días y cobras el día 15. Ese gap de liquidez es
      tu riesgo real."

═══════════════════════
CONCEPTOS DE CRECIMIENTO
═══════════════════════`,
  },
  {
    clave: "concepto_11",
    titulo: `INTERÉS COMPUESTO A LARGO PLAZO`,
    texto: `11. INTERÉS COMPUESTO A LARGO PLAZO
    - "El octavo maravilla del mundo" — Einstein (atribuido).
    - Ejemplo real: "$200/mes a 7% de retorno anual:
      10 años = $34,600 | 20 años = $104,000 | 30 años = $243,000"
    - VICTOR muestra esta proyección cuando el usuario empieza a
      ahorrar o pregunta sobre retiro.`,
  },
  {
    clave: "concepto_12",
    titulo: `ÍNDICES ECONÓMICOS EN LENGUAJE SIMPLE`,
    texto: `12. ÍNDICES ECONÓMICOS EN LENGUAJE SIMPLE
    - CPI: mide la inflación. Si sube, tu dinero compra menos.
    - Fed Funds Rate: la tasa base de la Fed. Si sube, todo se
      encarece — hipotecas, tarjetas, préstamos.
    - GDP: producción total del país. Si baja, hay recesión.
    - VICTOR conecta las noticias económicas con el impacto real
      en las finanzas del usuario.`,
  },
  {
    clave: "concepto_13",
    titulo: `VALOR DEL DINERO EN EL TIEMPO`,
    texto: `13. VALOR DEL DINERO EN EL TIEMPO
    - $1 hoy vale más que $1 mañana porque hoy lo puedes invertir.
    - "Ese dinero que tienes sin trabajar en la cuenta corriente
      está perdiendo valor cada día. ¿Quieres ver opciones?"`,
  },
  {
    clave: "concepto_14",
    titulo: `CREDIT SCORE — CÓMO FUNCIONA`,
    texto: `14. CREDIT SCORE — CÓMO FUNCIONA
    - 5 factores: historial de pagos (35%), utilización (30%),
      antigüedad (15%), tipos de crédito (10%), consultas (10%).
    - "Pagas a tiempo pero tu utilización es 78%. Eso solo ya baja
      tu score. Si la bajas a 30%, verás mejora en 30-60 días."
    - VICTOR monitorea los patrones que afectan el score.`,
  },
  {
    clave: "concepto_15",
    titulo: `LEER UN BALANCE SHEET DE NEGOCIO`,
    texto: `15. LEER UN BALANCE SHEET DE NEGOCIO
    - Activos corrientes: efectivo, cuentas por cobrar — lo líquido.
    - Activos fijos: equipo, propiedad — lo que no se vende fácil.
    - Pasivos corrientes: deudas que vencen en menos de un año.
    - Pasivos a largo plazo: hipotecas, préstamos de equipo.
    - Capital: lo que le quedaría al dueño si pagara todo.
    - VICTOR genera este reporte mensualmente para usuarios Pro/Pro+.`,
  },
];

export const BIBLIOTECA_VICTOR: Conocimiento[] = [
  {
    clave: "pagate_primero",
    titulo: `Págate Primero — El Hombre Más Rico de Babilonia (Clason) + David Bach + Robert Kiyosaki`,
    texto: `PÁGATE PRIMERO
El Hombre Más Rico de Babilonia (Clason) + David Bach + Robert Kiyosaki

Principios que VICTOR aplica:
1. Separa 10-20% de cada ingreso ANTES de pagar cualquier gasto.
2. Automatiza la transferencia el mismo día que cobras — sin willpower.
3. Vive con el resto. Ajusta el estilo de vida al dinero disponible
   después del ahorro, no antes.
4. No toques ese dinero — es para construir patrimonio, no gastos.
5. Invierte según perfil de riesgo — no lo dejes perder valor por inflación.
6. Aumenta el porcentaje cada vez que sube el ingreso.
7. Evita deudas de consumo — destruyen la capacidad de acumular.
8. Fondo de emergencia primero: 3-6 meses de gastos esenciales,
   antes de cualquier inversión más riesgosa.
9. Constancia — poco todos los meses supera mucho de vez en cuando.
10. Deja que el interés compuesto trabaje — reinvertir acelera el crecimiento.

Fórmula: Ingresos → Ahorro/Inversión → Gastos (no al revés)
Frase clave: "No ahorres lo que queda después de gastar;
              gasta lo que queda después de ahorrar."

Cómo lo usa VICTOR:
"Tu fórmula ahora mismo es ingresos → gastos → lo que queda al ahorro.
 El problema es que casi nunca queda nada. ¿Qué pasaría si lo invertimos?
 Antes de que salga cualquier gasto este quince, $X van directo al ahorro.
 Vives con el resto. ¿Lo intentamos este mes?"

──────────────────────────────────────
NIVEL PRO — Para quien ya tiene hábitos y quiere entender su comportamiento
──────────────────────────────────────`,
  },
  {
    clave: "psicologia_dinero",
    titulo: `La Psicología del Dinero — Morgan Housel`,
    texto: `LA PSICOLOGÍA DEL DINERO — Morgan Housel
20 lecciones sobre comportamiento vs inteligencia financiera

Principios que VICTOR aplica:
1.  Nadie está loco — cada persona decide desde sus experiencias de vida.
2.  Suerte y riesgo siempre presentes — no todo es mérito ni error.
3.  Saber cuándo detenerse es una habilidad financiera clave.
4.  El interés compuesto necesita tiempo — paciencia > inversión perfecta.
5.  Hacerse rico ≠ mantenerse rico. Ganar exige riesgo; conservar exige prudencia.
6.  Ahorra sin objetivo específico — las reservas dan libertad ante lo imprevisto.
7.  Flexibilidad > precisión — el dinero compra tiempo y opciones.
8.  Controla el ego — cuanto menos necesites impresionar, más fácil acumulas.
9.  La riqueza es lo que no se ve — inversiones > carros de lujo financiados.
10. Vive por debajo de tus posibilidades — el margen crea seguridad.
11. Siempre deja un margen de seguridad — la vida es impredecible.
12. Estrategia suficientemente buena mantenida décadas > optimización constante.
13. El tiempo es el activo más valioso — empieza hoy.
14. No compares con otros — cada persona tiene su contexto y sus metas.
15. La independencia es el mayor dividendo — libertad para decidir cómo vivir.
16. Acepta la incertidumbre — ningún plan elimina el riesgo completamente.
17. Las narrativas convincentes no son datos — no decidas solo porque suena bien.
18. Consistencia > brillantez — disciplina diaria gana a largo plazo.
19. Optimismo realista — habrá crisis, pero los mercados tienden a crecer.
20. Define qué significa "suficiente" — riqueza alineada con tus valores.

5 reglas esenciales: ahorra constantemente · invierte largo plazo ·
vive bajo tus posibilidades · controla emociones sobre el mercado ·
usa el dinero para comprar libertad, no cosas.

Frase clave: "La riqueza no consiste en cuánto ganas, sino en cuánto
              conservas, cuánto haces crecer y cuánto tiempo puedes mantenerlo."

Cómo lo usa VICTOR:
Cuando el usuario llega emocionado con una inversión:
"¿Estás tomando esta decisión desde la claridad o desde la narrativa?
 Housel lo dice claro: las mejores historias venden más que los datos.
 ¿Qué dicen los números reales?"
Cuando el usuario se compara con otros:
"Ese juego no tiene fin. ¿Qué significa suficiente para TI?"

──────────────────────────────────────
NIVEL PRO+ — Para quien ya invierte o quiere hacerlo en serio
──────────────────────────────────────`,
  },
  {
    clave: "inversor_inteligente",
    titulo: `El Inversor Inteligente — Benjamin Graham`,
    texto: `EL INVERSOR INTELIGENTE — Benjamin Graham
El libro que inspiró a Warren Buffett

Principios que VICTOR aplica:
1.  Invierte, no especules — análisis sólido + protección capital + rendimiento adecuado.
2.  Margen de seguridad — compra bajo valor intrínseco. Es el principio central.
3.  Controla tus emociones — el mayor enemigo del inversor es él mismo.
4.  Aprovecha a Mr. Market — emocional e irracional. Úsalo a tu favor.
5.  Visión largo plazo — la riqueza se construye en años, no semanas.
6.  Conoce lo que compras — ingresos, ganancias, deuda, flujo, ventaja competitiva.
7.  Diversifica — no todo en una sola empresa o activo.
8.  Asignación adecuada — acciones + bonos según perfil del inversor.
9.  No persigas modas — las oportunidades aparecen donde nadie mira.
10. Disciplina > inteligencia — método consistente > predecir el mercado.
11. Protege primero el capital — antes de pensar en ganar, piensa en perder.
12. Sé paciente — las oportunidades extraordinarias aparecen pocas veces.

Frase clave: "Compra negocios de calidad a un precio inferior a su valor real,
              mantén la disciplina emocional y deja que el tiempo trabaje a tu favor."

Cómo lo usa VICTOR:
"Antes de entrar: ¿inversión o apuesta? Graham dice que una inversión
 debe proteger tu capital y ofrecer rendimiento basado en análisis.
 ¿Tienes los números?"
Cuando el usuario quiere vender por miedo:
"Mr. Market está en pánico hoy. ¿Cambió el valor del negocio o solo el precio?"

──────────────────────────────────────`,
  },
];

const TODO_EL_CONOCIMIENTO = [...CONCEPTOS_FINANCIEROS, ...BIBLIOTECA_VICTOR];

// Busca por texto parecido al título/tema — tolerante a que VICTOR mande
// 'inflación', 'INFLACIÓN', 'housel', 'la psicología del dinero', etc.
export function buscarConocimiento(tema: string): Conocimiento | Conocimiento[] | null {
  const q = tema.trim().toLowerCase();
  const coincidencias = TODO_EL_CONOCIMIENTO.filter((c) => c.titulo.toLowerCase().includes(q) || q.includes(c.titulo.toLowerCase()));
  if (coincidencias.length === 1) return coincidencias[0];
  if (coincidencias.length > 1) return coincidencias;
  return null;
}
