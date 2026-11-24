-- ============================================================================
-- VICTOR CFO — 0232: manual de trading básico (24 nov 2026, pedido de Joel)
-- Educación general para que VICTOR explique lo básico de operar en MT5
-- (lotes, pip, cálculo de lote, spread/comisión/swap, apalancamiento y margen,
-- tipos de órdenes) y lo particular de Axi. Lo leen VICTOR (consultar_manual) y
-- el agente de soporte. Es educativo: VICTOR no da señales ni asesoría.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'trading-basico-lotes',
  'Trading básico — qué es un lote, pip y punto, y cómo se calcula el lote (tamaño de posición) por riesgo',
  'Lote estándar, mini y micro; qué es un pip y un punto; cuánto vale cada pip por lote; fórmula para calcular el lote según cuánto quieres arriesgar y dónde va tu stop, con ejemplos en forex y oro.',
  $md$EDUCATIVO, NO ES ASESORÍA. Los valores exactos dependen del broker y del símbolo: siempre se confirman en MT5 con clic derecho en el símbolo (Observación del mercado) → Especificación (tamaño del contrato, valor del tick, volumen mínimo).

QUÉ ES UN LOTE: es el tamaño de la operación.
- En forex: 1.00 lote (estándar) = 100,000 unidades de la moneda base; 0.10 (mini) = 10,000; 0.01 (micro) = 1,000. El mínimo normal es 0.01.
- En oro (XAUUSD): en la mayoría de brokers 1.00 lote = 100 onzas. Entonces cada $1 que se mueve el oro = $100 por lote, $10 con 0.10 y $1 con 0.01.
- En índices, cripto y acciones el tamaño del contrato cambia por broker: mirar Especificación.

PIP Y PUNTO:
- En la mayoría de pares el pip es el 4.º decimal (0.0001). En pares con yen (USDJPY) es el 2.º decimal (0.01). MT5 muestra un decimal más: ese último dígito es el "punto" (1 pip = 10 puntos).
- Valor del pip en pares que terminan en USD (EURUSD, GBPUSD): unos $10 por pip con 1 lote, $1 con 0.10 y $0.10 con 0.01. En otros pares cambia un poco según el precio.

CÓMO CALCULAR EL LOTE (la regla de oro): primero decides cuánto dinero aceptas perder si toca el stop; el lote sale de ahí, no al revés.
  Lote = Riesgo en $ ÷ (Distancia del stop × Valor de esa distancia con 1 lote)
- Ejemplo EURUSD: riesgo $50, stop a 25 pips. 25 pips × $10 = $250 por lote → 50 ÷ 250 = 0.20 lotes.
- Ejemplo oro: riesgo $7, stop a $1.15 del precio. $1.15 × $100 = $115 por lote → 7 ÷ 115 = 0.06 lotes (se redondea hacia abajo para no pasarse).
- Si el lote sale menor que el mínimo (0.01), el stop está muy lejos para ese riesgo: o se acerca el stop o no se toma el trade.
- Muchos traders arriesgan entre 0.5% y 2% de la cuenta por trade; lo importante es que el número sea uno que puedas perder varias veces seguidas sin romper tu plan.

