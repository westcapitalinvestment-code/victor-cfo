-- ============================================================================
-- VICTOR CFO — 0219: manual de Trading actualizado (19 nov 2026).
-- Reemplaza el artículo 'trading' (ya no es solo founder; guardián multi-activo,
-- modo simple de riesgo, stop automático) y agrega 'trading-plan' (Core + Trading,
-- precios, activar, subir de plan) y 'trading-problemas' (soporte del guardián).
-- Mismo patrón que 0194: VICTOR y el agente de soporte los leen con el manual.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'trading',
  'Trading — guardián para MT5, reglas de riesgo, bitácora y panel',
  'Módulo Trading: guardián VictorGuard para MetaTrader 5 que calcula el lote, pone el stop y bloquea según las reglas del usuario, en cualquier activo; bitácora automática y panel con % por día, mes y año. Viene en Core + Trading y está incluido en Pro y Business. NO da señales ni asesoría.',
  $md$QUÉ ES: el módulo Trading (ícono de velas en la barra de abajo, antes de Config) organiza y protege el trading del usuario en MetaTrader 5. No da señales, no opera por el usuario y no es asesoría financiera, legal ni fiscal. VICTOR NUNCA recomienda comprar o vender. Hoy VICTOR no tiene herramienta para leer las cifras de trading del usuario: no inventes montos; mándalo a la pantalla Trading.

QUIÉN LO TIENE: plan Core + Trading ($19.99/mes o $179/año), y está incluido en Pro y Business. Aparece en el menú solo si el usuario lo activó en Configuración → Trading (quien entra por victorcfo.com/trading lo tiene activado). Ver artículo trading-plan.

PESTAÑAS: PANEL, BITÁCORA y RIESGO.
- PANEL: tarjetas de rendimiento "Hoy / Este mes / Este año / Total" (% contra el balance con que empezó cada período, y $); resultado, aciertos, ganado/perdido, factor de beneficio, caída máxima, disciplina, trades y peor racha; gráfica "Resultado acumulado" con selector $ / %; gráfica de barras "% de la cuenta por mes" (tocar un mes filtra el panel); calendario mensual (cada día muestra $ y %; verde ganó, rojo perdió). Los % no descuentan depósitos ni retiros (el reporte de MT5 no los trae).
- BITÁCORA: cada trade por día, con duración, SL, TP, reglas rotas, nota y "¿Cumplí mi plan?".
- RIESGO: una sola tarjeta "Mis reglas", "Tus límites de hoy", el resumen "Así te va a cuidar el guardián", Guardar reglas, Descargar para MT5, sincronización y guía de instalación.

MIS REGLAS (modo simple, como una cuenta de fondeo):
- "Cuánto puedo perder al día ($)" y "Cuántas pérdidas aguanto al día": el riesgo por trade = pérdida del día ÷ pérdidas. Ej. $21 y 3 = $7 por trade, en cualquier activo.
- "Máximo de trades al día (ganando o perdiendo)": aparte; si va ganando sigue con el mismo riesgo hasta ese máximo.
- Stop y take profit (automáticos para cada activo): "Mi estilo" (Scalping = velas de 5 min, Intradía = 15 min, Intradía largo = 1 h, Swing = 4 h), "Qué tan amplio el stop" (Ajustado ×1, Normal ×1.5, Amplio ×2.5 el movimiento promedio de una vela, ATR) y "Take profit" (sin TP, 1:1 a 4:1). El stop NO depende del gráfico en que esté el usuario, sino de su estilo.
- Trades abiertos a la vez y Activos prohibidos (se cierran al abrirlos).
- Más reglas (opcional): qué puedo operar (todos o una lista), espera después de una pérdida, piso de la cuenta (si el equity baja de ahí se bloquea todo), qué puedo hacer con el stop (Flexible: solo moverlo a favor, nunca alejarlo ni quitarlo; Estricto; Sin bloqueo), bloquear el día si cierra un trade a mano, y stop fijo avanzado (pips para un solo activo, o % del precio).
- Si deja vacío "Cuánto puedo perder al día", se usa el % de la cuenta guardado.

