import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_engines",
  title: "List proxy engines",
  description: "List the web-proxy engines this Prism deployment supports and their current versions.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            engines: [
              { id: "uv", name: "Ultraviolet", version: "3.2.7", transport: "epoxy (bare-mux)" },
              { id: "scramjet", name: "Scramjet", version: "2.0.67-alpha.1", transport: "wisp (bare-mux)" },
            ],
          },
          null,
          2,
        ),
      },
    ],
  }),
});
