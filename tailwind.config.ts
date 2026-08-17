import type { Config } from "tailwindcss";

// Paleta tomada directamente de VICTOR Pro — Producto Completo_FINAL.html
// para que la app real se vea idéntica a los mockups ya aprobados.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        border: "var(--border)",
        teal: "#1D9E75",
        text: "var(--text)",
        muted: "var(--muted)",
        grn: "var(--grn)",
        red: "var(--red)",
        amb: "var(--amb)",
      },
      borderRadius: {
        card: "12px",
        pill: "20px",
      },
    },
  },
  plugins: [],
};
export default config;