TUS LÍMITES DE HOY: tres barras — pérdida del día, trades perdedores y trades del día — verde, naranja al acercarse y rojo "bloqueado" al llegar.

EL GUARDIÁN (VictorGuard.mq5): corre en el MT5 del usuario, en UN solo gráfico, y vigila toda la cuenta. Calcula el lote para que si toca el stop pierda su riesgo por trade; pone SL/TP al abrir; bloquea al llegar a sus límites; cierra lo que se abra fuera de las reglas (también lo abierto desde el Trading Panel de MT5) y explica por qué con una alerta "VictorGuard te protegió…". Botones VENDER (izquierda) y COMPRAR (derecha) como en MT5; siguen al símbolo del gráfico.
PANEL EN EL GRÁFICO: línea 1 = estado ("OK | perdedores hoy…" o "BLOQUEADO: …"); línea 2 = "ACTIVO lote X | stop Y | riesgo $Z / $límite": VERDE = el trade cabe en su riesgo; ROJO = ni el lote mínimo cabe (ese activo se mueve demasiado para su cuenta ahora). Abajo a la derecha, cuenta regresiva del cierre de la vela. Si Algo Trading está apagado lo dice en rojo: sin Algo Trading no lo protege.
CON EL TRADING PANEL DE MT5: puede abrir por ahí; el guardián pone stop y TP y aplica las mismas reglas que los botones. El lote lo escribe el usuario: si se pasa de su riesgo, lo cierra (pierde el spread). El lote correcto está en la línea 2 del panel.

SINCRONIZACIÓN Y BITÁCORA: cada 30 segundos el guardián manda los trades cerrados, balance y equity; la página se actualiza sola. "Descargar para MT5" activa la sincronización si no estaba. También se puede subir el Excel de MT5. Las horas son las del servidor del broker. La bitácora marca riesgo alto con el riesgo real que mandó el guardián (vale para acciones y cripto).

DÓNDE FUNCIONA: MetaTrader 5 con cualquier broker; forex, oro, índices, acciones, futuros y cripto; cuentas reales, demo y de fondeo; MT5 en Windows o en un VPS para que corra 24/7. NO funciona en MT4, cTrader ni TradingView todavía.

