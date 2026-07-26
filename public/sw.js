const CACHE = "smartlinknet-v20260726";
const OFFLINE_URL = "/dashboard";

const PRECACHE = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

// Never cache hashed JS/CSS chunks — the browser handles those via content-hash filenames.
// Only cache static shell assets and navigation requests for offline support.
function shouldCache(url) {
  const u = new URL(url);
  if (u.pathname.startsWith("/assets/")) return false;
  if (u.pathname.match(/\.[0-9a-f]{8}\./)) return false;
  return true;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Force all open tabs to reload when a new SW takes over
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) return;
  // Let hashed asset chunks go straight to network — never intercept them.
  if (!shouldCache(e.request.url)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res.ok && e.request.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE)
              .then((c) => c.put(e.request, clone))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => {
          const acceptHeader = e.request.headers.get("accept") || "";
          if (e.request.mode === "navigate" || acceptHeader.includes("text/html")) {
            return caches.match(OFFLINE_URL);
          }
          return new Response("Service Unavailable", {
            status: 503,
            statusText: "Service Unavailable",
          });
        });
    })
  );
});

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "SmartLinkNet", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? "/dashboard"));
});
