// Hydrowise service worker.
// - pages: network first, cached copy when offline (the last opened report works in the field)
// - static assets (/_next/static, icons, fonts): cache first
// - map tiles (Geoportal orthophoto, OpenStreetMap): cache first, last ~600 tiles kept
// - API: network only
const VERSION = "v3";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const MAX_TILES = 600;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const exact = await cache.match(request);
    if (exact) return exact;
    // Never show another parcel's report: other query strings fall back to the start page,
    // where "Twoje gospodarstwo" links to the reports that are cached.
    if (!new URL(request.url).pathname.startsWith("/raport")) {
      const samePath = await cache.match(request, { ignoreSearch: true });
      if (samePath) return samePath;
    }
    if (fallbackPath) {
      const fb = await cache.match(fallbackPath);
      if (fb) return fb;
    }
    return new Response("Brak połączenia z internetem.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function tile(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
  }
  return res;
}

const isTile = (url) =>
  (url.hostname === "mapy.geoportal.gov.pl" && url.searchParams.get("REQUEST") === "GetTile") || url.hostname === "tile.openstreetmap.org";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isTile(url)) event.respondWith(tile(request));
    else if (url.hostname.endsWith("fonts.gstatic.com")) event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }
  // React Server Component payloads for client-side navigation between pages.
  if (request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(cacheFirst(request));
  }
});
