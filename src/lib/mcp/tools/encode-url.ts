import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

function xorEncode(str: string): string {
  // Matches Ultraviolet's built-in xor codec (Ultraviolet.codec.xor.encode).
  if (!str) return str;
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    out += i % 2 ? String.fromCharCode(str.charCodeAt(i) ^ 2) : c;
  }
  return encodeURIComponent(out);
}

export default defineTool({
  name: "encode_proxy_url",
  title: "Encode proxy URL",
  description:
    "Given a target URL and a Prism deployment origin, return the full proxied URL you can open to browse the target through Prism's Ultraviolet engine.",
  inputSchema: {
    url: z.string().url().describe("The absolute target URL to proxy, e.g. https://example.com/"),
    origin: z
      .string()
      .url()
      .describe("The Prism deployment origin, e.g. https://scramjet.lovable.app"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ url, origin }) => {
    const cleanOrigin = origin.replace(/\/+$/, "");
    const proxied = `${cleanOrigin}/uv/service/${xorEncode(url)}`;
    return {
      content: [{ type: "text", text: proxied }],
      structuredContent: { proxiedUrl: proxied, engine: "uv" },
    };
  },
});
