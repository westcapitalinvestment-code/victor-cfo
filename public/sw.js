// Service worker mínimo de VICTOR CFO — su único trabajo real es hacer que
// el navegador considere la app "instalable" (PWA) y darle algo de
// resiliencia si el usuario pierde señal un instante. A propósito NO
// cachea nada de /api/ ni datos dinámicos: los números de dinero SIEMPRE
// tienen que venir frescos del servidor, nunca de una copia vieja guardada
// en el celular — eso sería peor que no tener PWA.

const CACHE_NAME = "victor-cfo-shell-v1";
const APP_SHELL = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca intervenir en llamadas a la API (datos financieros, VICTOR, auth) —
  // esas siempre van directo a la red, sin pasar por el service worker.
  if (url.pathname.startsWith("/api/")) return;

  // Red primero (para que siempre vea la versión más reciente de la app);
  // si no hay conexión, cae a lo último que se guardó en caché como
  // respaldo, en vez de una pantalla en blanco.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copia)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Notificaciones push de verdad (documentos por vencer, gastos sin
// categorizar) — las manda el cron diario (app/api/cron/notificaciones-push)
// vía Web Push/VAPID. Este listener es lo que hace que suene/aparezca la
// notificación en el celular, incluso con la app cerrada del todo.
self.addEventListener("push", (event) => {
  let datos = { title: "VICTOR CFO", body: "Tienes novedades en tu cuenta." };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    // Si el payload no es JSON válido por lo que sea, se usa el mensaje
    // genérico de arriba en vez de tumbar el evento.
  }

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: datos.url || "/dashboard" },
    })
  );
});

// Al tocar la notificación: si ya hay una pestaña de VICTOR CFO abierta,
// la enfoca en vez de abrir una nueva (evita duplicar la app instalada);
// si no hay ninguna, abre una.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
