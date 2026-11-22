-- VICTOR CFO — 0225: manual de Trading — horario y bloqueos, reglas en vivo,
-- "aflojar aplica desde mañana", periodo de prueba y cambios desde el chat (22 nov 2026).

UPDATE manual_articulos SET contenido = replace(contenido,
  'Hoy VICTOR no tiene herramienta para leer las cifras de trading del usuario: no inventes montos; mándalo a la pantalla Trading.',
  'VICTOR lee las cifras reales con revisar_mi_trading y puede cambiar sus reglas desde el chat con su confirmación. Nunca inventes montos.')
WHERE slug = 'trading';

UPDATE manual_articulos SET contenido = replace(contenido,
  'LÍMITES HONESTOS: si cambia reglas hay que descargar el guardián otra vez, compilarlo y QUITARLO y volver a ponerlo en el gráfico (MT5 conserva las entradas viejas si solo se recompila).',
  'LÍMITES HONESTOS: desde el 22 nov 2026 las reglas le llegan solas al guardián cada ~30 s mientras MT5 está abierto y sincronizando; un guardián descargado antes de esa fecha hay que descargarlo una vez más (compilar, quitarlo y volver a ponerlo en el gráfico). El bloqueo por noticias usa el calendario económico de MT5 y no funciona en el probador de estrategias.')
WHERE slug = 'trading';

UPDATE manual_articulos SET contenido = contenido || $md$

HORARIO Y BLOQUEOS (Trading → Riesgo → Mis reglas → "Horario y bloqueos"): el guardián no deja ABRIR trades fuera del plan; lo que ya está abierto sigue con su stop, y si abre uno desde MT5 fuera de horario lo cierra con una alerta.
- Zona horaria: se detecta sola del navegador y se puede cambiar. Las horas que escribe son en SU hora.
- Sesiones del mercado: Asia (Tokio 9 am–6 pm), Londres (8 am–5 pm de Londres), Londres + Nueva York (cuando las dos están abiertas) y Nueva York (8 am–5 pm de NY). Se convierten solas a su hora y al horario de verano. Ninguna marcada = sin límite.
- Horas propias: hasta 3 rangos (ej. 8:00 am a 2:00 pm). Si marca sesiones y horas, puede operar en cualquiera de las dos.
- Días sin operar (ej. lunes), pausas por fecha (vacaciones, semana del NFP) y noticias de alto impacto (no abre 15, 30 o 60 min antes y después de una noticia fuerte de la moneda del activo; ej. USD para el oro).
- Arriba dice si ahora puede operar y cuándo cambia. En MT5 la línea de estado dice "FUERA DE HORARIO: abres a las…", "EN PAUSA…" o "NOTICIA USD…".

APRETAR YA, AFLOJAR MAÑANA: si un cambio aprieta las reglas (menos riesgo, menos trades, menos horario, más bloqueos) aplica al instante. Si las afloja (más riesgo, más trades, más horario, quitar un bloqueo o una pausa) aplica desde la medianoche de mañana en su hora, para no quitarse los frenos en caliente después de perder. Lo pendiente sale en "Cambios que aplican mañana" con botón Cancelar.

PERIODO DE PRUEBA: "Armar mi plan" (7 preguntas, incluye en qué sesión puede operar) termina con "Pruébalas sin cambiarlas" de 14, 21 o 30 días (mínimo 14 para que los datos sean confiables). En Panel y Riesgo sale "Día X de N · trades registrados". Al terminar le llega un correo y la tarjeta "Revisar con VICTOR": VICTOR analiza activos, sesiones, horas, días, compras/ventas y disciplina, propone ajustes y, con su "sí", los aplica y empieza una nueva prueba.

CAMBIAR REGLAS DESDE EL CHAT: el usuario le puede pedir a VICTOR, por ejemplo, "no me dejes operar después de las 2 pm" o "bloquéame los lunes". VICTOR primero muestra la vista previa (qué aplica ya y qué desde mañana) y solo guarda con su confirmación. Lo que se puede cambiar: pérdida máxima del día en $, pérdidas al día, trades al día, trades abiertos a la vez, espera tras perder, riesgo %, activos prohibidos, horario por horas, sesiones, días sin operar, pausas, noticias y zona horaria.$md$
WHERE slug = 'trading' AND position('HORARIO Y BLOQUEOS' in contenido) = 0;

UPDATE manual_articulos SET contenido = replace(contenido,
  'CAMBIÉ MIS REGLAS Y EL GUARDIÁN SIGUE IGUAL: Guardar reglas → Descargar para MT5 → reemplazar el archivo en MQL5\Experts → compilar con F7 → QUITAR el guardián del gráfico y volver a ponerlo (si solo recompila, MT5 conserva los valores viejos de la pestaña Entradas). En Entradas debe ver, por ejemplo, RiskMoney = 7.',
  'CAMBIÉ MIS REGLAS Y EL GUARDIÁN SIGUE IGUAL: 1) si aflojó una regla, aplica desde mañana (sale en "Cambios que aplican mañana"); 2) el guardián las recibe al sincronizar: MT5 abierto, guardián en el gráfico y la línea "Sync OK" en el panel; 3) si su guardián es de antes del 22 nov 2026 no recibe reglas en vivo: Descargar para MT5 → reemplazar el archivo en MQL5\Experts → compilar con F7 → QUITAR el guardián del gráfico y volver a ponerlo.

NO ME DEJA ABRIR Y NO PERDÍ: mire la línea de estado del guardián. "FUERA DE HORARIO" = fuera de sus sesiones u horas (en Riesgo dice cuándo abre); "EN PAUSA" = una pausa por fecha; "NOTICIA USD…" = noticia de alto impacto cerca (espera los minutos que eligió). Son sus propias reglas; se cambian en Trading → Riesgo o pidiéndoselo a VICTOR.')
WHERE slug = 'trading-problemas';

NOTIFY pgrst, 'reload schema';
