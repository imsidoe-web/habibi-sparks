/* Habibi Sparks – service worker (v3, robuust)
   Verhoog CACHE_VERSION bij elke nieuwe release, dan krijgen gebruikers de update. */
const CACHE_VERSION = "habibi-sparks-v5";
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "Habbi01.jpg",
  "questions.json",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-64.png"
];

const OFFLINE_HTML = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Habibi Sparks</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAEDCD;color:#4A1D40;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{color:#6B2D5C;font-family:Georgia,serif}button{font:inherit;font-weight:700;padding:14px 26px;border:0;border-radius:999px;background:#6B2D5C;color:#FFF8EA}</style></head>
<body><div><h1>Habibi Sparks 💗</h1><p>Geen verbinding. Zodra je weer internet hebt, kun je verder.</p>
<button onclick="location.reload()">Opnieuw proberen</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Elk bestand apart: een ontbrekend bestand mag de installatie nooit laten mislukken
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok && !res.redirected) await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function networkWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Alleen eigen bestanden afhandelen; CDN, lettertypen, Firebase enz. gaan rechtstreeks naar het netwerk
  if (url.origin !== self.location.origin) return;

  // Audio (grote bestanden, Range-verzoeken) rechtstreeks van het netwerk laten komen
  if (req.headers.has("range") || /\.(mp3|m4a|ogg|wav|aac)$/i.test(url.pathname)) return;

  // Pagina's: eerst netwerk, daarna cache, daarna een offline-pagina. Altijd een geldig antwoord.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await networkWithTimeout(req, 6000);
        if (res.ok && !res.redirected && res.type === "basic") {
          const cache = await caches.open(CACHE_VERSION);
          cache.put("index.html", res.clone());
        }
        return res;
      } catch (e) {
        const cached = (await caches.match(req, { ignoreSearch: true }))
          || (await caches.match("index.html"))
          || (await caches.match("./"));
        return cached || new Response(OFFLINE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  // Overige eigen bestanden: uit cache tonen en op de achtergrond verversen
  event.respondWith((async () => {
    const hit = await caches.match(req);
    const refresh = fetch(req).then(async (res) => {
      if (res.ok && res.type === "basic") {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    if (hit) { refresh; return hit; }
    return (await refresh) || new Response("", { status: 504, statusText: "Offline" });
  })());
});
