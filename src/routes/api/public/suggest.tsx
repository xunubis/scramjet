import { createFileRoute } from "@tanstack/react-router";

/**
 * Search-suggestion relay. The browser can't hit DuckDuckGo's autocomplete
 * endpoint directly (no CORS), so we proxy it from the Worker.
 *
 *   GET /api/public/suggest?q=hello  ->  ["hello", "hello world", ...]
 */
export const Route = createFileRoute("/api/public/suggest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
        if (!q || q.length > 200) {
          return Response.json([], {
            headers: { "access-control-allow-origin": "*" },
          });
        }
        try {
          const upstream = await fetch(
            `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`,
            { headers: { accept: "application/json" } },
          );
          const data = (await upstream.json()) as [string, string[]];
          const list = Array.isArray(data?.[1]) ? data[1].slice(0, 8) : [];
          return Response.json(list, {
            headers: {
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=300",
            },
          });
        } catch {
          return Response.json([], {
            headers: { "access-control-allow-origin": "*" },
          });
        }
      },
    },
  },
});