LÍMITES HONESTOS: si cambia reglas hay que descargar el guardián otra vez, compilarlo y QUITARLO y volver a ponerlo en el gráfico (MT5 conserva las entradas viejas si solo se recompila). No hay backtesting. Deslizamientos y huecos de precio pueden hacer que una pérdida pase el límite. Todo es informativo, no es asesoría financiera.$md$
),
(
  'trading-plan',
  'Plan Core + Trading — precio, qué incluye, cómo activarlo y subir de plan',
  'Core + Trading cuesta $19.99/mes o $179/año con 7 días gratis; es Core con el módulo de Trading. Pro y Business incluyen Trading. Core puede agregarlo por +$5/mes. Se activa en Configuración → Trading.',
  $md$PRECIO: VICTOR Core + Trading = $19.99/mes o $179/año, con 7 días gratis al registrarse. Es todo VICTOR Core (banco conectado, presupuesto, deudas, metas, chat con VICTOR 24/7) más el módulo de Trading. Se vende en victorcfo.com/trading.

PRO Y BUSINESS: incluyen Trading sin costo extra. Al subir de Core + Trading a Pro o Business se cobra solo la diferencia, prorrateada; nunca se paga dos veces por Trading.

CORE SIN TRADING: ve Trading con candado. En Configuración → Trading tiene el botón "Agregar Trading por +$5/mes" (pasa a Core + Trading; hoy se cobra solo la diferencia por los días que quedan del ciclo).

ACTIVAR / ESCONDER: Configuración → Trading → interruptor "Activar". Solo decide si el módulo aparece en el menú; no cambia el precio. Quien entra por la página de trading lo tiene activado desde el inicio.

REGISTRO DESDE /trading: la pantalla de registro muestra solo la tarjeta Core + Trading con la explicación; el enlace "Ver Pro y Business (incluyen Trading)" muestra los demás planes.

SI PREGUNTAN POR NEGOCIO/LLC: si su trading crece, VICTOR Pro o Business lo organizan como negocio (estado de resultados, gastos, reportes para el contable). Si las ganancias son constantes, sugiere hablar con un contable sobre si le conviene una LLC; VICTOR no da asesoría legal ni fiscal.$md$
),
(
  'trading-problemas',
  'Trading — problemas comunes del guardián (no me deja operar, línea roja, Algo Trading, lote)',
  'Soporte del guardián VictorGuard: por qué no deja abrir un trade, qué significa la línea roja o verde, Algo Trading apagado, lote mínimo que no cabe, reglas que no se actualizan, sincronización.',
  $md$"NO ME DEJA OPERAR / SALE UNA ALERTA": la alerta empieza con "VictorGuard te protegió:" y dice la razón. Las comunes: (1) ya perdió su máximo de trades perdedores o llegó a su pérdida del día → bloqueado hasta mañana; (2) "te quedan $X para perder hoy y este trade arriesgaría $Y" → no cabe en lo que queda del día, espere a que cierre un trade abierto o vuelva mañana; (3) ya hizo sus trades del día; (4) está en la espera después de una pérdida; (5) el activo está prohibido o fuera de su lista; (6) ya tiene el máximo de trades abiertos; (7) "el lote más pequeño arriesgaría $X y tu límite es $Y" → ese activo se mueve demasiado para su cuenta ahora. Explícalo como protección, no como falla.

LÍNEA ROJA EN EL PANEL: ni el lote mínimo (ej. 0.01) cabe en su riesgo por trade con el stop de ese activo. Opciones: stop "Ajustado" o estilo más corto (Scalping), otro activo, otro símbolo con contrato más pequeño (ej. NAS100 o USTECH en vez de NAS100.fs) o subir su riesgo por trade. VERDE = cabe. El estado (bloqueado o no) está en la línea de arriba.

ALGO TRADING APAGADO: el panel lo dice en rojo. Sin Algo Trading el guardián no puede poner stops, cerrar ni bloquear. Activar el botón Algo Trading de la barra de MT5 (verde) y, en el guardián, pestaña Común → Permitir Algo Trading. Para que no se apague solo: Herramientas → Opciones → Asesores Expertos → desmarcar "deshabilitar el trading algorítmico al cambiar de cuenta / de perfil".

CAMBIÉ MIS REGLAS Y EL GUARDIÁN SIGUE IGUAL: Guardar reglas → Descargar para MT5 → reemplazar el archivo en MQL5\Experts → compilar con F7 → QUITAR el guardián del gráfico y volver a ponerlo (si solo recompila, MT5 conserva los valores viejos de la pestaña Entradas). En Entradas debe ver, por ejemplo, RiskMoney = 7.

EL LOTE ES MUY CHICO O MUY GRANDE: el lote depende de la distancia del stop. Stop más lejos = lote más pequeño, para que el riesgo en $ sea el mismo. Si el stop le parece muy ajustado o muy amplio, cambie "Qué tan amplio el stop" o "Mi estilo".

ABRÍ CON EL TRADING PANEL Y ME LO CERRÓ: el guardián aplica las mismas reglas que sus botones; la alerta "VictorGuard cerró tu trade de … para protegerte" dice por qué (lote muy grande, no cabía en lo que quedaba del día, estaba bloqueado, etc.).

NO LLEGAN LOS TRADES / SYNC: en MT5, Herramientas → Opciones → Asesores Expertos → "Permitir WebRequest" y agregar EXACTAMENTE https://www.victorcfo.com. En el gráfico debe decir "Sync OK". Si generó un token nuevo, debe descargar el guardián otra vez.

PUEDE PONERLO EN VARIOS GRÁFICOS: no; uno solo vigila toda la cuenta. Cambiar el símbolo de ese gráfico cambia el activo de los botones.

SI NADA DE ESTO RESUELVE: que escriba a soporte@victorcfo.com con una foto del panel del guardián y de la alerta.$md$
)
ON CONFLICT (slug) DO UPDATE
SET titulo = EXCLUDED.titulo,
    resumen = EXCLUDED.resumen,
    contenido = EXCLUDED.contenido;
