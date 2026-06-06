import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prism — Web Proxy (Ultraviolet + Scramjet)" },
      {
        name: "description",
        content:
          "A dual-engine web proxy frontend. Switch between Ultraviolet and Scramjet per tab, with manual fallback.",
      },
      { property: "og:title", content: "Prism — Web Proxy" },
      {
        property: "og:description",
        content: "Dual-engine web proxy with Ultraviolet + Scramjet.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(800px circle at 20% -10%, oklch(0.78 0.16 200 / 0.25), transparent 60%), radial-gradient(700px circle at 90% 110%, oklch(0.68 0.22 320 / 0.25), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-md"
            style={{ background: "var(--gradient-aurora)", boxShadow: "var(--shadow-glow)" }}
          />
          <span className="text-lg font-semibold tracking-tight">Prism</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#engines" className="hover:text-foreground">Engines</a>
          <a href="#setup" className="hover:text-foreground">Setup</a>
          <Link
            to="/app"
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
          >
            Launch
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-32">
        <p
          className="mb-6 inline-block rounded-full border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Ultraviolet · Scramjet · Dual-engine
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          One browser shell.{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-aurora)" }}
          >
            Two proxy engines.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Browse through{" "}
          <span className="text-foreground">Ultraviolet</span> for fast,
          lightweight rewriting, or switch any tab to{" "}
          <span className="text-foreground">Scramjet</span> for sites that need
          a more aggressive runtime. Manual fallback in one click.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/app"
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            style={{ boxShadow: "var(--shadow-glow)" }}
          >
            Open the proxy →
          </Link>
          <a
            href="#setup"
            className="rounded-md border border-border px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-secondary"
          >
            Configure bare server
          </a>
        </div>

        <section id="engines" className="mt-28 grid gap-6 md:grid-cols-2">
          <EngineCard
            name="Ultraviolet"
            tag="UV"
            description="Battle-tested service-worker proxy from Titanium Network. Lean, fast, great default for most sites."
            points={["Service worker rewriter", "XOR URL encoding", "Lightweight client bundle"]}
          />
          <EngineCard
            name="Scramjet"
            tag="SJ"
            description="MercuryWorkshop's newer engine with stricter runtime emulation — better for stubborn JS-heavy targets."
            points={["WASM-accelerated rewriter", "Aggressive scope isolation", "Modern API surface"]}
          />
        </section>

        <section id="setup" className="mt-28 rounded-2xl border border-border bg-card p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Bring your own bare server</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            This frontend runs entirely in your browser via service workers. The
            actual HTTP fetching happens through a{" "}
            <span className="text-foreground">bare server</span> (TompHTTP) that
            you host yourself — both engines speak the bare v3 protocol.
          </p>
          <ol className="mt-6 space-y-3 text-sm text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
            <li>
              <span className="text-primary">1.</span> Deploy{" "}
              <code className="text-foreground">@tomphttp/bare-server-node</code>{" "}
              on a VPS / Render / Fly.
            </li>
            <li>
              <span className="text-primary">2.</span> Open{" "}
              <Link to="/app" className="text-foreground underline">/app</Link>{" "}
              → Settings → paste your bare URL.
            </li>
            <li>
              <span className="text-primary">3.</span> Pick the engine per tab.
              Hit the fallback button if a site breaks.
            </li>
          </ol>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border py-6 text-center text-xs text-muted-foreground">
        Use responsibly. You are responsible for what you proxy.
      </footer>
    </div>
  );
}

function EngineCard({
  name,
  tag,
  description,
  points,
}: {
  name: string;
  tag: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold tracking-tight">{name}</h3>
        <span
          className="rounded-md px-2 py-0.5 text-xs font-bold"
          style={{ background: "var(--gradient-aurora)", color: "var(--primary-foreground)" }}
        >
          {tag}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-foreground/90">
            <span className="text-primary">▸</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
