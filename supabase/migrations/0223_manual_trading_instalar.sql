-- ============================================================================
-- VICTOR CFO — 0223: artículo 'trading-instalar' (20 nov 2026)
-- Guía completa paso a paso para instalar VictorGuard (Windows y Mac) y los
-- tropiezos típicos de la instalación. La usan VICTOR en el chat y el agente
-- de soporte por email (soporte@victorcfo.com), ambos leen manual_articulos.
-- ============================================================================

INSERT INTO manual_articulos (slug, titulo, resumen, contenido) VALUES
(
  'trading-instalar',
  'Trading — cómo instalar el guardián VictorGuard en MT5 (instalación paso a paso, Windows y Mac)',
  'Instalación de VictorGuard.mq5 en MetaTrader 5: descargar, copiar a MQL5/Experts, compilar, permitir WebRequest, Algo Trading y ponerlo en un gráfico; diferencias en Mac y qué hacer si se queda trabado instalándolo.',
  $md$ANTES DE EMPEZAR: necesita MetaTrader 5 DE ESCRITORIO (Windows, Mac o un VPS con Windows) con su cuenta del broker abierta. NO sirve MT4, cTrader, TradingView ni el MT5 web del navegador (no acepta asesores expertos). En el celular (MT5 de iPhone/Android) tampoco corre el guardián, aunque puede operar desde el celular y el guardián, corriendo en la computadora, igual lo protege.

PASO A PASO (unos 5 minutos, una sola vez):
1. En VICTOR: Trading → pestaña Riesgo → llenar "Mis reglas" → Guardar reglas → Descargar para MT5. Baja el archivo VictorGuard.mq5 con sus reglas y su conexión (token) ya puestas. Cada usuario tiene su propio archivo: no sirve el de otra persona.
2. En MT5: Archivo → Abrir carpeta de datos → entrar a MQL5 → Experts → copiar ahí VictorGuard.mq5 (si ya había uno, reemplazarlo).
3. Pulsar F4 (abre MetaEditor) → abrir VictorGuard.mq5 → Compilar (F7). Abajo debe decir "0 errors". Se crea VictorGuard.ex5 al lado.
4. En MT5: Herramientas → Opciones → Asesores Expertos → marcar "Permitir WebRequest para las URL listadas" → agregar EXACTAMENTE https://www.victorcfo.com → Aceptar. Esto es para que los trades lleguen solos a la bitácora.
5. Encender el botón Algo Trading de la barra de MT5 (queda verde). En la misma ventana de Opciones → Asesores Expertos, desmarcar "Deshabilitar el trading algorítmico al cambiar de cuenta" y "… al cambiar de perfil", para que no se apague solo.
6. Abrir el Navegador (Ctrl+N) → Asesores Expertos → arrastrar VictorGuard a UN SOLO gráfico (cualquier activo). En la ventana que sale, pestaña Común → marcar "Permitir Algo Trading" → Aceptar.
7. Listo si en el gráfico se ve el panel del guardián con los botones VENDER / COMPRAR y, al rato, "Sync OK". Arriba a la derecha del gráfico el ícono del asesor debe verse activo (no tachado ni gris).

EN MAC (incluido macOS Tahoe; Catalina o más nuevo, Intel o Apple M1 en adelante): bajar "MT5 para Mac" (app de escritorio) del broker o de metatrader5.com. Los pasos son los mismos, con estas diferencias: si "Abrir carpeta de datos" no deja pegar el archivo, en el Finder pulsar Cmd+Shift+G y pegar ~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts, y arrastrar ahí el archivo desde Descargas; F4 y F7 son fn+F4 y fn+F7 (o los botones MetaEditor y Compilar); dentro de MT5 los atajos van con Control, no con Command (Ctrl+N). La Mac debe quedar prendida, sin dormir y con MT5 abierto.

SI SE QUEDA TRABADO:
- "No aparece VictorGuard en el Navegador": no se compiló o se copió en otra carpeta. Verificar que está en MQL5\Experts (no en MQL5\Indicators ni en Descargas), compilar con F7 y, en el Navegador, clic derecho → Actualizar.
- "Al compilar salen errores": casi siempre el archivo se abrió/guardó con otro programa (Word, Notes) o se copió el texto a mano. Descargarlo otra vez desde VICTOR y copiar el ARCHIVO sin abrirlo.
- "Lo arrastré y no hace nada / el ícono está gris o tachado": Algo Trading apagado. Encender el botón Algo Trading (verde) y, con clic derecho en el gráfico → Asesores Expertos → Propiedades → Común, marcar Permitir Algo Trading.
- "No dice Sync OK / no llegan los trades": revisar el paso 4 (la URL debe ser exactamente https://www.victorcfo.com, sin barra al final). Si generó un token nuevo en VICTOR, descargar y compilar el guardián otra vez.
- "Cambié mis reglas y sigue igual": descargar otra vez, reemplazar el archivo, compilar con F7 y QUITAR el guardián del gráfico y volverlo a poner (MT5 guarda las entradas viejas si solo se recompila).
- "Lo puse en varios gráficos": dejarlo en uno solo; ese vigila toda la cuenta.
- "Mi broker es otro / cuenta de fondeo": funciona igual con cualquier broker de MT5, real, demo o de fondeo.
- Para que corra 24/7 sin dejar la computadora prendida: un VPS con Windows y MT5 (muchos brokers lo regalan si la cuenta tiene cierto balance).
Si nada de esto lo resuelve: que escriba a soporte@victorcfo.com con una foto de la pantalla (el gráfico con el panel del guardián y, si hay, la pestaña Expertos de la Caja de herramientas, Ctrl+T).$md$
)
ON CONFLICT (slug) DO UPDATE
SET titulo = EXCLUDED.titulo,
    resumen = EXCLUDED.resumen,
    contenido = EXCLUDED.contenido;
