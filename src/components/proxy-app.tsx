import { useEffect, useRef, useState } from "react";
import {
  Home as HomeIcon,
  Gamepad2,
  Layers,
  Wrench,
  MessageCircle,
  Settings as SettingsIcon,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  X,
  Plus,
  Trash2,
  Star,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import {
  ACCENTS,
  buildUvUrl,
  clearProxyState,
  createScramjetFrame,
  DEFAULT_SETTINGS,
  engineLabel,
  ensureUltravioletReady,
  loadSettings,
  normalizeTarget,
  otherEngine,
  prewarmEngines,
  type ProxyEngine,
  type ProxySettings,
  saveSettings,
  updateBareTransport,
} from "@/lib/proxy";
import {
  applyCloak,
  CLOAK_PRESETS,
  type Bookmark,
  type CloakConfig,
  type CloakPreset,
  type PanicConfig,
  loadBookmarks,
  loadCloak,
  loadPanic,
  openAboutBlank,
  saveBookmarks,
  saveCloak,
  savePanic,
} from "@/lib/prism-features";

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
  const [cloak, setCloak] = useState<CloakConfig>({ preset: "none" });
  const [panic, setPanic] = useState<PanicConfig>({ key: "`", url: "https://classroom.google.com/" });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [quickCheck, setQuickCheck] = useState(false);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  /** scramjet Frame instances per tab id */
  const scramFrames = useRef<Record<string, any>>({});

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    const first = newTab(s.defaultEngine);
    setTabs([first]);
    setActiveId(first.id);
    // Pre-warm BOTH engines so first navigation and engine switches feel instant.
    prewarmEngines(s);
    const c = loadCloak();
    setCloak(c);
    applyCloak(c);
    setPanic(loadPanic());
    setBookmarks(loadBookmarks());
    if (typeof window !== "undefined" && !localStorage.getItem("prism-quickcheck-dismissed")) {
      setQuickCheck(true);
    }
  }, []);

  // Shift+Space anywhere focuses the home-tab search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.shiftKey && e.code === "Space") {
        const el = document.querySelector<HTMLInputElement>("[data-prism-search]");
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Panic key — instantly redirects the whole window away from Prism.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!panic.key) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === panic.key) {
        e.preventDefault();
        window.location.replace(panic.url || "https://www.google.com/");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panic]);

  // Apply appearance settings (reduced motion + accent theme) to the document.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("prism-no-motion", settings.reducedMotion);
    root.dataset.accent = settings.accent;
  }, [settings.reducedMotion, settings.accent]);

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
        updateTab(id, { title: address });
        // Safety: never leave the skeleton up forever if the load event is swallowed.
        window.setTimeout(() => updateTab(id, { loading: false }), 12000);
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
      <div className="prism-stars" aria-hidden>
        <span className="prism-falling" style={{ left: "8%",  animationDuration: "9s",  animationDelay: "0s" }} />
        <span className="prism-falling" style={{ left: "22%", animationDuration: "13s", animationDelay: "2s" }} />
        <span className="prism-falling" style={{ left: "37%", animationDuration: "11s", animationDelay: "4s" }} />
        <span className="prism-falling" style={{ left: "52%", animationDuration: "14s", animationDelay: "1s" }} />
        <span className="prism-falling" style={{ left: "66%", animationDuration: "10s", animationDelay: "6s" }} />
        <span className="prism-falling" style={{ left: "78%", animationDuration: "12s", animationDelay: "3s" }} />
        <span className="prism-falling" style={{ left: "91%", animationDuration: "15s", animationDelay: "5s" }} />
        <span className="prism-shoot" style={{ top: "12%", animationDelay: "2s",  animationDuration: "8s" }} />
        <span className="prism-shoot" style={{ top: "34%", animationDelay: "11s", animationDuration: "9s" }} />
        <span className="prism-shoot" style={{ top: "58%", animationDelay: "20s", animationDuration: "10s" }} />
      </div>

      <div className="relative z-10 flex h-full flex-col pr-14">
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
                  "absolute inset-0 prism-smooth " +
                  (t.id === activeId
                    ? "block prism-tab-enter opacity-100"
                    : "pointer-events-none opacity-0 invisible")
                }
              >
                {showBlank ? (
                  <BlankTab onPick={(url) => navigate(t.id, url)} />
                ) : t.engine === "uv" ? (
                  <iframe
                    ref={(el) => {
                      iframeRefs.current[t.id] = el;
                    }}
                    src={t.uvSrc || undefined}
                    title={t.title}
                    className="h-full w-full border-0 bg-background"
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
                      className="h-full w-full border-0 bg-background"
                      onLoad={() => updateTab(t.id, { loading: false })}
                    />
                    {!t.address && (
                      <div className="absolute inset-0">
                        <BlankTab onPick={(url) => navigate(t.id, url)} />
                      </div>
                    )}
                  </>
                )}

                <LoadingSkeleton visible={t.loading && !t.errored && !showBlank} />

                {t.errored && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/85 backdrop-blur-sm prism-enter">
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
                        className="prism-smooth mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
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

      <SideRail
        onHome={() => activeTab && home(activeTab.id)}
        onSettings={() => setSettingsOpen(true)}
        onGames={() => activeTab && navigate(activeTab.id, "https://now.gg")}
        onApps={() => activeTab && navigate(activeTab.id, "https://github.com/topics/proxy")}
        onTools={() => activeTab && navigate(activeTab.id, "https://duckduckgo.com")}
        onDiscord={() => activeTab && navigate(activeTab.id, "https://discord.com")}
        onCloak={() => openAboutBlank()}
      />

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          cloak={cloak}
          panic={panic}
          bookmarks={bookmarks}
          onClose={() => setSettingsOpen(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setSettingsOpen(false);
            void updateBareTransport(s.bareUrl);
          }}
          onCloakChange={(c) => {
            setCloak(c);
            saveCloak(c);
          }}
          onPanicChange={(p) => {
            setPanic(p);
            savePanic(p);
          }}
          onBookmarksChange={(b) => {
            setBookmarks(b);
            saveBookmarks(b);
          }}
        />
      )}

      {bookmarks.length > 0 && activeTab && (
        <BookmarksBar
          bookmarks={bookmarks}
          onPick={(url) => navigate(activeTab.id, url)}
        />
      )}

      <OnlineUsers />
      <LiveClock />
      <FooterLinks />

      {quickCheck && (
        <QuickCheckModal
          onClose={(dontShow) => {
            setQuickCheck(false);
            if (dontShow) localStorage.setItem("prism-quickcheck-dismissed", "1");
          }}
          onMini={() => openAboutBlank()}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Wallpaper-backed skeleton that sits above the iframe while a page loads,
 * so navigation never flashes white. Fades out when the page is ready.
 */
function LoadingSkeleton({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={
        "pointer-events-none absolute inset-0 z-10 prism-wallpaper transition-opacity duration-500 " +
        (visible ? "opacity-100" : "opacity-0")
      }
    >
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-5 p-8">
        <div className="flex items-center gap-3">
          <div className="prism-skeleton h-9 w-9 rounded-full" />
          <div className="prism-skeleton h-9 w-full max-w-md rounded-full" />
        </div>
        <div className="prism-skeleton h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <div className="prism-skeleton h-28 rounded-xl" />
          <div className="prism-skeleton h-28 rounded-xl" />
          <div className="prism-skeleton h-28 rounded-xl" />
        </div>
        <div className="prism-skeleton h-4 w-2/3 rounded" />
        <div className="prism-skeleton h-4 w-1/2 rounded" />
        <div className="prism-skeleton h-4 w-3/5 rounded" />
      </div>
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
    <div className="flex items-center gap-1 border-b border-white/5 bg-background/40 px-2 pt-2 backdrop-blur">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={
              "prism-smooth group flex max-w-[220px] min-w-[140px] items-center gap-2 rounded-t-md px-3 py-1.5 text-xs " +
              (active
                ? "bg-white/5 text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground")
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
              className="prism-smooth ml-1 rounded px-1 text-muted-foreground opacity-70 hover:bg-background hover:text-foreground hover:opacity-100"
              aria-label="Close tab"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="prism-smooth ml-1 flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        aria-label="New tab"
      >
        <Plus className="h-4 w-4" />
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
    <div className="flex items-center gap-2 border-b border-white/5 bg-background/40 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1 pr-1 text-muted-foreground">
        <NavIconBtn label="Back" onClick={onBack}><ArrowLeft className="h-4 w-4" /></NavIconBtn>
        <NavIconBtn label="Forward" onClick={onForward}><ArrowRight className="h-4 w-4" /></NavIconBtn>
        <NavIconBtn label="Reload" onClick={onReload}><RotateCw className="h-4 w-4" /></NavIconBtn>
        <NavIconBtn label="Home" onClick={onHome}><HomeIcon className="h-4 w-4" /></NavIconBtn>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onNavigate(value);
        }}
        className="prism-smooth flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 backdrop-blur focus-within:border-white/30 focus-within:bg-white/[0.05]"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
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

      <div className="prism-smooth flex overflow-hidden rounded-full border border-white/10 text-[11px]">
        <button
          onClick={() => onSwitch("uv")}
          className={
            "prism-smooth px-2.5 py-1 " +
            (tab.engine === "uv"
              ? "bg-white/10 text-foreground"
              : "bg-transparent text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")
          }
        >
          UV
        </button>
        <button
          onClick={() => onSwitch("scramjet")}
          className={
            "prism-smooth px-2.5 py-1 " +
            (tab.engine === "scramjet"
              ? "bg-white/10 text-foreground"
              : "bg-transparent text-muted-foreground hover:bg-white/[0.05] hover:text-foreground")
          }
        >
          SJ
        </button>
      </div>

      <button
        onClick={onFallback}
        disabled={!tab.address}
        className="prism-smooth rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="Reload through the other engine"
      >
        ↻ Fallback
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
      className="prism-smooth flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function SideRail({
  onHome,
  onGames,
  onApps,
  onTools,
  onDiscord,
  onSettings,
  onCloak,
}: {
  onHome: () => void;
  onGames: () => void;
  onApps: () => void;
  onTools: () => void;
  onDiscord: () => void;
  onSettings: () => void;
  onCloak: () => void;
}) {
  const items: { label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { label: "Home",     icon: <HomeIcon className="h-5 w-5" />,       onClick: onHome },
    { label: "Games",    icon: <Gamepad2 className="h-5 w-5" />,       onClick: onGames },
    { label: "Apps",     icon: <Layers className="h-5 w-5" />,         onClick: onApps },
    { label: "Tools",    icon: <Wrench className="h-5 w-5" />,         onClick: onTools },
    { label: "Discord",  icon: <MessageCircle className="h-5 w-5" />,  onClick: onDiscord },
    { label: "about:blank", icon: <EyeOff className="h-5 w-5" />,      onClick: onCloak },
    { label: "Settings", icon: <SettingsIcon className="h-5 w-5" />,   onClick: onSettings },
  ];
  return (
    <nav className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-white/5 bg-black/40 p-2 backdrop-blur">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={it.onClick}
          aria-label={it.label}
          title={it.label}
          className="prism-smooth flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:-translate-y-0.5 hover:bg-white/[0.06] hover:text-foreground"
        >
          {it.icon}
        </button>
      ))}
    </nav>
  );
}

