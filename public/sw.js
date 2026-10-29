const CACHE_NAME = "ratingguard-public-assets-v1";
const ASSET_PATH = /^\/assets\/.+\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith("ratingguard-public-assets-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !ASSET_PATH.test(url.pathname) ||
    request.headers.has("authorization") ||
    request.headers.has("cookie")
  )
    return;

  const networkUpdate = caches.open(CACHE_NAME).then((cache) =>
    fetch(request).then(async (response) => {
        if (
          response.ok &&
          response.type === "basic" &&
          !response.headers.has("set-cookie")
        )
          await cache.put(request, response.clone());
        return response;
      }),
  );
  event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(request))
      .then((cached) => cached ?? networkUpdate),
  );
});
