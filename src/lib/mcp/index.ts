import { defineMcp } from "@lovable.dev/mcp-js";
import encodeUrlTool from "./tools/encode-url";
import listEnginesTool from "./tools/list-engines";
import suggestTool from "./tools/suggest";

export default defineMcp({
  name: "prism-proxy-mcp",
  title: "Prism Proxy",
  version: "0.1.0",
  instructions:
    "Tools for the Prism web proxy. Use `list_engines` to see supported proxy engines and versions, `encode_proxy_url` to build a proxied URL for a target site, and `search_suggestions` for DuckDuckGo autocomplete matching the Prism search bar.",
  tools: [listEnginesTool, encodeUrlTool, suggestTool],
});
