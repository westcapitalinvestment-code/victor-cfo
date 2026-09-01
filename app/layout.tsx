import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "VICTOR CFO",
  description: "Tu Director Financiero Virtual",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VICTOR CFO",
  },
};

// themeColor va en su propio export "viewport" (no en metadata) desde
// Next.js 14 — así el color de la barra de estado del celular coincide con
// el verde de VICTOR (#1D9E75) cuando la app está instalada.
//
// viewportFit: "cover" (28 agosto 2026, reportado por Joel: la pantalla se
// veía "desajustada" y a veces un swipe cerca de los íconos de abajo se
// colaba como si cambiara de página del celular) — sin esto, env(safe-area-
// inset-*) en globals.css siempre vale 0, así que el contenido no sabe
// dónde termina el notch/la barra de gestos del celular y puede quedar
// pegado ahí, generando esos saltos/desajustes. Con "cover" la app pinta
// hasta el borde real de la pantalla y nosotros mismos controlamos el
// espaciado seguro con env(safe-area-inset-bottom) en el bottom nav.
export const viewport: Viewport = {
  themeColor: "#1D9E75",
  viewportFit: "cover",
};

// Script bloqueante y mínimo — aplica la clase "dark" al <html> ANTES de
// que se pinte la página, leyendo la preferencia guardada. Sin esto, la
// pantalla parpadearía en claro y luego saltaría a oscuro cuando React
// hidrate (ver ThemeToggle en dashboard/topbar.tsx, que es quien la guarda).
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('victor_theme');
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
