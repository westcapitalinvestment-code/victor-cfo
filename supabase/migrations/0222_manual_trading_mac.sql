-- VICTOR CFO — 0222: el guardián también funciona en Mac (20 nov 2026).
UPDATE manual_articulos SET contenido = replace(contenido,
  'MT5 en Windows o en un VPS para que corra 24/7.',
  'MT5 de escritorio en Windows o en Mac (app oficial de MT5 para Mac: macOS Catalina o más nuevo, incluido Tahoe; Intel y Apple M1 en adelante), o en un VPS con Windows para que corra 24/7. EN MAC: se instala igual; si "Abrir carpeta de datos" no deja pegar el archivo, en el Finder Cmd+Shift+G y la ruta ~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts; F4 y F7 son fn+F4 y fn+F7; los atajos dentro de MT5 van con Control, no Command; la Mac debe estar prendida, sin dormir y con MT5 abierto. El MT5 web (en el navegador) NO sirve para el guardián porque no acepta asesores expertos.')
WHERE slug = 'trading' AND position('EN MAC:' in contenido) = 0;
