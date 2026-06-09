import { createFileRoute } from "@tanstack/react-router";

/**
 * Minimal TompHTTP Bare Server v3 implementation running on the same
 * Cloudflare Worker that serves the app. Free, no external host required.
 *
 * Spec: https://github.com/tomphttp/specifications/blob/master/BareServer.md
 *
 * Endpoint: /api/public/bare/v3/  (clients hit this exact URL with x-bare-* headers)
 */

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
  "access-control-max-age": "7200",
};

function jsonError(code: string, id: string, status = 400, message?: string) {
  return new Response(
    JSON.stringify({ code, id, message }),
    { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
}

function indexResponse() {
  return new Response(
    JSON.stringify({
      versions: ["v3"],
      language: "JavaScript",
      memoryUsage: 0,
      maintainer: { email: "noreply@example.com", website: "https://lovable.dev" },
      project: {
        name: "prism-bare",
        version: "1.0.0",
        repository: "https://github.com/tomphttp/specifications",
        description: "Embedded bare-v3 server for Prism (Cloudflare Worker).",
      },
    }),
    { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
}

async function handleProxy(request: Request): Promise<Response> {
  const targetUrl = request.headers.get("x-bare-url");
  const headersJson = request.headers.get("x-bare-headers");
  if (!targetUrl || !headersJson) {
    return jsonError("MISSING_BARE_HEADER", "bare.headers", 400);
  }

  let remoteHeaders: Record<string, string>;
  let forwardList: string[];
  let passHeaders: string[];
  let passStatus: number[];
  try {
    remoteHeaders = JSON.parse(headersJson);
    forwardList = JSON.parse(request.headers.get("x-bare-forward-headers") ?? "[]");
    passHeaders = JSON.parse(request.headers.get("x-bare-pass-headers") ?? "[]");
    passStatus = JSON.parse(request.headers.get("x-bare-pass-status") ?? "[]");
  } catch {
    return jsonError("INVALID_BARE_HEADER", "bare.headers", 400);
  }

  // Merge any headers the client asked us to forward verbatim from its request.
  for (const name of forwardList) {
    const val = request.headers.get(name);
    if (val !== null) remoteHeaders[name] = val;
  }
  delete remoteHeaders.host;
  delete remoteHeaders["content-length"];

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: remoteHeaders,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  } catch (err) {
    return jsonError(
      "FETCH_FAILED",
      "bare.fetch",
      500,
      err instanceof Error ? err.message : String(err),
    );
  }

  const upstreamHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    upstreamHeaders[k] = v;
  });

  const responseHeaders = new Headers(CORS_HEADERS);
  responseHeaders.set("x-bare-status", String(upstream.status));
  responseHeaders.set("x-bare-status-text", upstream.statusText || "");

  // Headers the client wants exposed normally rather than wrapped in x-bare-headers.
  const remaining = { ...upstreamHeaders };
  for (const name of passHeaders) {
    const lower = name.toLowerCase();
    if (lower in remaining) {
      responseHeaders.append(lower, remaining[lower]);
      delete remaining[lower];
    }
  }
  responseHeaders.set("x-bare-headers", JSON.stringify(remaining));

  const status = passStatus.includes(upstream.status) ? upstream.status : 200;
  return new Response(upstream.body, { status, headers: responseHeaders });
}

async function dispatch({ request }: { request: Request }): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.headers.get("x-bare-url")) {
    return handleProxy(request);
  }
  return indexResponse();
}

export const Route = createFileRoute("/api/public/bare/v3/$")({
  server: {
    handlers: {
      GET: dispatch,
      POST: dispatch,
      PUT: dispatch,
      DELETE: dispatch,
      PATCH: dispatch,
      HEAD: dispatch,
      OPTIONS: dispatch,
    },
  },
});