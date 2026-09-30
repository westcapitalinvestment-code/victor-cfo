import type { CapacitorConfig } from "@capacitor/cli";

// Config de Capacitor (30 sept 2026, pedido de Joel: empacar la PWA de
// VICTOR CFO para App Store + Google Play). VICTOR CFO NO se empaca como
// bundle estático — tiene decenas de API routes, cron jobs, webhooks
// (Stripe, Shopify) y middleware que solo corren en el servidor. Por eso
// `server.url` apunta a la app real en producción: el shell nativo (iOS/
// Android) es básicamente un WebView + los plugins nativos de abajo, pero
// el contenido/lógica sigue viviendo 100% en Vercel, igual que la PWA.
//
// Esto es el mismo patrón que usa cualquier PWA con backend real (Twitter/X,
// Starbucks, etc. lo hicieron así en su momento) — la app nativa es una
// "ventana" con capacidades de teléfono de verdad (push, cámara, biometría)
// encima del mismo VICTOR CFO de siempre.
const config: CapacitorConfig = {
  appId: "com.victorcfo.app",
  appName: "VICTOR CFO",
  webDir: "public", // no se usa para servir nada (server.url manda), pero Capacitor lo exige
  // server.url apunta directo a /login (no a la raíz) — pedido de Joel:
  // "todas las apps abren en el login", con un botón ahí ("Comienza
  // ahora") para crear cuenta si no la tiene. app/login/page.tsx ya
  // manda solo a /dashboard si detecta sesión activa (para cuando cierras
  // y reabres la app con la sesión todavía viva). Antes esto se resolvía
  // detectando el User-Agent del WebView en app/page.tsx, pero apuntar
  // directo aquí es más simple y no depende de nada del lado del
  // servidor — la app nativa nunca pasa por el landing.
  server: {
    url: "https://www.victorcfo.com/login",
    androidScheme: "https",
    // cleartext: false — todo pasa por HTTPS real, nunca HTTP.
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
