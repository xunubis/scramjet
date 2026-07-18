import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_suggestions",
  title: "Search suggestions",
  description: "Fetch DuckDuckGo autocomplete suggestions for a query, matching the Prism search bar.",
  inputSchema: {
    query: z.string().min(1).describe("Partial search query"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query }) => {
    try {
      const res = await fetch(
        `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `DuckDuckGo returned ${res.status}` }],
          isError: true,
        };
      }
      const data = (await res.json()) as [string, string[]];
      const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
      return {
        content: [{ type: "text", text: JSON.stringify(suggestions) }],
        structuredContent: { suggestions },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to fetch suggestions: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
});
