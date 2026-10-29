const ASSET_PATH = /^\/assets\/.+\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      request.method !== "GET" ||
      !ASSET_PATH.test(url.pathname) ||
      request.headers.has("authorization") ||
      request.headers.has("cookie")
    ) {
      return fetch(request);
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const originResponse = await fetch(request);
    if (
      !originResponse.ok ||
      originResponse.status !== 200 ||
      originResponse.headers.has("set-cookie")
    )
      return originResponse;
    const headers = new Headers(originResponse.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    const response = new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
