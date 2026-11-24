const CACHE_NAME = "cornerguide-v4";
const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// One service worker for everything. Only one worker can control the app's
// scope: the push worker (firebase-messaging-sw.js) and this caching worker
// used to replace each other on every app start, so background pushes broke
// until push was switched on again. The push part is now loaded in here.
try {
  importScripts("./firebase-messaging-sw.js");
} catch (err) {
  // Offline while the worker updates: caching still works, push comes back
  // with the next update.
  console.warn("Push worker could not be loaded:", err);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("Service worker install failed:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch((err) => console.warn("Service worker activate failed:", err))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;
  // The app's own "is there a new version?" check must reach the server.
  if (event.request.cache === "no-store") return;

  // Navigation requests (index.html) always go network-first, past the
  // browser's HTTP cache (GitHub Pages allows 10 minutes), so a new version
  // is there the moment the app is opened again.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" }).then((response) => {
        if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // All other same-origin assets: cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch((err) => {
        console.warn("Fetch failed:", err);
        return Promise.reject(new Error("Network request failed"));
      });
    })
  );
});