EN VICTOR: el guardián VictorGuard hace este cálculo solo con el riesgo por trade de tus reglas y lo muestra en el panel (lote | stop | riesgo $X / $Y).$md$
),
(
  'trading-basico-spread-costos',
  'Trading básico — qué es el spread, la comisión y el swap (costos de operar)',
  'Bid, Ask y spread; por qué entras en negativo; cuándo se abre el spread; comisión por lote; swap o financiamiento nocturno y el swap triple.',
  $md$EDUCATIVO, NO ES ASESORÍA.

BID, ASK Y SPREAD:
- Bid = precio al que vendes. Ask = precio al que compras. El spread es la diferencia entre los dos y es el costo principal de muchas cuentas.
- Por eso todo trade empieza un poco en negativo: compras en el Ask y, para cerrar, vendes en el Bid.
- Una compra se cierra en el Bid y una venta en el Ask. El stop de una venta lo toca el Ask, así que un spread muy abierto puede sacarte aunque el gráfico (que muestra el Bid) no llegue a tu stop.
- El spread se abre en noticias fuertes, al abrir el mercado el domingo y en el cambio de día del servidor (alrededor de las 5:00 pm de Nueva York). Por eso muchas reglas evitan operar en esos momentos.
- Ejemplo: EURUSD con 1 pip de spread y 1 lote cuesta unos $10 solo por entrar.

COMISIÓN: algunas cuentas (tipo "Raw", "Pro" o "ECN") tienen spread muy bajo pero cobran una comisión fija por lote, normalmente ida y vuelta (una parte al abrir y otra al cerrar). Otras (tipo "Standard") no cobran comisión, pero el spread es más ancho. Para comparar: costo total = spread en $ + comisión.

SWAP (financiamiento nocturno): si dejas un trade abierto después del cambio de día del servidor, el broker cobra (o a veces paga) un swap según el activo y la dirección. En MT5 se ve en Especificación y en la columna Swap. En muchos brokers el miércoles se cobra triple (por el fin de semana). Para trades de un mismo día no aplica.

EN VICTOR: la bitácora registra la ganancia o pérdida neta de cada trade que llega de MT5, que ya incluye lo que el broker cobró.$md$
),
(
  'trading-basico-apalancamiento-margen',
  'Trading básico — qué es el apalancamiento (leverage), el margen, margin call y stop out',
  'Cómo funciona el apalancamiento (1:30, 1:100, 1:500), cuánto margen se bloquea, nivel de margen, margin call y stop out, y por qué más apalancamiento no es más ganancia sino más riesgo si subes el lote.',
  $md$EDUCATIVO, NO ES ASESORÍA.

APALANCAMIENTO (LEVERAGE): permite abrir una posición más grande que tu dinero. Con 1:100, por cada $1 de tu cuenta puedes controlar $100 de posición.
- Lo que el apalancamiento cambia es cuánto dinero se BLOQUEA como garantía (margen), no cuánto ganas o pierdes por pip. Eso lo decide el LOTE.
- El peligro: con mucho apalancamiento es fácil abrir lotes demasiado grandes para la cuenta. Un 1:500 con un lote correcto no es más riesgoso que un 1:30 con el mismo lote; el riesgo viene de subir el lote porque "se puede".
- El apalancamiento máximo depende del país, del regulador del broker y del activo (forex mayor suele permitir más que oro, índices o cripto).

MARGEN: el dinero que el broker aparta mientras el trade está abierto.
  Margen ≈ (tamaño de la posición en $) ÷ apalancamiento
- Ejemplo: 1 lote de EURUSD a 1.10 = 100,000 € ≈ $110,000. Con 1:100 se bloquean unos $1,100; con 1:500, unos $220.
- En MT5, pestaña Operaciones: Balance (dinero sin contar trades abiertos), Equidad o Equity (balance + ganancia/pérdida flotante), Margen (bloqueado), Margen libre (lo que queda) y Nivel de margen = Equidad ÷ Margen × 100.

MARGIN CALL Y STOP OUT: si las pérdidas flotantes bajan tu nivel de margen hasta cierto porcentaje, el broker avisa (margin call) y, si sigue bajando, empieza a cerrar tus trades solo, el más perdedor primero (stop out). Cada broker fija sus propios porcentajes: revisarlos en su página o en la cuenta.

REGLA PRÁCTICA: el lote se calcula por el riesgo hasta el stop (ver "Trading básico — lote"), nunca por cuánto margen libre queda. Si usas el lote correcto, casi nunca deberías acercarte a un margin call.

EN VICTOR: el guardián limita el lote al riesgo de tus reglas, así el apalancamiento alto no se convierte en un lote alto.$md$
),
(
  'trading-basico-ordenes-mt5',
  'Trading básico — tipos de órdenes en MT5 (mercado, limit, stop), stop loss, take profit y cómo se usa MT5',
  'Orden a mercado, Buy/Sell Limit, Buy/Sell Stop, stop loss, take profit, trailing stop, operar con un clic, y las ventanas principales de MetaTrader 5 (Observación del mercado, Caja de herramientas, historial).',
  $md$EDUCATIVO, NO ES ASESORÍA.

TIPOS DE ÓRDENES:
- A mercado (Comprar/Vender): entra ya, al precio actual (compra en el Ask, vende en el Bid). Puede haber deslizamiento (slippage) en noticias.
- Buy Limit: comprar MÁS ABAJO del precio actual (esperas un retroceso). Sell Limit: vender MÁS ARRIBA.
- Buy Stop: comprar MÁS ARRIBA del precio actual (entrar en una ruptura). Sell Stop: vender MÁS ABAJO.
- Stop loss (SL): cierra el trade con una pérdida que tú decidiste. Take profit (TP): lo cierra en tu objetivo de ganancia.
- Trailing stop: el stop sigue al precio a una distancia fija cuando va a tu favor (en MT5 solo funciona con la plataforma abierta).
- Riesgo/beneficio (R:R): cuánto puedes ganar contra cuánto arriesgas. Con 1:2, ganar 1 de cada 3 trades ya cubre las 2 pérdidas.

MT5 EN 1 MINUTO:
- Observación del mercado (Ctrl+M): lista de símbolos con Bid/Ask. Clic derecho → Mostrar todos / Especificación.
- Abrir un gráfico: arrastrar el símbolo al área de gráficos. Temporalidad (M1, M5, M15, H1, D1) en la barra de arriba.
- Operar: F9 (Nueva orden) o activar "Trading con un clic" (Alt+T en el gráfico) para los botones VENDER / COMPRAR.
- Caja de herramientas (Ctrl+T): Operaciones (trades abiertos, balance, margen), Historial (trades cerrados), Diario y Expertos (mensajes de los asesores como VictorGuard).
- Modificar SL/TP: doble clic en el trade en Operaciones, o arrastrar las líneas en el gráfico.
- Cuenta demo: Archivo → Abrir una cuenta → demo del broker. Es dinero ficticio y sirve para practicar sin riesgo.

EN VICTOR: con el guardián en el gráfico, usa sus botones VENDER / COMPRAR para que el lote y el stop salgan calculados con tus reglas.$md$
),
(
  'trading-axi',
  'Trading — Axi con MetaTrader 5: tipos de cuenta (Standard y Pro), costos, cuenta demo y cómo ver la especificación de un símbolo',
  'Lo básico de operar con Axi en MT5: cuenta Standard (sin comisión, spread más ancho) vs Pro (spread desde 0.0 más comisión por lote), cuenta demo, apalancamiento según el país, y dónde ver tamaño de contrato y valor del tick.',
  $md$EDUCATIVO, NO ES ASESORÍA. VICTOR tiene relación de afiliado con Axi (cuando aplique, dilo con transparencia); Axi es una opción, nunca un requisito: el guardián funciona con cualquier broker de MT5. Precios y condiciones cambian: confirmar siempre en axi.com o en la cuenta.

QUIÉN PUEDE ABRIR: Axi acepta clientes de Puerto Rico, Latinoamérica y España, pero NO residentes de Estados Unidos continental.

TIPOS DE CUENTA (lo general):
- Standard: no cobra comisión; el costo va dentro del spread, que es más ancho.
- Pro: spread desde 0.0 pips en pares principales más una comisión fija por lote ida y vuelta (según la entidad de Axi con la que abras, del orden de $4.50 a $7 por lote estándar). Suele salir más barata si operas seguido o con lotes grandes.
- En algunas cuentas los símbolos llevan un sufijo (por ejemplo .pro); el guardián funciona igual.
- Se puede cambiar de tipo de cuenta o abrir una subcuenta, normalmente sin trades abiertos.

APALANCAMIENTO: depende del país, de la entidad regulada de Axi y del activo. Se ve al abrir la cuenta y en el portal de Axi. Ver "Trading básico — apalancamiento y margen".

CUENTA DEMO: Axi da cuentas demo de MT5 para practicar. Recomendado para probar el guardián y tus reglas antes de usar dinero real (en demo VICTOR no aplica bloqueos de horario ni de noticias).

VER LOS DATOS EXACTOS DE UN SÍMBOLO (antes de calcular lotes): en MT5, Observación del mercado → clic derecho en el símbolo (ej. XAUUSD) → Especificación: tamaño del contrato, valor del tick, volumen mínimo y máximo, swap y horario de sesión.

CONECTAR CON VICTOR: igual que con cualquier broker. Ver el artículo "Trading — cómo instalar el guardián VictorGuard".$md$
)
ON CONFLICT (slug) DO UPDATE
SET titulo = EXCLUDED.titulo,
    resumen = EXCLUDED.resumen,
    contenido = EXCLUDED.contenido;
