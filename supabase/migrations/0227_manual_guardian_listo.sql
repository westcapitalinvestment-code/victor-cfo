-- ============================================================================
-- VICTOR CFO — 0227: guardián listo para usar (22 nov 2026)
-- VictorGuard 3.20 se reparte ya compilado (VictorGuard.ex5, igual para todos):
-- no hay que compilar con F7. La persona pega su código de conexión en
-- Entradas > SyncToken y TODAS sus reglas (riesgo, stop, activos, límites,
-- horario, noticias) le llegan solas por sincronización.
-- ============================================================================

UPDATE manual_articulos SET
  resumen = 'Instalación de VictorGuard en MetaTrader 5 (ya viene compilado, sin F7): descargar, copiar a MQL5/Experts, permitir WebRequest, Algo Trading, ponerlo en un gráfico y pegar el código de conexión; diferencias en Mac y qué hacer si se queda trabado.',
  contenido = $md$ANTES DE EMPEZAR: necesita MetaTrader 5 DE ESCRITORIO (Windows, Mac o un VPS con Windows) con su cuenta del broker abierta. NO sirve MT4, cTrader, TradingView ni el MT5 web del navegador (no acepta asesores expertos). En el celular (MT5 de iPhone/Android) tampoco corre el guardián, aunque puede operar desde el celular y el guardián, corriendo en la computadora, igual lo protege.

PASO A PASO (unos 3 minutos, una sola vez). Desde el 22 nov 2026 el guardián viene YA COMPILADO: no hay que abrir MetaEditor ni pulsar F7.
1. En VICTOR: Trading → pestaña Riesgo → llenar "Mis reglas" → Guardar reglas → "Descargar guardián para MT5" (baja VictorGuard.ex5) y "Copiar código" (su código de conexión, único y personal; no lo comparta).
2. En MT5: Archivo → Abrir carpeta de datos → entrar a MQL5 → Experts → copiar ahí VictorGuard.ex5 (si ya había uno, reemplazarlo). En el Navegador (Ctrl+N), clic derecho en Asesores Expertos → Actualizar.
3. En MT5: Herramientas → Opciones → Asesores Expertos → marcar "Permitir WebRequest para las URL listadas" → agregar EXACTAMENTE https://www.victorcfo.com → Aceptar. Sin esto no le llegan sus reglas.
4. Encender el botón Algo Trading de la barra de MT5 (queda verde). En Opciones → Asesores Expertos, desmarcar "Deshabilitar el trading algorítmico al cambiar de cuenta" y "… al cambiar de perfil".
5. Arrastrar VictorGuard a UN SOLO gráfico (cualquier activo). Pestaña Común → marcar "Permitir Algo Trading". Pestaña Entradas → pegar el código en SyncToken → Aceptar.
6. Listo cuando el panel del guardián dice "Sync OK": ya tomó sus reglas. Mientras no tenga el código dice "FALTA TU CODIGO DE VICTOR", y si no le llegan las reglas dice "ESPERANDO TUS REGLAS DE VICTOR"; en ambos casos NO deja abrir trades (por seguridad).

OPCIÓN AVANZADA: debajo de las instrucciones está "Descargar VictorGuard.mq5", el código fuente con su código y reglas ya puestos; se copia a MQL5 → Experts y se compila con F7 en MetaEditor. Solo hace falta si alguien quiere ver o revisar el código.

EN MAC (incluido macOS Tahoe; Catalina o más nuevo, Intel o Apple M1 en adelante): bajar "MT5 para Mac" (app de escritorio) del broker o de metatrader5.com. Los pasos son los mismos, con estas diferencias: si "Abrir carpeta de datos" no deja pegar el archivo, en el Finder pulsar Cmd+Shift+G y pegar ~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts, y arrastrar ahí el archivo desde Descargas; dentro de MT5 los atajos van con Control, no con Command (Ctrl+N). La Mac debe quedar prendida, sin dormir y con MT5 abierto.

SI SE QUEDA TRABADO:
- "No aparece VictorGuard en el Navegador": se copió en otra carpeta. Verificar que VictorGuard.ex5 está en MQL5\Experts (no en MQL5\Indicators ni en Descargas) y, en el Navegador, clic derecho → Actualizar.
- "Dice FALTA TU CODIGO DE VICTOR": clic derecho en el gráfico → Asesores Expertos → Propiedades → Entradas → pegar el código (Trading → Riesgo → Copiar código) en SyncToken.
- "Dice ESPERANDO TUS REGLAS / no dice Sync OK": revisar el paso 3 (la URL debe ser exactamente https://www.victorcfo.com, sin barra al final) y que el código sea el actual (si generó uno nuevo en VICTOR, pegar el nuevo).
- "Lo arrastré y no hace nada / el ícono está gris o tachado": Algo Trading apagado. Encender el botón Algo Trading (verde) y, en Propiedades → Común, marcar Permitir Algo Trading.
- "Cambié mis reglas y sigue igual": le llegan solas cada ~30 s con "Sync OK". Si aflojó una regla, aplica desde mañana (sale en "Cambios que aplican mañana").
- "Lo puse en varios gráficos": dejarlo en uno solo; ese vigila toda la cuenta.
- "Mi broker es otro / cuenta de fondeo": funciona igual con cualquier broker de MT5, real, demo o de fondeo.
- Para que corra 24/7 sin dejar la computadora prendida: un VPS con Windows y MT5 (muchos brokers lo regalan si la cuenta tiene cierto balance).
Si nada de esto lo resuelve: que escriba a soporte@victorcfo.com con una foto de la pantalla (el gráfico con el panel del guardián y, si hay, la pestaña Expertos de la Caja de herramientas, Ctrl+T).$md$
WHERE slug = 'trading-instalar';

UPDATE manual_articulos SET contenido = replace(contenido,
  '3) si su guardián es de antes del 22 nov 2026 no recibe reglas en vivo: Descargar para MT5 → reemplazar el archivo en MQL5\Experts → compilar con F7 → QUITAR el guardián del gráfico y volver a ponerlo.',
  '3) si su guardián es de antes del 22 nov 2026 no recibe reglas en vivo: "Descargar guardián para MT5" (ya compilado) → reemplazar el archivo en MQL5\Experts → QUITAR el guardián del gráfico y volver a ponerlo, pegando su código en Entradas → SyncToken.')
WHERE slug = 'trading-problemas';

NOTIFY pgrst, 'reload schema';
