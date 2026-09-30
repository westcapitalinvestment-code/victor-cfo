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
  server: {
    url: "https://www.victorcfo.com",
    androidScheme: "https",
    // cleartext: false — todo pasa por HTTPS real, nunca HTTP.
  },
  // appendUserAgent marca el User-Agent del WebView nativo para que
  // app/page.tsx pueda distinguir "alguien abrió la app de verdad" de
  // "alguien visitó victorcfo.com en un navegador normal" — así la app
  // abre directo en /login (como cualquier app) en vez del landing de
  // mercadeo, que solo tiene sentido para visitantes web nuevos. Va por
  // plataforma (no en `server` global) porque la versión de @capacitor/cli
  // instalada en Vercel no reconoce ese campo a nivel global.
  android: {
    appendUserAgent: "VictorCFOApp",
  },
  ios: {
    contentInset: "automatic",
    appendUserAgent: "VictorCFOApp",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
