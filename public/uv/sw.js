// Ultraviolet service worker — loaded with scope /uv/.
// Pulls the current UV build from jsDelivr to avoid bundling client assets
// through the Cloudflare Worker, then hands off to UVServiceWorker.
importScripts("https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3/dist/uv.bundle.js");
importScripts("/uv/config.js");
importScripts("https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@3/dist/uv.sw.js");

const sw = new UVServiceWorker();

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "prism:set-bare" && typeof data.bareUrl === "string") {
    self.__uv$config.bare = data.bareUrl;
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (event.request.url.startsWith(location.origin + self.__uv$config.prefix)) {
        return await sw.fetch(event);
      }
      return await fetch(event.request);
    })(),
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));