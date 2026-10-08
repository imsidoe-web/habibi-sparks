/* Habibi Sparks – service worker
   Verhoog CACHE_VERSION bij elke nieuwe release, dan krijgen gebruikers de update. */
const CACHE_VERSION = "habibi-sparks-v2";
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "questions.json",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-64.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase / realtime verkeer nooit onderscheppen
  if (/firebase|googleapis\.com\/identitytoolkit|firebaseio\.com|gstatic\.com\/firebasejs/.test(url.hostname + url.pathname)
      && !/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    return;
  }

  // Pagina's en vragen: eerst netwerk (altijd actueel), anders cache (offline)
  if (req.mode === "navigate" || url.pathname.endsWith("questions.json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // Overige bestanden (css, iconen, CDN-scripts, lettertypen): cache eerst, op de achtergrond verversen
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
