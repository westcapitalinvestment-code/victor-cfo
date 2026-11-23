-- Vincular el guardián con un código de 6 dígitos (23 nov 2026).
-- El guardián (sin token) pide un código y lo muestra en el gráfico; la persona
-- lo escribe en VICTOR y queda conectado. Solo el servidor (cliente admin) usa
-- estas tablas: RLS activo y sin políticas.
create table if not exists public.trading_vinculos (
  id bigserial primary key,
  install text not null,          -- secreto aleatorio de esa instalación de MT5
  login text not null,            -- número de cuenta de MT5
  servidor text,
  codigo text not null,           -- 6 dígitos
  account_id uuid,                -- se llena al confirmar en la web
  token text,                     -- token de sincronización que recibirá el guardián
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists trading_vinculos_install_idx on public.trading_vinculos (install, login);
create index if not exists trading_vinculos_codigo_idx on public.trading_vinculos (codigo);
alter table public.trading_vinculos enable row level security;

-- Intentos fallidos de código (para frenar a quien intente adivinar).
create table if not exists public.trading_vinculo_intentos (
  id bigserial primary key,
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists trading_vinculo_intentos_idx on public.trading_vinculo_intentos (owner_id, created_at);
alter table public.trading_vinculo_intentos enable row level security;

-- Manual: la conexión ahora es con el código de 6 dígitos (VictorGuard 3.21).
UPDATE manual_articulos SET
  resumen = 'Instalación de VictorGuard en MetaTrader 5 (ya compilado): descargar, copiar a MQL5/Experts, permitir WebRequest, Algo Trading, ponerlo en un gráfico y escribir en VICTOR el código de 6 números que sale en el gráfico; Mac y qué hacer si se traba.',
  contenido = $md$ANTES DE EMPEZAR: necesita MetaTrader 5 DE ESCRITORIO (Windows, Mac o un VPS con Windows) con su cuenta del broker abierta. NO sirve MT4, cTrader, TradingView ni el MT5 web del navegador. En el celular no corre el guardián, pero si el guardián corre en la computadora, igual lo protege cuando opera desde el celular.

PASO A PASO (unos 3 minutos, una sola vez). Desde el 23 nov 2026 (VictorGuard 3.21) no hay que copiar ni pegar códigos largos.
1. En VICTOR: Trading → Conectar guardián → "Descargar guardián" (baja VictorGuard.ex5, ya compilado).
2. En MT5: Archivo → Abrir carpeta de datos → MQL5 → Experts → copiar ahí VictorGuard.ex5 (si había uno, reemplazarlo).
3. En MT5: Herramientas → Opciones → Asesores Expertos → marcar "Permitir WebRequest para las URL listadas" → agregar EXACTAMENTE https://www.victorcfo.com → Aceptar.
4. Encender el botón Algo Trading (verde). Arrastrar VictorGuard a UN SOLO gráfico (cualquier activo) → Aceptar.
5. En el gráfico sale grande "Tu codigo VICTOR: 123 456". Escribir esos 6 números en VICTOR (Trading → Conectar guardián, paso 4) → Conectar. En segundos el guardián dice "Conectado con VICTOR" y luego "Sync OK": ya tomó sus reglas.
Cada cuenta de MT5 (demo o real) se conecta una vez con su propio código; al cambiar de cuenta en MT5 el guardián usa solo la conexión de esa cuenta. Mientras no esté conectado dice "CONECTA CON VICTOR" y no deja abrir trades (por seguridad).

EN MAC: "MT5 para Mac" de escritorio. Si "Abrir carpeta de datos" no deja pegar el archivo: Finder → Cmd+Shift+G → ~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts. Dentro de MT5 los atajos van con Control. La Mac debe quedar prendida y con MT5 abierto.

SI SE QUEDA TRABADO:
- "No aparece VictorGuard": verificar que el archivo está en MQL5\Experts y, en el Navegador (Ctrl+N), clic derecho en Asesores Expertos → Actualizar.
- "No sale el código de 6 números / dice Permite https://www.victorcfo.com…": falta el paso 3 (la URL exacta, sin barra al final).
- "Ese código no existe o ya venció": escribir el número que sale AHORA en el gráfico (vence a los 30 minutos y sale uno nuevo solo).
- "El ícono está gris o tachado": Algo Trading apagado; encenderlo (verde).
- "Cambié mis reglas y sigue igual": llegan solas cada ~30 s. Si aflojó una regla, aplica desde mañana.
- En cuentas DEMO no aplican los días/horarios bloqueados (para practicar cualquier día); el resto de reglas sí.
- Opción avanzada (Trading → Conectar guardián → Opciones avanzadas): conexión manual pegando el código largo en Entradas → SyncToken, o el código fuente .mq5.
Si nada lo resuelve: soporte@victorcfo.com con una foto del gráfico y de la pestaña Expertos (Ctrl+T).$md$
WHERE slug = 'trading-instalar';

UPDATE manual_articulos SET contenido = replace(contenido,
  '3) si su guardián es de antes del 22 nov 2026 no recibe reglas en vivo: "Descargar guardián para MT5" (ya compilado) → reemplazar el archivo en MQL5\Experts → QUITAR el guardián del gráfico y volver a ponerlo, pegando su código en Entradas → SyncToken.',
  '3) si su guardián es de antes del 23 nov 2026: "Descargar guardián" (Trading → Conectar guardián) → reemplazar el archivo en MQL5\Experts → QUITAR el guardián del gráfico y volver a ponerlo → escribir en VICTOR el código de 6 números que sale en el gráfico.')
WHERE slug = 'trading-problemas';

NOTIFY pgrst, 'reload schema';
