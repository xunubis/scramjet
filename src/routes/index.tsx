import { createFileRoute } from "@tanstack/react-router";
import { ProxyApp } from "@/components/proxy-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prism — Web Proxy" },
      {
        name: "description",
        content:
          "Dual-engine web proxy (Ultraviolet + Scramjet) with a built-in bare server.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Prism — Web Proxy" },
      {
        property: "og:description",
        content:
          "Dual-engine web proxy (Ultraviolet + Scramjet) with a built-in bare server.",
      },
    ],
  }),
  component: ProxyApp,
});