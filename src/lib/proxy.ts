/**
 * Client-side proxy engine helpers for Ultraviolet 3 + Scramjet 1.
 *
 * Both engines now share bare-mux as their transport layer. We use the
 * `bare-as-module3` transport pointing at our embedded bare-v3 server at
 * /api/public/bare/ (see src/routes/api/public/bare.$.tsx) so the whole
 * stack runs on the same Cloudflare Worker for free.
 *
 * A single SW at /sw.js handles both engines; UV owns /uv/service/* and
 * Scramjet owns whatever prefix its controller registers (we use /scramjet/).
 */

export type ProxyEngine = "uv" | "scramjet";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    BareMux?: any;
    Ultraviolet?: any;
    __uv$config?: {
      prefix: string;
      encodeUrl: (s: string) => string;
      decodeUrl: (s: string) => string;
      [k: string]: unknown;
    };
    $scramjetLoadController?: () => { ScramjetController: any };
    __prismScramjet?: any;
    __prismBareConn?: any;
  }
}

export const SETTINGS_KEY = "prism.settings.v1";

export interface ProxySettings {
  bareUrl: string;
  defaultEngine: ProxyEngine;
}

/**
 * Bare-as-module3 builds the request URL as `<server>v${version}/`, so the
 * configured value MUST be the bare base WITHOUT the v3 segment — the client
 * appends it. Our embedded bare server is mounted at /api/public/bare/$ and
 * accepts /api/public/bare/v3/.
 */
export const BUILT_IN_BARE_PATH = "/api/public/bare/";

function defaultBareUrl(): string {
  if (typeof window === "undefined") return BUILT_IN_BARE_PATH;
  return window.location.origin + BUILT_IN_BARE_PATH;
}

export const DEFAULT_SETTINGS: ProxySettings = {
  bareUrl: BUILT_IN_BARE_PATH,
  defaultEngine: "uv",
};

export function loadSettings(): ProxySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const base: ProxySettings = { ...DEFAULT_SETTINGS, bareUrl: defaultBareUrl() };
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ProxySettings>;
    // If the user never configured a bare server (or saved a blank from older
    // versions), fall back to the built-in same-origin one.
    if (!parsed.bareUrl) parsed.bareUrl = base.bareUrl;
    return { ...base, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS, bareUrl: defaultBareUrl() };
  }
}

export function saveSettings(s: ProxySettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const SCRAMJET_PREFIX = "/scramjet/";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-prism-src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.prismSrc = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let initPromise: Promise<void> | null = null;

/**
 * One-time bootstrap: loads bare-mux + UV + Scramjet libraries in the page,
 * wires the transport, initializes the Scramjet controller, and registers /sw.js.
 */
export function ensureEngineReady(bareUrl: string): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      throw new Error("This browser has no service-worker support.");
    }
    if (!bareUrl) {
      throw new Error("No bare server configured.");
    }

    // Order matters: UV bundle exposes `Ultraviolet`, which uv.config.js reads.
    await loadScript("/baremux/index.js");
    await loadScript("/uv/uv.bundle.js");
    await loadScript("/uv/uv.config.js");
    await loadScript("/scram/scramjet.all.js");

    // Bare-mux runs as a SharedWorker; bare-as-module3 talks bare-v3 to our
    // same-origin endpoint, which then makes the real outbound fetch.
    const conn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    await conn.setTransport("/baremod/index.mjs", [bareUrl]);
    window.__prismBareConn = conn;

    // Scramjet controller — sets the SW-readable config and mounts its prefix.
    if (!window.__prismScramjet && window.$scramjetLoadController) {
      const { ScramjetController } = window.$scramjetLoadController();
      const scramjet = new ScramjetController({
        prefix: SCRAMJET_PREFIX,
        files: {
          wasm: "/scram/scramjet.wasm.wasm",
          all: "/scram/scramjet.all.js",
          sync: "/scram/scramjet.sync.js",
        },
      });
      await scramjet.init();
      window.__prismScramjet = scramjet;
    }

    // Single SW for both engines, scoped to /.
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  })().catch((err) => {
    // Reset so the next attempt retries from scratch instead of caching the failure.
    initPromise = null;
    throw err;
  });
  return initPromise;
}

/** Update the bare transport without reloading. Call after settings save. */
export async function updateBareTransport(bareUrl: string) {
  if (typeof window === "undefined" || !window.__prismBareConn) return;
  await window.__prismBareConn.setTransport("/baremod/index.mjs", [bareUrl]);
}

/** Encode a destination URL for the chosen engine. Requires ensureEngineReady to have resolved. */
export function buildProxiedUrl(engine: ProxyEngine, target: string): string {
  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  if (engine === "uv") {
    const cfg = window.__uv$config;
    if (!cfg) throw new Error("Ultraviolet not loaded yet.");
    return cfg.prefix + cfg.encodeUrl(normalized);
  }
  const sj = window.__prismScramjet;
  if (!sj) throw new Error("Scramjet not loaded yet.");
  return sj.encodeUrl(normalized);
}

export function otherEngine(e: ProxyEngine): ProxyEngine {
  return e === "uv" ? "scramjet" : "uv";
}

export function engineLabel(e: ProxyEngine): string {
  return e === "uv" ? "Ultraviolet" : "Scramjet";
}