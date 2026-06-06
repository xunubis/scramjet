// Default Ultraviolet config. `bare` is overridden at runtime by a
// "prism:set-bare" postMessage from the page once the user saves settings.
self.__uv$config = {
  prefix: "/uv/service/",
  bare: "",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  client: "/uv/uv.client.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/config.js",
  sw: "/uv/sw.js",
};