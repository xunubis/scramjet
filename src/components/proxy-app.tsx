import { useEffect, useRef, useState } from "react";
import {
  buildProxiedUrl,
  DEFAULT_SETTINGS,
  engineLabel,
  ensureEngineReady,
  loadSettings,
  otherEngine,
  type ProxyEngine,
  type ProxySettings,
  saveSettings,
} from "@/lib/proxy";

interface Tab {
  id: string;
  title: string;
  address: string; // what the user typed
  src: string; // resolved proxied iframe src (empty = blank/new tab)
  engine: ProxyEngine;
  loading: boolean;
  errored: boolean;
}

function newTab(engine: ProxyEngine): Tab {
  return {
    id: crypto.randomUUID(),
    title: "New tab",
    address: "",
    src: "",
    engine,
    loading: false,
    errored: false,
  };
}

export function ProxyApp() {
  const [settings, setSettings] = useState<ProxySettings>(DEFAULT_SETTINGS);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  // Hydrate from localStorage on mount
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    const first = newTab(s.defaultEngine);
    setTabs([first]);
    setActiveId(first.id);
    if (!s.bareUrl) setSettingsOpen(true);
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
    if (!settings.bareUrl) {
      setSettingsOpen(true);
      return;
    }
    try {
      updateTab(id, { loading: true, errored: false, address });
      await ensureEngineReady(tab.engine, settings.bareUrl);
      const src = buildProxiedUrl(tab.engine, address);
      updateTab(id, { src, title: address });
    } catch (err) {
      console.error(err);
      updateTab(id, { errored: true, loading: false });
    }
  }

  function switchEngine(id: string, engine: ProxyEngine) {
    updateTab(id, { engine });
    const t = tabs.find((x) => x.id === id);
    if (t && t.address) {
      // Re-navigate through the new engine.
      setTimeout(() => navigate(id, t.address), 0);
    }
  }

  function closeTab(id: string) {
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
    const ref = iframeRefs.current[id];
    if (ref?.contentWindow) ref.contentWindow.location.reload();
  }

  function fallback(id: string) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    switchEngine(id, otherEngine(t.engine));
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
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
          onReload={() => reload(activeTab.id)}
          onSwitch={(e) => switchEngine(activeTab.id, e)}
          onFallback={() => fallback(activeTab.id)}
          onSettings={() => setSettingsOpen(true)}
          bareConfigured={Boolean(settings.bareUrl)}
        />
      )}

      <div className="relative flex-1 bg-card">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={
              "absolute inset-0 " + (t.id === activeId ? "block" : "hidden")
            }
          >
            {!t.src ? (
              <BlankTab onPick={(url) => navigate(t.id, url)} />
            ) : (
              <iframe
                ref={(el) => {
                  iframeRefs.current[t.id] = el;
                }}
                src={t.src}
                title={t.title}
                className="h-full w-full border-0 bg-white"
                onLoad={() => updateTab(t.id, { loading: false })}
                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
              />
            )}
            {t.errored && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm">
                <div className="max-w-md rounded-lg border border-destructive/40 bg-card p-6 text-center">
                  <p className="text-sm text-destructive">
                    Failed to load through {engineLabel(t.engine)}.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Check that your bare server is reachable, or try the other engine.
                  </p>
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
        ))}
      </div>

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

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
    <div className="flex items-center gap-1 bg-background px-2 pt-2">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={
              "group flex max-w-[220px] min-w-[140px] items-center gap-2 rounded-md px-3 py-1.5 text-xs transition " +
              (active
                ? "bg-secondary text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground")
            }
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background:
                  t.engine === "uv"
                    ? "oklch(0.72 0.19 50)"
                    : "oklch(0.78 0.16 200)",
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
        className="ml-1 rounded-md px-2 py-1 text-base text-muted-foreground hover:bg-secondary hover:text-foreground"
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
  onReload,
  onSwitch,
  onFallback,
  onSettings,
  bareConfigured,
}: {
  tab: Tab;
  onNavigate: (addr: string) => void;
  onReload: () => void;
  onSwitch: (e: ProxyEngine) => void;
  onFallback: () => void;
  onSettings: () => void;
  bareConfigured: boolean;
}) {
  const [value, setValue] = useState(tab.address);
  useEffect(() => setValue(tab.address), [tab.id, tab.address]);

  return (
    <div className="flex items-center gap-2 bg-background px-3 py-2">
      <div className="flex items-center gap-1 pr-1 text-muted-foreground">
        <NavIconBtn label="Back">←</NavIconBtn>
        <NavIconBtn label="Forward">→</NavIconBtn>
        <NavIconBtn label="Reload" onClick={onReload}>↻</NavIconBtn>
        <NavIconBtn label="Home" onClick={() => onNavigate("")}>⌂</NavIconBtn>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNavigate(value);
        }}
        className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 focus-within:border-primary/60"
      >
        <span className="text-muted-foreground" aria-hidden>🔒</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search the web"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          spellCheck={false}
        />
        {tab.loading && (
          <span className="ml-2 text-xs text-muted-foreground">loading…</span>
        )}
      </form>

      <div className="flex overflow-hidden rounded-full border border-border text-[11px]">
        <button
          onClick={() => onSwitch("uv")}
          className={
            "px-2.5 py-1 " +
            (tab.engine === "uv"
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground")
          }
        >
          UV
        </button>
        <button
          onClick={() => onSwitch("scramjet")}
          className={
            "px-2.5 py-1 " +
            (tab.engine === "scramjet"
              ? "bg-accent text-accent-foreground"
              : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground")
          }
        >
          SJ
        </button>
      </div>

      <button
        onClick={onFallback}
        disabled={!tab.address}
        className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="Reload through the other engine"
      >
        ↻ Fallback
      </button>
      <button
        onClick={onSettings}
        className="rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
        title={bareConfigured ? "bare ready" : "bare unset"}
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
      className="flex h-8 w-8 items-center justify-center rounded-full text-base text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function BlankTab({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const shortcuts = [
    { label: "TikTok", url: "tiktok.com", letter: "T", color: "oklch(0.55 0.18 20)" },
    { label: "Discord", url: "discord.com", letter: "D", color: "oklch(0.55 0.16 270)" },
    { label: "GitHub", url: "github.com", letter: "G", color: "oklch(0.3 0.01 280)" },
    { label: "YouTube", url: "youtube.com", letter: "Y", color: "oklch(0.55 0.22 25)" },
    { label: "Wikipedia", url: "wikipedia.org", letter: "W", color: "oklch(0.3 0.01 280)" },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const looksLikeUrl = /^https?:\/\//i.test(v) || /\.[a-z]{2,}$/i.test(v);
    onPick(looksLikeUrl ? v : `duckduckgo.com/?q=${encodeURIComponent(v)}`);
  }

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center bg-background px-6 text-center"
      style={{ backgroundImage: "var(--gradient-aurora)" }}
    >
      <h1
        className="select-none text-7xl font-bold tracking-tight text-foreground sm:text-8xl"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.04em" }}
      >
        Prism
        <span style={{ color: "var(--primary)" }}>.</span>
      </h1>

      <form
        onSubmit={submit}
        className="mt-10 flex w-full max-w-2xl items-center gap-3 rounded-full border bg-card/70 px-5 py-3 backdrop-blur transition focus-within:border-primary/60"
        style={{ borderColor: "color-mix(in oklab, var(--primary) 35%, transparent)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
          style={{ background: "var(--primary)" }}
          aria-hidden
        >
          P
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

      <div className="mt-12 flex flex-wrap items-start justify-center gap-6">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.url)}
            className="group flex w-20 flex-col items-center gap-2"
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold text-foreground transition group-hover:scale-105"
              style={{
                background: s.color,
                boxShadow: "0 8px 24px -12px rgba(0,0,0,0.6)",
              }}
            >
              {s.letter}
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
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Both engines route through your bare server.
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
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Bare server URL
            </label>
            <input
              value={draft.bareUrl}
              onChange={(e) => setDraft({ ...draft, bareUrl: e.target.value })}
              placeholder="https://bare.example.com/"
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
              style={{ fontFamily: "var(--font-mono)" }}
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Run <code className="text-foreground">@tomphttp/bare-server-node</code>{" "}
              and paste its public URL (must end with <code>/</code>).
            </p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Default engine
            </label>
            <div className="mt-2 flex overflow-hidden rounded-md border border-border">
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
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const bareUrl = draft.bareUrl.trim();
              const normalized = bareUrl && !bareUrl.endsWith("/") ? bareUrl + "/" : bareUrl;
              onSave({ ...draft, bareUrl: normalized });
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