function FooterLinks() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-6 text-xs text-muted-foreground/60">
      <a href="#" className="pointer-events-auto prism-smooth hover:text-foreground">credits</a>
      <span className="text-muted-foreground/30">/</span>
      <a href="#" className="pointer-events-auto prism-smooth hover:text-foreground">dmca</a>
    </div>
  );
}

function BookmarksBar({
  bookmarks,
  onPick,
}: {
  bookmarks: Bookmark[];
  onPick: (url: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center">
      <div className="pointer-events-auto flex max-w-[80%] flex-wrap items-center gap-1 rounded-full border border-white/5 bg-black/40 px-2 py-1 text-xs backdrop-blur">
        {bookmarks.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b.url)}
            className="prism-smooth flex items-center gap-1.5 rounded-full px-2.5 py-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            title={b.url}
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(b.url)}&sz=32`}
              alt=""
              width={14}
              height={14}
              className="h-3.5 w-3.5"
              loading="lazy"
            />
            <span className="truncate max-w-[140px]">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlankTab({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const reqSeq = useRef(0);
  const shortcuts = [
    { label: "GitHub",   url: "github.com",   domain: "github.com" },
    { label: "Discord",  url: "discord.com",  domain: "discord.com" },
    { label: "YouTube",  url: "youtube.com",  domain: "youtube.com" },
    { label: "Reanime",  url: "reanime.app",  domain: "reanime.app" },
  ];
  const placeholders = [
    "barber shop",
    "anime tonight",
    "best lofi playlist",
    "github trending",
    "weather near me",
  ];
  const [ph] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)]);

  // Instant focus: typing anywhere on the page focuses the search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.length === 1 || e.key === "Backspace") inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced suggestions via the built-in /api/public/suggest relay.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    const v = q.trim();
    if (!v || /^https?:\/\//i.test(v)) {
      setSugs([]);
      setOpen(false);
      setHi(-1);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const seq = ++reqSeq.current;
      try {
        const res = await fetch(`/api/public/suggest?q=${encodeURIComponent(v)}`);
        const list = (await res.json()) as string[];
        if (seq !== reqSeq.current) return;
        setSugs(list);
        setOpen(list.length > 0);
        setHi(-1);
      } catch {
        /* suggestions are best-effort */
      }
    }, 140);
    return () => window.clearTimeout(debounceRef.current);
  }, [q]);

  function go(value: string) {
    const v = value.trim();
    if (!v || leaving) return;
    setLeaving(true);
    setOpen(false);
    window.setTimeout(() => onPick(v), 180);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    go(hi >= 0 && sugs[hi] ? sugs[hi] : q);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || sugs.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => (h + 1) % sugs.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => (h <= 0 ? sugs.length - 1 : h - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setHi(-1);
    }
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center prism-wallpaper">
      <div
        className={
          "prism-enter flex w-full max-w-3xl flex-col items-center " +
          (leaving ? "prism-leave" : "")
        }
      >
        <h1
          className="select-none text-5xl font-bold tracking-tight text-foreground/90 sm:text-7xl"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
        >
          Welcome to Prism
        </h1>

        <div className="relative mt-14 w-full">
          <form
            onSubmit={submit}
            className="prism-smooth flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-black/40 px-6 py-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur focus-within:border-white/15 focus-within:bg-black/50"
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => sugs.length > 0 && setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              placeholder="Search DuckDuckGo or type an URL"
              className="w-full bg-transparent text-center text-lg italic outline-none placeholder:text-muted-foreground/70"
              autoFocus
              spellCheck={false}
            />
          </form>

          {open && (
            <div
              className="prism-enter absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-popover/95 py-1.5 text-left shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur"
              style={{ animationDuration: "180ms" }}
            >
              {sugs.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(s);
                  }}
                  onMouseEnter={() => setHi(i)}
                  className={
                    "prism-smooth flex w-full items-center gap-3 px-5 py-2.5 text-sm " +
                    (i === hi
                      ? "bg-white/[0.07] text-foreground"
                      : "text-muted-foreground")
                  }
                >
                  <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground/60">{ph}</p>

        <div className="mt-14 flex flex-wrap items-start justify-center gap-6">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              onClick={() => go(s.url)}
              className="prism-smooth group flex w-20 flex-col items-center gap-2"
            >
              <span className="prism-smooth flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] group-hover:-translate-y-0.5 group-hover:border-white/20 group-hover:bg-white/[0.06]">
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
    </div>
  );
}

function SettingsSheet({
  settings,
  cloak,
  panic,
  bookmarks,
  onClose,
  onSave,
  onCloakChange,
  onPanicChange,
  onBookmarksChange,
}: {
  settings: ProxySettings;
  cloak: CloakConfig;
  panic: PanicConfig;
  bookmarks: Bookmark[];
  onClose: () => void;
  onSave: (s: ProxySettings) => void;
  onCloakChange: (c: CloakConfig) => void;
  onPanicChange: (p: PanicConfig) => void;
  onBookmarksChange: (b: Bookmark[]) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [clearing, setClearing] = useState(false);
  const [bmLabel, setBmLabel] = useState("");
  const [bmUrl, setBmUrl] = useState("");

  async function clearData() {
    setClearing(true);
    try {
      await clearProxyState();
    } finally {
      window.location.reload();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="prism-enter max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-primary/20 bg-card/90 p-6 shadow-2xl backdrop-blur">
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

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Accent
            </label>
            <div className="mt-2 flex gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setDraft({ ...draft, accent: a.id })}
                  title={a.label}
                  aria-label={a.label}
                  className={
                    "prism-smooth h-8 w-8 rounded-full border-2 " +
                    (draft.accent === a.id
                      ? "scale-110 border-foreground"
                      : "border-transparent opacity-70 hover:opacity-100")
                  }
                  style={{ background: a.swatch }}
                />
              ))}
            </div>
          </div>

          {/* Cloaking */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tab cloak
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(CLOAK_PRESETS) as CloakPreset[]).map((k) => (
                <button
                  key={k}
                  onClick={() => onCloakChange({ ...cloak, preset: k })}
                  className={
                    "prism-smooth rounded-md border px-2 py-1.5 text-xs " +
                    (cloak.preset === k
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-secondary")
                  }
                >
                  {CLOAK_PRESETS[k].label}
                </button>
              ))}
            </div>
          </div>

          {/* Panic key */}
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-sm">Panic key</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Press this key anywhere to redirect away instantly.
            </p>
            <div className="mt-2 grid grid-cols-[80px_1fr] gap-2">
              <input
                value={panic.key}
                onChange={(e) => onPanicChange({ ...panic, key: e.target.value.slice(0, 12) })}
                placeholder="`"
                className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-center text-sm outline-none"
              />
              <input
                value={panic.url}
                onChange={(e) => onPanicChange({ ...panic, url: e.target.value })}
                placeholder="https://classroom.google.com/"
                className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none"
              />
            </div>
          </div>

          {/* Bookmarks */}
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-sm">Bookmarks</p>
            <div className="mt-2 space-y-1.5">
              {bookmarks.length === 0 && (
                <p className="text-xs text-muted-foreground">No bookmarks yet.</p>
              )}
              {bookmarks.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-1 text-xs"
                >
                  <Star className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">{b.label}</span>
                  <span className="ml-auto truncate text-muted-foreground">{b.url}</span>
                  <button
                    onClick={() => onBookmarksChange(bookmarks.filter((x) => x.id !== b.id))}
                    className="rounded p-0.5 text-muted-foreground hover:bg-background"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <input
                value={bmLabel}
                onChange={(e) => setBmLabel(e.target.value)}
                placeholder="Label"
                className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none"
              />
              <input
                value={bmUrl}
                onChange={(e) => setBmUrl(e.target.value)}
                placeholder="https://…"
                className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none"
              />
              <button
                onClick={() => {
                  if (!bmLabel.trim() || !bmUrl.trim()) return;
                  onBookmarksChange([
                    ...bookmarks,
                    { id: crypto.randomUUID(), label: bmLabel.trim(), url: bmUrl.trim() },
                  ]);
                  setBmLabel("");
                  setBmUrl("");
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>

          <button
            onClick={() => openAboutBlank()}
            className="prism-smooth flex w-full items-center justify-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            <ExternalLink className="h-4 w-4" />
            Open in about:blank
          </button>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
            <div>
              <p className="text-sm">Reduced motion</p>
              <p className="text-xs text-muted-foreground">
                Turn off animations and transitions.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={draft.reducedMotion}
              onClick={() => setDraft({ ...draft, reducedMotion: !draft.reducedMotion })}
              className={
                "prism-smooth relative h-6 w-11 shrink-0 rounded-full " +
                (draft.reducedMotion ? "bg-primary" : "bg-secondary")
              }
            >
              <span
                className={
                  "prism-smooth absolute top-0.5 h-5 w-5 rounded-full bg-background " +
                  (draft.reducedMotion ? "left-[22px]" : "left-0.5")
                }
              />
            </button>
          </div>

          <button
            onClick={clearData}
            disabled={clearing}
            className="prism-smooth flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {clearing ? "Clearing…" : "Clear proxy & cache data"}
          </button>
          <p className="-mt-3 text-xs text-muted-foreground">
            Unregisters the service worker, wipes caches and engine storage, then reloads.
          </p>
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