/**
 * Client-side proxy engine helpers for Ultraviolet + Scramjet.
 *
 * Both engines need:
 *   1. A service worker registered at a unique scope (UV: /uv/, SJ: /scramjet/)
 *   2. A "bare server" URL — the actual HTTP fetcher (TompHTTP bare v3).
 *      You host this yourself; we just point at it.
 *
 * The service-worker scripts live in /public/{uv,scramjet}/sw.js and load
 * the engine bundles from jsDelivr via importScripts. The bare URL is
 * pushed into each SW via postMessage after registration, then re-applied
 * any time the user changes it in settings.
 */

export type ProxyEngine = "uv" | "scramjet";

export const SETTINGS_KEY = "prism.settings.v1";

export interface ProxySettings {
  bareUrl: string;
  defaultEngine: ProxyEngine;
}

/**
 * The app ships with a built-in bare-v3 server mounted on the same Cloudflare
 * Worker (see src/routes/api/public/bare.v3.$.tsx). We default to that so the
 * proxy works for free out of the box — no Railway/Render/VPS required.
 * Users can override it in Settings if they want to point at their own bare host.
 */
export const BUILT_IN_BARE_PATH = "/api/public/bare/v3/";

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

const SW_PATHS: Record<ProxyEngine, { url: string; scope: string }> = {
  uv: { url: "/uv/sw.js", scope: "/uv/" },
  scramjet: { url: "/scramjet/sw.js", scope: "/scramjet/" },
};

/** Register a service worker for a given engine and push the bare URL into it. */
export async function ensureEngineReady(
  engine: ProxyEngine,
  bareUrl: string,
): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser has no service-worker support.");
  }
  if (!bareUrl) {
    throw new Error("No bare server configured. Open Settings to set one.");
  }

  const { url, scope } = SW_PATHS[engine];
  const reg = await navigator.serviceWorker.register(url, { scope });
  await navigator.serviceWorker.ready;

  const target = reg.active ?? reg.waiting ?? reg.installing;
  target?.postMessage({ type: "prism:set-bare", bareUrl });

  return reg;
}

/** Encode a destination URL the way each engine expects. */
export function buildProxiedUrl(engine: ProxyEngine, target: string): string {
  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  if (engine === "uv") {
    // UV's stock XOR codec (matches public/uv/config.js).
    return `/uv/service/${xorEncode(normalized)}`;
  }
  // Scramjet uses base64 of the URL under its scope.
  return `/scramjet/${btoa(normalized).replace(/=+$/, "")}`;
}

function xorEncode(str: string): string {
  if (!str) return str;
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += i % 2 ? String.fromCharCode(ch.charCodeAt(0) ^ 2) : ch;
  }
  return encodeURIComponent(out);
}

export function otherEngine(e: ProxyEngine): ProxyEngine {
  return e === "uv" ? "scramjet" : "uv";
}

export function engineLabel(e: ProxyEngine): string {
  return e === "uv" ? "Ultraviolet" : "Scramjet";
}