/* Cache only the offline screen and its fixed assets. Never cache news,
   Next.js navigation payloads, API responses, or authenticated admin pages. */
const CACHE_NAME = "pb-newsfeed-offline-v1";
const OFFLINE = "/offline.html";
const ASSETS = [
  OFFLINE,
  "/fonts/P22Mackinac-Book.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pb-newsfeed-offline-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/admin" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE)) || Response.error();
      })
    );
  } else if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => (await cache.match(request)) || fetch(request))
    );
  }
});
