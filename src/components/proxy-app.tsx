import { useEffect, useRef, useState } from "react";
import {
  buildUvUrl,
  createScramjetFrame,
  DEFAULT_SETTINGS,
  engineLabel,
  ensureUltravioletReady,
  ensureScramjetReady,
  loadSettings,
  normalizeTarget,
  otherEngine,
  type ProxyEngine,
  type ProxySettings,
  saveSettings,
  updateBareTransport,
} from "@/lib/proxy";

interface Tab {
  id: string;
  title: string;
  address: string;
  /** UV: encoded iframe src. Scramjet: empty (controller drives the iframe). */
  uvSrc: string;
  engine: ProxyEngine;
  loading: boolean;
  errored: boolean;
  errorMsg?: string;
}

function newTab(engine: ProxyEngine): Tab {
  return {
    id: crypto.randomUUID(),
    title: "New tab",
    address: "",
    uvSrc: "",
    engine,
    loading: false,
    errored: false,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ProxyApp() {
  const [settings, setSettings] = useState<ProxySettings>(DEFAULT_SETTINGS);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  /** scramjet Frame instances per tab id */
  const scramFrames = useRef<Record<string, any>>({});

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    const first = newTab(s.defaultEngine);
    setTabs([first]);
    setActiveId(first.id);
    // Pre-warm the default engine so the first navigation isn't slow.
    if (s.defaultEngine === "uv") {
      void ensureUltravioletReady(s.bareUrl).catch((e) =>
        console.warn("[prism] UV warmup failed:", e),
      );
    } else {
      void ensureScramjetReady(s.wispUrl).catch((e) =>
        console.warn("[prism] Scramjet warmup failed:", e),
      );
    }
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  function updateTab(id: string, patch: Partial<Tab>) {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function navigate(id: string, rawAddress: string) {
    const address = rawAddress.trim();
    if (!address) return;
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    const target = normalizeTarget(address);
    try {
      updateTab(id, { loading: true, errored: false, errorMsg: undefined, address });
      if (tab.engine === "uv") {
        await ensureUltravioletReady(settings.bareUrl);
        updateTab(id, { uvSrc: buildUvUrl(target), title: address });
      } else {
        let frame = scramFrames.current[id];
        if (!frame) {
          const el = iframeRefs.current[id];
          if (!el) throw new Error("Iframe not ready");
          frame = await createScramjetFrame(el, settings.wispUrl);
          scramFrames.current[id] = frame;
        }
        await frame.go(target);
        updateTab(id, { title: address, loading: false });
      }
    } catch (err) {
      console.error("[prism] navigate failed:", err);
      updateTab(id, {
        errored: true,
        loading: false,
        errorMsg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function switchEngine(id: string, engine: ProxyEngine) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    // Tear down the scramjet frame if we're leaving SJ for UV.
    if (t.engine === "scramjet" && engine === "uv" && scramFrames.current[id]) {
      try {
        scramFrames.current[id]?.destroy?.();
      } catch {
        /* ignore */
      }
      delete scramFrames.current[id];
    }
    updateTab(id, { engine, uvSrc: "" });
    if (t.address) {
      setTimeout(() => navigate(id, t.address), 0);
    }
  }

  function closeTab(id: string) {
    try {
      scramFrames.current[id]?.destroy?.();
    } catch {
      /* ignore */
    }
    delete scramFrames.current[id];
    delete iframeRefs.current[id];
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (next.length === 0) {
        const t = newTab(settings.defaultEngine);
        setActiveId(t.id);
        return [t];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  }

  function addTab() {
    const t = newTab(settings.defaultEngine);
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
  }

  function reload(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (t.engine === "scramjet" && scramFrames.current[id]) {
      try {
        scramFrames.current[id].reload();
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    const ref = iframeRefs.current[id];
    if (ref?.contentWindow) ref.contentWindow.location.reload();
  }

  function back(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (t.engine === "scramjet") {
      scramFrames.current[id]?.back?.();
    } else {
      iframeRefs.current[id]?.contentWindow?.history.back();
    }
  }
  function forward(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (t.engine === "scramjet") {
      scramFrames.current[id]?.forward?.();
    } else {
      iframeRefs.current[id]?.contentWindow?.history.forward();
    }
  }

  function home(id: string) {
    if (scramFrames.current[id]) {
      try { scramFrames.current[id].destroy?.(); } catch { /* ignore */ }
      delete scramFrames.current[id];
    }
    updateTab(id, { address: "", uvSrc: "", title: "New tab", errored: false });
  }

  function fallback(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    switchEngine(id, otherEngine(t.engine));
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 prism-wallpaper" aria-hidden />

      <div className="relative z-10 flex flex-col h-full">
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onAdd={addTab}
        />

        {activeTab && (
          <AddressBar
            key={activeTab.id}
            tab={activeTab}
            onNavigate={(addr) => navigate(activeTab.id, addr)}
            onBack={() => back(activeTab.id)}
            onForward={() => forward(activeTab.id)}
            onReload={() => reload(activeTab.id)}
            onHome={() => home(activeTab.id)}
            onSwitch={(e) => switchEngine(activeTab.id, e)}
            onFallback={() => fallback(activeTab.id)}
            onSettings={() => setSettingsOpen(true)}
          />
        )}

        <div className="relative flex-1">
          {tabs.map((t) => {
            const showBlank = !t.address && t.engine === "uv";
            // Scramjet always needs the iframe mounted (controller binds to it),
            // even on a blank tab — we show the BlankTab overlay if no address yet.
            return (
              <div
                key={t.id}
                className={
                  "absolute inset-0 " +
                  (t.id === activeId ? "block" : "hidden")
                }
              >
                {showBlank ? (
                  <BlankTab onPick={(url) => navigate(t.id, url)} />
                ) : t.engine === "uv" ? (
                  <iframe
                    ref={(el) => {
                      iframeRefs.current[t.id] = el;
                    }}
                    src={t.uvSrc}
                    title={t.title}
                    className="h-full w-full border-0 bg-white"
                    onLoad={() => updateTab(t.id, { loading: false })}
                    sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
                  />
                ) : (
                  <>
                    <iframe
                      ref={(el) => {
                        iframeRefs.current[t.id] = el;
                      }}
                      title={t.title}
                      className="h-full w-full border-0 bg-white"
                      onLoad={() => updateTab(t.id, { loading: false })}
                    />
                    {!t.address && (
                      <div className="absolute inset-0">
                        <BlankTab onPick={(url) => navigate(t.id, url)} />
                      </div>
                    )}
                  </>
                )}

                {t.errored && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/85 backdrop-blur-sm">
                    <div className="max-w-md rounded-2xl border border-destructive/40 bg-card/90 p-6 text-center shadow-xl">
                      <p className="text-sm text-destructive">
                        Failed to load through {engineLabel(t.engine)}.
                      </p>
                      {t.errorMsg && (
                        <p className="mt-1 break-all text-[11px] text-muted-foreground">
                          {t.errorMsg}
                        </p>
                      )}
                      <button
                        onClick={() => fallback(t.id)}
                        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Retry with {engineLabel(otherEngine(t.engine))}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setSettingsOpen(false);
            void updateBareTransport(s.bareUrl);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border/40 bg-background/40 px-2 pt-2 backdrop-blur">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={
              "group flex max-w-[220px] min-w-[140px] items-center gap-2 rounded-t-md px-3 py-1.5 text-xs transition " +
              (active
                ? "bg-card/80 text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-card/40 hover:text-foreground")
            }
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background:
                  t.engine === "uv"
                    ? "oklch(0.78 0.18 280)"
                    : "oklch(0.82 0.16 200)",
                boxShadow: "0 0 6px currentColor",
                color:
                  t.engine === "uv"
                    ? "oklch(0.78 0.18 280)"
                    : "oklch(0.82 0.16 200)",
              }}
            />
            <span className="flex-1 truncate text-left">{t.title}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
              className="ml-1 rounded px-1 text-muted-foreground opacity-70 hover:bg-background hover:text-foreground hover:opacity-100"
              aria-label="Close tab"
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="ml-1 rounded-md px-2 py-1 text-base text-muted-foreground hover:bg-card/60 hover:text-foreground"
        aria-label="New tab"
      >
        +
      </button>
    </div>
  );
}

function AddressBar({
  tab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHome,
  onSwitch,
  onFallback,
  onSettings,
}: {
  tab: Tab;
  onNavigate: (addr: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onSwitch: (e: ProxyEngine) => void;
  onFallback: () => void;
  onSettings: () => void;
}) {
  const [value, setValue] = useState(tab.address);
  useEffect(() => setValue(tab.address), [tab.id, tab.address]);

  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-background/40 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1 pr-1 text-muted-foreground">
        <NavIconBtn label="Back" onClick={onBack}>←</NavIconBtn>
        <NavIconBtn label="Forward" onClick={onForward}>→</NavIconBtn>
        <NavIconBtn label="Reload" onClick={onReload}>↻</NavIconBtn>
        <NavIconBtn label="Home" onClick={onHome}>⌂</NavIconBtn>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNavigate(value);
        }}
        className="flex flex-1 items-center gap-2 rounded-full border border-primary/30 bg-card/60 px-4 py-1.5 backdrop-blur focus-within:border-primary/60"
      >
        <span className="text-muted-foreground" aria-hidden>✦</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search the web or enter a URL"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          spellCheck={false}
        />
        {tab.loading && (
          <span className="ml-2 text-xs text-muted-foreground">loading…</span>
        )}
      </form>

      <div className="flex overflow-hidden rounded-full border border-border/60 text-[11px]">
        <button
          onClick={() => onSwitch("uv")}
          className={
            "px-2.5 py-1 transition " +
            (tab.engine === "uv"
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground")
          }
        >
          UV
        </button>
        <button
          onClick={() => onSwitch("scramjet")}
          className={
            "px-2.5 py-1 transition " +
            (tab.engine === "scramjet"
              ? "bg-accent text-accent-foreground"
              : "bg-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground")
          }
        >
          SJ
        </button>
      </div>

      <button
        onClick={onFallback}
        disabled={!tab.address}
        className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-card/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="Reload through the other engine"
      >
        ↻ Fallback
      </button>
      <button
        onClick={onSettings}
        className="rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-card/60 hover:text-foreground"
      >
        ⚙
      </button>
    </div>
  );
}

function NavIconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-base text-muted-foreground hover:bg-card/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function BlankTab({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const shortcuts = [
    { label: "YouTube", url: "youtube.com", domain: "youtube.com" },
    { label: "Discord", url: "discord.com", domain: "discord.com" },
    { label: "GitHub", url: "github.com", domain: "github.com" },
    { label: "Reddit", url: "reddit.com", domain: "reddit.com" },
    { label: "Wikipedia", url: "wikipedia.org", domain: "wikipedia.org" },
    { label: "Spotify", url: "open.spotify.com", domain: "spotify.com" },
    { label: "Twitch", url: "twitch.tv", domain: "twitch.tv" },
    { label: "X", url: "x.com", domain: "x.com" },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    onPick(v);
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-background px-6 text-center prism-wallpaper">
      <h1
        className="select-none text-6xl font-semibold tracking-tight sm:text-7xl"
        style={{
          fontFamily: "var(--font-display)",
          letterSpacing: "-0.03em",
        }}
      >
        Prism
        <span style={{ color: "var(--primary)" }}>.</span>
      </h1>
      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        a calm corner of the web
      </p>

      <form
        onSubmit={submit}
        className="mt-10 flex w-full max-w-2xl items-center gap-3 rounded-full border bg-card/40 px-5 py-3 backdrop-blur transition focus-within:border-primary/60"
        style={{ borderColor: "color-mix(in oklab, var(--primary) 35%, transparent)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
          style={{
            background: "var(--primary)",
            boxShadow: "0 0 18px color-mix(in oklab, var(--primary) 60%, transparent)",
          }}
          aria-hidden
        >
          ✦
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search DuckDuckGo or type a URL…"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          autoFocus
          spellCheck={false}
        />
      </form>

      <div className="mt-12 flex flex-wrap items-start justify-center gap-5">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.url)}
            className="group flex w-20 flex-col items-center gap-2"
          >
            <span
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-card/60 transition group-hover:scale-105 group-hover:border-primary/60"
              style={{
                borderColor: "color-mix(in oklab, var(--foreground) 10%, transparent)",
                boxShadow: "0 6px 20px -12px rgba(0,0,0,0.6)",
              }}
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=64`}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                className="h-8 w-8"
              />
            </span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground">
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsSheet({
  settings,
  onClose,
  onSave,
}: {
  settings: ProxySettings;
  onClose: () => void;
  onSave: (s: ProxySettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-primary/20 bg-card/90 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              UV runs through bare-v3 · Scramjet 2 runs through wisp.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <Field
            label="Bare server URL (Ultraviolet)"
            value={draft.bareUrl}
            onChange={(v) => setDraft({ ...draft, bareUrl: v })}
            help="Defaults to the built-in /api/public/bare/ on this domain."
          />
          <Field
            label="Wisp URL (Scramjet)"
            value={draft.wispUrl}
            onChange={(v) => setDraft({ ...draft, wispUrl: v })}
            help="Defaults to wss://wisp.mercurywork.shop/ — free public endpoint."
          />

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Default engine
            </label>
            <div className="mt-2 flex overflow-hidden rounded-md border border-border/60">
              {(["uv", "scramjet"] as ProxyEngine[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setDraft({ ...draft, defaultEngine: e })}
                  className={
                    "flex-1 px-3 py-2 text-sm " +
                    (draft.defaultEngine === e
                      ? e === "uv"
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary")
                  }
                >
                  {engineLabel(e)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const bare = draft.bareUrl.trim();
              const bareNorm = bare && !bare.endsWith("/") ? bare + "/" : bare;
              onSave({ ...draft, bareUrl: bareNorm, wispUrl: draft.wispUrl.trim() });
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
        style={{ fontFamily: "var(--font-mono)" }}
        spellCheck={false}
      />
      <p className="mt-2 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}