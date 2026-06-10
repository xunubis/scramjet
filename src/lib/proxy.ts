/**
 * Proxy engine helpers.
 *
 * Two completely separate stacks now:
 *
 *   Ultraviolet 3
 *     - URL-encoded iframe src style (cfg.prefix + cfg.encodeUrl(url)).
 *     - Transport: bare-mux + bare-v3, hitting our embedded bare server at
 *       /api/public/bare/v3/ (Cloudflare Worker, no external host needed).
 *
 *   Scramjet 2.0.67-alpha.1
 *     - Brand-new controller architecture: window owns a `Controller`
 *       which attaches to an iframe element and drives navigation via
 *       `frame.go(url)`. The controller talks RPC to the SW, which
 *       holds the ScramjetFetchHandler.
 *     - Transport: wisp WebSocket (LibcurlClient). Defaults to the
 *       Mercury Workshop public wisp endpoint so it works free with
 *       zero setup.
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
    $scramjet?: any;
    $scramjetController?: any;
    __prismScramjetController?: any;
    __prismBareConn?: any;
  }
}

export const SETTINGS_KEY = "prism.settings.v2";

export interface ProxySettings {
  bareUrl: string;
  wispUrl: string;
  defaultEngine: ProxyEngine;
}

export const BUILT_IN_BARE_PATH = "/api/public/bare/";
/** Public wisp endpoint run by Mercury Workshop. Free, no key. */
export const DEFAULT_WISP_URL = "wss://wisp.mercurywork.shop/";

function defaultBareUrl(): string {
  if (typeof window === "undefined") return BUILT_IN_BARE_PATH;
  return window.location.origin + BUILT_IN_BARE_PATH;
}

export const DEFAULT_SETTINGS: ProxySettings = {
  bareUrl: BUILT_IN_BARE_PATH,
  wispUrl: DEFAULT_WISP_URL,
  defaultEngine: "uv",
};

export function loadSettings(): ProxySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const base: ProxySettings = {
      ...DEFAULT_SETTINGS,
      bareUrl: defaultBareUrl(),
    };
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ProxySettings>;
    if (!parsed.bareUrl) parsed.bareUrl = base.bareUrl;
    if (!parsed.wispUrl) parsed.wispUrl = base.wispUrl;
    return { ...base, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS, bareUrl: defaultBareUrl() };
  }
}

export function saveSettings(s: ProxySettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

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

/* -------------------------------------------------------------------------- */
/* Service worker registration (shared)                                       */
/* -------------------------------------------------------------------------- */

let swPromise: Promise<ServiceWorker> | null = null;

function ensureServiceWorker(): Promise<ServiceWorker> {
  if (swPromise) return swPromise;
  swPromise = (async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are required.");
    }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    // Wait until a controller actually exists (first install needs reload otherwise).
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const onChange = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", onChange);
          resolve();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onChange);
        // Timeout fallback so the UI doesn't lock forever.
        setTimeout(resolve, 5000);
      });
    }
    return (
      navigator.serviceWorker.controller ?? reg.active ?? (await navigator.serviceWorker.ready).active!
    );
  })().catch((err) => {
    swPromise = null;
    throw err;
  });
  return swPromise;
}

/* -------------------------------------------------------------------------- */
/* Ultraviolet (bare-mux + bare-v3)                                           */
/* -------------------------------------------------------------------------- */

let uvPromise: Promise<void> | null = null;

export function ensureUltravioletReady(bareUrl: string): Promise<void> {
  if (uvPromise) return uvPromise;
  uvPromise = (async () => {
    if (!bareUrl) throw new Error("No bare server configured.");
    await loadScript("/baremux/index.js");
    await loadScript("/uv/uv.bundle.js");
    await loadScript("/uv/uv.config.js");
    const conn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    await conn.setTransport("/baremod/index.mjs", [bareUrl]);
    window.__prismBareConn = conn;
    await ensureServiceWorker();
  })().catch((err) => {
    uvPromise = null;
    throw err;
  });
  return uvPromise;
}

export async function updateBareTransport(bareUrl: string) {
  if (typeof window === "undefined" || !window.__prismBareConn) return;
  await window.__prismBareConn.setTransport("/baremod/index.mjs", [bareUrl]);
}

/** Encode a destination URL for UV (iframe-src style). */
export function buildUvUrl(target: string): string {
  const normalized = normalizeTarget(target);
  const cfg = window.__uv$config;
  if (!cfg) throw new Error("Ultraviolet not loaded yet.");
  return cfg.prefix + cfg.encodeUrl(normalized);
}

/* -------------------------------------------------------------------------- */
/* Scramjet 2 (controller + wisp libcurl transport)                           */
/* -------------------------------------------------------------------------- */

const SCRAMJET_PREFIX = "/~/sj/";
let scramjetPromise: Promise<any> | null = null;

export function ensureScramjetReady(wispUrl: string): Promise<any> {
  if (scramjetPromise) return scramjetPromise;
  scramjetPromise = (async () => {
    if (!wispUrl) throw new Error("No wisp URL configured.");
    // 1. Service worker + controller bundles need to be live in the SW first.
    const sw = await ensureServiceWorker();

    // 2. Load scramjet runtime, then controller API (order matters — controller
    //    asserts $scramjet exists and version-matches).
    await loadScript("/scram/scramjet.js");
    await loadScript("/scram-controller/controller.api.js");

    // 3. Dynamically import libcurl transport (it's ESM with a WASM payload).
    const libcurlMod: any = await import(
      /* @vite-ignore */ (`/libcurl/index.mjs` as string)
    );
    const LibcurlClient = libcurlMod.default ?? libcurlMod.LibcurlClient;
    const transport = new LibcurlClient({ wisp: wispUrl });

    // 4. Construct the Controller and wait for it to handshake with the SW.
    const { Controller } = window.$scramjetController;
    const controller = new Controller({
      serviceworker: sw,
      transport,
      config: {
        prefix: SCRAMJET_PREFIX,
        scramjetPath: "/scram/scramjet.js",
        injectPath: "/scram-controller/controller.inject.js",
        wasmPath: "/scram/scramjet.wasm",
      },
    });
    await controller.wait();
    window.__prismScramjetController = controller;
    return controller;
  })().catch((err) => {
    scramjetPromise = null;
    throw err;
  });
  return scramjetPromise;
}

/** Create a Scramjet Frame bound to an iframe element. */
export async function createScramjetFrame(iframeEl: HTMLIFrameElement, wispUrl: string) {
  const controller = await ensureScramjetReady(wispUrl);
  return controller.createFrame(iframeEl, { plugins: [] });
}

/* -------------------------------------------------------------------------- */

export function normalizeTarget(target: string): string {
  const t = target.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

export function otherEngine(e: ProxyEngine): ProxyEngine {
  return e === "uv" ? "scramjet" : "uv";
}

export function engineLabel(e: ProxyEngine): string {
  return e === "uv" ? "Ultraviolet" : "Scramjet";
}