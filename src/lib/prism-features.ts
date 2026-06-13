/**
 * Prism — cloaking, panic key, bookmarks, about:blank launcher.
 *
 * Pure helpers, no React. Persisted in localStorage so they survive reloads.
 */

export type CloakPreset = "none" | "google" | "classroom" | "drive" | "docs" | "wikipedia";

export interface CloakConfig {
  preset: CloakPreset;
  customTitle?: string;
  customIcon?: string;
}

export interface PanicConfig {
  /** Key name as reported by KeyboardEvent.key (e.g. "`", "Escape"). */
  key: string;
  url: string;
}

export interface Bookmark {
  id: string;
  label: string;
  url: string;
}

export const CLOAK_KEY = "prism.cloak.v1";
export const PANIC_KEY = "prism.panic.v1";
export const BOOKMARKS_KEY = "prism.bookmarks.v1";

export const CLOAK_PRESETS: Record<
  CloakPreset,
  { label: string; title: string; icon: string }
> = {
  none:       { label: "Off",            title: "Prism",                 icon: "/favicon.ico" },
  google:     { label: "Google",         title: "Google",                icon: "https://www.google.com/favicon.ico" },
  classroom:  { label: "Google Classroom", title: "Home",                icon: "https://ssl.gstatic.com/classroom/favicon.png" },
  drive:      { label: "Google Drive",   title: "My Drive — Google Drive", icon: "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png" },
  docs:       { label: "Google Docs",    title: "Untitled document — Google Docs", icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" },
  wikipedia:  { label: "Wikipedia",      title: "Wikipedia, the free encyclopedia", icon: "https://en.wikipedia.org/static/favicon/wikipedia.ico" },
};

export function loadCloak(): CloakConfig {
  try {
    const raw = localStorage.getItem(CLOAK_KEY);
    if (!raw) return { preset: "none" };
    return JSON.parse(raw) as CloakConfig;
  } catch {
    return { preset: "none" };
  }
}

export function saveCloak(c: CloakConfig) {
  localStorage.setItem(CLOAK_KEY, JSON.stringify(c));
  applyCloak(c);
}

/** Apply title + favicon to the current document. */
export function applyCloak(c: CloakConfig) {
  const p = CLOAK_PRESETS[c.preset];
  const title = c.customTitle?.trim() || p.title;
  const icon = c.customIcon?.trim() || p.icon;
  document.title = title;
  // Replace all <link rel="icon"> elements with a single one pointing at icon.
  document
    .querySelectorAll('link[rel~="icon"]')
    .forEach((el) => el.parentElement?.removeChild(el));
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = icon;
  document.head.appendChild(link);
}

export function loadPanic(): PanicConfig {
  try {
    const raw = localStorage.getItem(PANIC_KEY);
    if (raw) return JSON.parse(raw) as PanicConfig;
  } catch {
    /* ignore */
  }
  return { key: "`", url: "https://classroom.google.com/" };
}

export function savePanic(p: PanicConfig) {
  localStorage.setItem(PANIC_KEY, JSON.stringify(p));
}

export function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) return JSON.parse(raw) as Bookmark[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveBookmarks(b: Bookmark[]) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b));
}

/**
 * Open the current site inside an about:blank popup so it isn't visible in
 * browser history. The popup is fullscreen and same-origin (it loads our
 * own URL inside an iframe). Returns false if the popup is blocked.
 */
export function openAboutBlank(url = window.location.href): boolean {
  const w = window.open("about:blank", "_blank");
  if (!w) return false;
  const html = `<!DOCTYPE html><html><head><title>about:blank</title>
<link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body><iframe src="${url.replace(/"/g, "&quot;")}" allowfullscreen></iframe></body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  try {
    window.location.replace("https://www.google.com/");
  } catch {
    /* ignore — user may navigate back manually */
  }
  return true;
}