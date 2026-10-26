-- ============================================================================
-- VICTOR CFO — 0194: manual de usuario — módulo Trading (26 oct 2026, pedido
-- de Joel: "enséñale el módulo de Trading a Victor para que lo conozca").
--
-- Mismo patrón que 0168: un artículo en manual_articulos que VICTOR lee con
-- consultar_manual. No toca schema. Idempotente (reemplaza el artículo).
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'trading',
  'Trading — organizador de tu negocio de trading (bitácora MT5, panel, reglas de riesgo y guardián)',
  'Módulo Trading (en prueba, solo founder por ahora): organiza las operaciones del usuario desde MetaTrader 5, muestra un panel con calendario y resultado acumulado, mide si cumple SUS PROPIAS reglas de riesgo y le deja bajar un guardián (VictorGuard.mq5) para MT5. NO da señales, recomendaciones ni asesoría financiera.',
  $md$QUÉ ES: el módulo "Trading" (ícono de velas, en la barra de abajo antes de Config; hoy solo lo ve el founder mientras se valida con traders reales) es un ORGANIZADOR de un negocio de trading, no un servicio de señales. Registra las operaciones del usuario, las muestra en un panel y mide si cumple las reglas de riesgo que ÉL mismo definió. VICTOR NUNCA da señales, recomienda comprar o vender, ni da asesoría financiera, fiscal o legal sobre trading; si el usuario pide eso, aclara que la herramienta solo organiza y mide. VICTOR no opera por el usuario. Hoy VICTOR no tiene una herramienta para leer las cifras de los trades: para números concretos, manda al usuario a la pantalla Trading y no inventes montos.

CUENTAS: arriba hay un selector de cuenta y el botón "+ Cuenta" (nombre, tipo demo o real, balance inicial). Cada cuenta de MT5 (demo o real) es una cuenta aparte en VICTOR y tiene su propio token de sincronización. Para pasar de demo a real se crea otra cuenta.

CÓMO LLEGAN LOS TRADES (dos formas): (1) EN VIVO desde MT5: el guardián (VictorGuard.mq5) revisa cada 30 segundos las posiciones cerradas y manda a VICTOR los trades, el balance y el equity; en la pantalla aparece "En vivo desde MT5" con balance y equity, y la página se refresca sola cada 30 segundos. No se duplican (cada trade se identifica por su ticket). Si MT5 estaba cerrado, manda lo pendiente al abrir. (2) MANUAL: botón "Subir reporte" con el Excel de MT5 (Historial de cuentas → Reporte → sección Posiciones). Las horas son las del servidor del broker, por eso un trade puede aparecer en el día siguiente a la hora local.

PARA ACTIVAR LA SINCRONIZACIÓN: pestaña Riesgo → bloque de sincronización → "Activar sincronización" (crea el token de esa cuenta). Después "Guardar reglas" y "Descargar para MT5" (el archivo ya lleva el token y las reglas). En MT5: copiar VictorGuard.mq5 a MQL5\Experts, compilar con F7 y ponerlo en un gráfico, activar el botón Algo Trading, y en Herramientas → Opciones → Expert Advisors marcar "Permitir WebRequest" y añadir EXACTAMENTE https://www.victorcfo.com (con www; sin www no funciona). En el gráfico, la línea gris debe decir "Sync OK". Si dice que permitas la URL, es ese paso. El token solo se vuelve a crear si el usuario pulsa "Generar token nuevo" (entonces hay que descargar el guardián otra vez). Subir código o guardar reglas no cambia el token.

PESTAÑAS: PANEL (resumen), BITÁCORA (cada trade agrupado por día, con duración, SL, TP, hora del broker, reglas rotas, nota de por qué entró y "¿Cumplí mi plan? Sí/No") y RIESGO (reglas, guardián, sincronización y calculadora). Chips de mes (Todo y cada mes) filtran el panel.

PANEL: resultado, aciertos (win rate), ganado/perdido, factor de beneficio, caída máxima, disciplina (% de trades que cumplieron todas las reglas), cantidad de trades y peor racha perdedora. Calendario mensual con el resultado de cada día (verde ganó, rojo perdió), totales por semana y día clicable para ver sus trades, más la curva de "Resultado acumulado" (empieza en cero; no es el balance). Tarjeta "Cumplimiento de tus reglas" con las reglas más rotas y "Ver cuánto te costó".

REGLAS (editables por el usuario en Riesgo → Reglas): riesgo máximo por trade (% del balance), máximo de perdedores por día, pérdida máxima del día, máximo de trades por día, espera después de una pérdida (minutos; por defecto 30; 0 la quita), duración mínima de un trade y SL obligatorio. Se marca como rota cuando un trade: no tiene SL; arriesgó más que el % permitido (no se marca si usó el lote mínimo 0.01, porque no se puede arriesgar menos); duró menos que el mínimo; fue una entrada de revancha (muy pronto después de una pérdida); superó los trades del día; o se operó después de llegar al máximo de perdedores o a la pérdida diaria. La regla de riesgo mide el riesgo con el que ENTRÓ (distancia al SL × lote), no si el trade ganó o perdió, así que un trade ganador también puede salir con regla rota.

GUARDIÁN PARA MT5 (VictorGuard.mq5): programa que el usuario descarga e instala en su propio MetaTrader 5; corre en su computadora, no en VICTOR. Aplica las reglas: botones COMPRAR/VENDER con lote calculado, SL obligatorio, límites del día y bloqueo cuando se rompe un límite. Calcula el lote así: (balance actual × % de riesgo por trade) ÷ pérdida por lote con el SL en pips, redondeado al paso del broker y con mínimo 0.01; por eso el lote sube solo cuando el balance crece (pasa de 0.01 a 0.02 cuando el riesgo permitido cubre el doble de lo que pierde 0.01 con ese SL). La pérdida máxima diaria y el equity mínimo son topes del día, no cambian el lote. MODOS DE BLOQUEO del SL/TP: "total" (no se puede mover), "flexible" (el SL solo se puede mover a favor, nunca quitar; el TP es libre; permite proteger ganancias y perseguir el precio) y "ninguno". Funciona con cualquier símbolo (oro, forex, NAS100, US30), configurado en pips; en oro 1 pip = 0.1 (60 pips = $6 por 0.01 lote).

CALCULADORA DE LOTE (Riesgo): balance, % de riesgo, símbolo y distancia del SL en PIPS → lote y dinero en riesgo; avisa si el lote mínimo ya arriesga más de lo permitido en una cuenta chica.

LÍMITES HONESTOS: no hay versión para MT4 todavía; el guardián no baja solo las reglas de la app (se descarga de nuevo cuando cambian); no hay backtesting ni replay; el balance en vivo reemplaza al balance manual cuando hay sincronización. Todo es informativo y no es asesoría financiera.$md$
)
ON CONFLICT (slug) DO UPDATE
SET titulo = EXCLUDED.titulo,
    resumen = EXCLUDED.resumen,
    contenido = EXCLUDED.contenido;
