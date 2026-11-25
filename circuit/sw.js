/* THE CIRCUIT service worker — the app shell is cached so the season opens instantly and works with no
   signal (markets are outdoors; the wifi is not). The market data itself is network-first, with the last
   good copy kept as the offline fallback. */
const VERSION = "jsj-circuit-v10";
const SHELL = [
  "./",
  "circuit.css?v=4",
  "app.js?v=8",
  "/assets/events-core.js?v=8",
  "/assets/mark-steel-96.png",
  "/assets/icon-192.png",
  "/assets/fonts/montserrat.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isData = (url) => /\/data\/(events|approved_events)\.json$/.test(url.pathname) || url.hostname === "raw.githubusercontent.com";

/* Tag a cached answer so the page can tell "synced just now" from "showing the copy we saved". Without this
   a cache hit on a dead network looks exactly like a fresh sync, and the footer says so. */
const stampCached = (res) => {
  if (!res) return Response.error();
  if (res.type === "opaque") return res;
  const headers = new Headers(res.headers);
  headers.set("X-Season-Source", "cache");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Market data: try the network, fall back to the last copy we stored.
  if (isData(url)) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(stampCached)),
    );
    return;
  }

  // Navigations: network first so a new build is picked up, shell as the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./").then((hit) => hit || caches.match(req))));
    return;
  }

  // Everything else: cache first, then network (and keep it).
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
