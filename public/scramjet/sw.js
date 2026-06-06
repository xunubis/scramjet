// Scramjet service worker — scope /scramjet/.
// Loads the latest Scramjet build from jsDelivr. Bare URL is set at
// runtime via "prism:set-bare" postMessage from the page.
importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.shared.js");
importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.worker.js");

let scramjet;
let bareUrl = "";

function ensureController() {
  if (scramjet) return scramjet;
  // ScramjetServiceWorker is exposed by scramjet.worker.js.
  // eslint-disable-next-line no-undef
  scramjet = new ScramjetServiceWorker({
    prefix: "/scramjet/",
    codec: { encode: (s) => btoa(s), decode: (s) => atob(s) },
    files: {
      wasm: "https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.wasm.wasm",
      client: "https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.client.js",
      shared: "https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.shared.js",
      sync: "https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet/dist/scramjet.sync.js",
    },
    bare: { url: bareUrl },
  });
  return scramjet;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "prism:set-bare" && typeof data.bareUrl === "string") {
    bareUrl = data.bareUrl;
    if (scramjet) scramjet.bare = { url: bareUrl };
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/scramjet/")) {
    try {
      const c = ensureController();
      event.respondWith(c.fetch(event));
      return;
    } catch (err) {
      event.respondWith(new Response("Scramjet error: " + err.message, { status: 500 }));
      return;
    }
  }
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));