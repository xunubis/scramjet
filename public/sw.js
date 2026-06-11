/*
 * Prism combined service worker.
 *
 * Routes:
 *   /uv/service/*  -> Ultraviolet 3 (bare-v3 transport via bare-mux)
 *   /~/sj/*        -> Scramjet 2.0.67-alpha.1 (controller package, wisp transport)
 */

// --- Ultraviolet ---
importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts("/uv/uv.sw.js");

// --- Scramjet 2 (controller SW only; the scramjet runtime is loaded into pages/frames, NOT here.
//     scramjet.js touches `document` at evaluation time and would break the entire SW.) ---
importScripts("/scram-controller/controller.sw.js");

// eslint-disable-next-line no-undef
const uv = new UVServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith(self.__uv$config.prefix)) {
    event.respondWith(uv.fetch(event));
    return;
  }

  // eslint-disable-next-line no-undef
  if (typeof $scramjetController !== "undefined" && $scramjetController.shouldRoute(event)) {
    // eslint-disable-next-line no-undef
    event.respondWith($scramjetController.route(event));
    return;
  }
  // Default: let the browser handle it.
});