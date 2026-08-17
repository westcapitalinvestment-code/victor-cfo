import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VICTOR CFO",
  description: "Tu Director Financiero Virtual",
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
      <body>{children}</body>
    </html>
  );
}
