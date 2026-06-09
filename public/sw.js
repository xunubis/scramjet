/*
 * Prism combined service worker.
 * Hosts both Ultraviolet (UV) and Scramjet engines at root scope.
 * Routing:
 *   /uv/service/*  -> UV
 *   /scramjet/*    -> Scramjet  (prefix set by ScramjetController in the page)
 */

importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts("/uv/uv.sw.js");
importScripts("/scram/scramjet.all.js");

// eslint-disable-next-line no-undef
const uv = new UVServiceWorker();
// eslint-disable-next-line no-undef
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
  await scramjet.loadConfig();

  const url = new URL(event.request.url);
  // UV first — its prefix is /uv/service/
  if (url.pathname.startsWith(self.__uv$config.prefix)) {
    return uv.fetch(event);
  }
  // Then Scramjet — it owns whatever prefix the page controller set.
  if (scramjet.route(event)) {
    return scramjet.fetch(event);
  }
  return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));